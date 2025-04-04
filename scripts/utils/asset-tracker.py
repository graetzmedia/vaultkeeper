#!/usr/bin/env python3
"""
Media Asset Tracking System
---------------------------
A tool to catalog drives, create searchable metadata, and generate QR codes for physical media tracking.
"""

import os
import sys
import hashlib
import sqlite3
import datetime
import argparse
import json
import subprocess
import qrcode
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import mimetypes
import uuid
import tempfile
import whisper
import threading
from concurrent.futures import ThreadPoolExecutor

# Initialize mime types
mimetypes.init()

# Database setup
DB_PATH = os.path.expanduser("~/media-asset-tracker/asset-db.sqlite")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def init_db():
    """Initialize the SQLite database with proper schema"""
    # Use a longer timeout and enable WAL mode for better concurrency
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.execute('PRAGMA journal_mode=WAL')
    cursor = conn.cursor()
    
    # Drives table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS drives (
        id TEXT PRIMARY KEY,
        label TEXT,
        volume_name TEXT,
        size_bytes INTEGER,
        free_bytes INTEGER,
        format TEXT,
        mount_point TEXT,
        date_cataloged TEXT,
        last_verified TEXT,
        notes TEXT,
        qr_code_path TEXT
    )
    ''')
    
    # Files table with metadata - add thumbnail_path field if it doesn't exist
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        drive_id TEXT,
        path TEXT,
        filename TEXT,
        extension TEXT,
        size_bytes INTEGER,
        date_created TEXT,
        date_modified TEXT,
        checksum TEXT,
        mime_type TEXT,
        media_info TEXT,
        thumbnail_path TEXT,
        transcription TEXT,
        transcription_status TEXT,
        transcription_date TEXT,
        FOREIGN KEY (drive_id) REFERENCES drives (id)
    )
    ''')
    
    # Create indexes for better performance
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_files_drive_id ON files (drive_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_files_extension ON files (extension)')
    
    # Check if required columns exist, if not add them
    cursor.execute("PRAGMA table_info(files)")
    columns = cursor.fetchall()
    column_names = [column[1] for column in columns]
    
    if 'thumbnail_path' not in column_names:
        print("Adding thumbnail_path column to files table...")
        cursor.execute("ALTER TABLE files ADD COLUMN thumbnail_path TEXT")
    
    if 'transcription' not in column_names:
        print("Adding transcription columns to files table...")
        cursor.execute("ALTER TABLE files ADD COLUMN transcription TEXT")
        cursor.execute("ALTER TABLE files ADD COLUMN transcription_status TEXT")
        cursor.execute("ALTER TABLE files ADD COLUMN transcription_date TEXT")
    
    # Projects table to organize files
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT,
        client TEXT,
        date_created TEXT,
        date_completed TEXT,
        notes TEXT
    )
    ''')
    
    # Project to file mapping (many-to-many)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS project_files (
        project_id TEXT,
        file_id TEXT,
        PRIMARY KEY (project_id, file_id),
        FOREIGN KEY (project_id) REFERENCES projects (id),
        FOREIGN KEY (file_id) REFERENCES files (id)
    )
    ''')
    
    # Create indexes for faster searching
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_files_filename ON files (filename)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_files_extension ON files (extension)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_projects_name ON projects (name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_projects_client ON projects (client)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_files_transcription ON files (transcription_status)')
    
    conn.commit()
    conn.close()

def check_for_duplicate_drive(volume_name, mount_point, size_bytes, conn=None):
    """
    Check if a drive with the same volume name already exists in the database
    Returns the drive info if found, None otherwise
    """
    close_conn = False
    if conn is None:
        conn = sqlite3.connect(DB_PATH, timeout=60.0)
        conn.execute('PRAGMA journal_mode=WAL')
        close_conn = True
    
    cursor = conn.cursor()
    
    # Check by volume name
    cursor.execute("SELECT * FROM drives WHERE volume_name = ?", (volume_name,))
    drive_rows = cursor.fetchall()
    
    if drive_rows:
        # Convert rows to dictionaries
        column_names = [description[0] for description in cursor.description]
        results = []
        
        for row in drive_rows:
            drive_dict = {column_names[i]: row[i] for i in range(len(column_names))}
            results.append(drive_dict)
        
        if close_conn:
            conn.close()
        
        return results
    
    if close_conn:
        conn.close()
    
    return None

def handle_duplicate_drive(duplicate_drives, new_drive_info, batch_mode=False, default_choice=None):
    """
    Handle duplicate drive entries - interactive mode to merge or replace
    
    Args:
        duplicate_drives: List of duplicate drive entries found in database
        new_drive_info: Information about the new drive being cataloged
        batch_mode: If True, indicates we're running in batch mode (affects output)
        default_choice: In batch mode, a predetermined choice to use (1=replace, 2=new, 3=skip)
    
    Returns:
        updated drive_info to use, or None to skip this drive
    """
    drive_name = new_drive_info['volume_name']
    mount_point = new_drive_info.get('mount_point', 'Unknown')
    
    if batch_mode:
        print(f"\n==== DUPLICATE DRIVE DETECTED: {drive_name} ({mount_point}) ====")
    else:
        print("\n==== DUPLICATE DRIVE DETECTED ====")
        print(f"The drive '{drive_name}' has been cataloged before.")
    
    print(f"Found {len(duplicate_drives)} previous entries:")
    
    for i, drive in enumerate(duplicate_drives):
        catalog_date = drive.get('date_cataloged', 'Unknown date')
        # Try to parse ISO date format for better display
        try:
            date_obj = datetime.datetime.fromisoformat(catalog_date)
            catalog_date = date_obj.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            pass
            
        # Show essential information
        print(f"{i+1}. ID: {drive.get('id')}")
        print(f"   Label: {drive.get('label') or drive.get('volume_name')}")
        print(f"   Size: {drive.get('size_bytes', 0) / (1024**3):.2f} GB")
        print(f"   Cataloged: {catalog_date}")
        print(f"   Files: {get_file_count_for_drive(drive.get('id'))}")
        print()
    
    # If we have a default choice in batch mode, use it
    if batch_mode and default_choice:
        choice = str(default_choice)
        print(f"Using predetermined choice in batch mode: {choice}")
    else:
        # Interactive selection
        print("Options:")
        print("1) Replace one of the existing entries (keeps the same drive ID)")
        print("2) Create a new entry (will result in duplicate entries)")
        print("3) " + ("Skip this drive" if batch_mode else "Cancel operation"))
        
        choice = input("\nYour choice (1-3): ").strip()
    
    if choice == "1":
        if len(duplicate_drives) == 1:
            drive_to_replace = duplicate_drives[0]
        else:
            if batch_mode and default_choice:
                # In batch mode with a default choice, always use the first entry for simplicity
                drive_to_replace = duplicate_drives[0]
                print(f"Using first entry (ID: {drive_to_replace['id']}) in batch mode")
            else:
                replace_idx = input(f"Which entry to replace (1-{len(duplicate_drives)}): ").strip()
                try:
                    idx = int(replace_idx) - 1
                    if 0 <= idx < len(duplicate_drives):
                        drive_to_replace = duplicate_drives[idx]
                    else:
                        print("Invalid selection, creating new entry")
                        return new_drive_info
                except ValueError:
                    print("Invalid input, creating new entry")
                    return new_drive_info
        
        # Keep the existing ID and add any custom label that was previously set
        new_drive_info["id"] = drive_to_replace["id"]
        if drive_to_replace.get("label") and drive_to_replace["label"] != drive_to_replace["volume_name"]:
            if not new_drive_info.get("label"):
                print(f"Using previous custom label: {drive_to_replace['label']}")
                new_drive_info["label"] = drive_to_replace["label"]
            else:
                print(f"Keeping new label: {new_drive_info['label']}")
        
        # Clear existing files (optional - confirm with user unless in batch mode)
        if batch_mode and default_choice:
            # In automatic batch mode, don't clear files by default for safety
            clear_files = 'n'
            print("Batch mode: Keeping existing files (safer option)")
        else:
            clear_files = input("Clear existing files for this drive? (y/n): ").strip().lower()
            
        if clear_files == 'y':
            delete_files_for_drive(drive_to_replace["id"])
            print(f"Deleted existing files for drive {drive_to_replace['id']}")
        else:
            print("Keeping existing files - new/changed files will be updated")
        
        print(f"Replacing drive entry with ID: {new_drive_info['id']}")
        return new_drive_info
    
    elif choice == "2":
        print("Creating a new drive entry")
        return new_drive_info
    
    else:  # choice == "3" or any other input
        if batch_mode:
            print(f"Skipping drive: {drive_name}")
        else:
            print("Canceling operation")
        return None

def get_file_count_for_drive(drive_id):
    """Get the number of files cataloged for a given drive"""
    try:
        conn = sqlite3.connect(DB_PATH, timeout=60.0)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM files WHERE drive_id = ?", (drive_id,))
        count = cursor.fetchone()[0]
        conn.close()
        return count
    except Exception as e:
        print(f"Error getting file count: {e}")
        return 0

def delete_files_for_drive(drive_id):
    """Delete all files associated with a drive"""
    try:
        conn = sqlite3.connect(DB_PATH, timeout=60.0)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM files WHERE drive_id = ?", (drive_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error deleting files: {e}")

def get_drive_info(mount_point, batch_mode=False, duplicate_choice=None):
    """
    Get drive information at the specified mount point
    
    Args:
        mount_point: Mount point of the drive
        batch_mode: Whether we're running in batch mode (affects duplicate handling)
        duplicate_choice: In batch mode, how to handle duplicates (1=replace, 2=new, 3=skip)
    
    Returns:
        Drive info dictionary or None if canceled/skipped
    """
    if not os.path.exists(mount_point):
        print(f"Error: Mount point {mount_point} does not exist")
        return None
    
    # Get volume name (works on macOS, Linux has different methods)
    volume_name = os.path.basename(mount_point)
    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["diskutil", "info", mount_point], 
                capture_output=True, 
                text=True
            )
            for line in result.stdout.splitlines():
                if "Volume Name" in line:
                    volume_name = line.split(":", 1)[1].strip()
                    break
        except Exception as e:
            print(f"Error getting volume name: {e}")
    
    # Get drive space details
    stat = os.statvfs(mount_point)
    size_bytes = stat.f_blocks * stat.f_frsize
    free_bytes = stat.f_bavail * stat.f_frsize
    
    # Try to determine drive format
    format_type = "Unknown"
    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["diskutil", "info", mount_point], 
                capture_output=True, 
                text=True
            )
            for line in result.stdout.splitlines():
                if "File System Personality" in line:
                    format_type = line.split(":", 1)[1].strip()
                    break
        except Exception as e:
            print(f"Error getting file system type: {e}")
    elif sys.platform.startswith("linux"):
        try:
            result = subprocess.run(
                ["df", "-T", mount_point], 
                capture_output=True, 
                text=True
            )
            format_type = result.stdout.splitlines()[1].split()[1]
        except Exception as e:
            print(f"Error getting file system type: {e}")
    
    drive_info = {
        "id": str(uuid.uuid4()),
        "volume_name": volume_name,
        "size_bytes": size_bytes,
        "free_bytes": free_bytes,
        "format": format_type,
        "mount_point": mount_point,
        "date_cataloged": datetime.datetime.now().isoformat()
    }
    
    # Check for duplicates
    duplicates = check_for_duplicate_drive(volume_name, mount_point, size_bytes)
    if duplicates:
        # Handle duplicates (via user interaction or using batch defaults)
        updated_info = handle_duplicate_drive(
            duplicates, 
            drive_info,
            batch_mode=batch_mode,
            default_choice=duplicate_choice
        )
        return updated_info
    
    return drive_info

def calculate_checksum(file_path, algorithm="md5", buffer_size=8192):
    """Calculate file checksum using specified algorithm"""
    hash_algo = getattr(hashlib, algorithm)()
    
    try:
        with open(file_path, "rb") as f:
            buffer = f.read(buffer_size)
            while buffer:
                hash_algo.update(buffer)
                buffer = f.read(buffer_size)
        return hash_algo.hexdigest()
    except Exception as e:
        print(f"Error calculating checksum for {file_path}: {e}")
        return None

def get_media_info(file_path):
    """Extract media metadata using ffprobe (if installed)"""
    try:
        # Check if ffprobe is available
        subprocess.run(
            ["ffprobe", "-version"], 
            capture_output=True, 
            check=True
        )
        
        # Extract media info
        result = subprocess.run(
            [
                "ffprobe", 
                "-v", "quiet", 
                "-print_format", "json", 
                "-show_format", 
                "-show_streams", 
                file_path
            ],
            capture_output=True,
            text=True,
            check=True
        )
        
        return result.stdout
    except subprocess.CalledProcessError:
        return None
    except FileNotFoundError:
        # ffprobe not installed
        return None

def generate_video_thumbnail(video_path, output_dir=None, width=320, height=240):
    """
    Generate a thumbnail from a video file by extracting a frame from the middle
    
    Args:
        video_path: Path to the video file
        output_dir: Directory to save thumbnail (defaults to media-asset-tracker/thumbnails)
        width: Thumbnail width
        height: Thumbnail height
        
    Returns:
        Path to the generated thumbnail or None if failed
    """
    try:
        # Check if file is an R3D file
        if video_path.lower().endswith('.r3d'):
            return generate_r3d_thumbnail(video_path, output_dir, width, height)
            
        # For other video formats, use ffmpeg
        # Check if ffmpeg is available
        subprocess.run(
            ["ffmpeg", "-version"], 
            capture_output=True, 
            check=True
        )
        
        # Get video duration using ffprobe
        duration_result = subprocess.run(
            [
                "ffprobe", 
                "-v", "error", 
                "-show_entries", "format=duration", 
                "-of", "default=noprint_wrappers=1:nokey=1", 
                video_path
            ],
            capture_output=True,
            text=True,
            check=True
        )
        
        try:
            duration = float(duration_result.stdout.strip())
        except (ValueError, TypeError):
            # If duration cannot be determined, assume 30 seconds
            duration = 30.0
        
        # Calculate the middle point
        middle_time = duration / 2
        
        # Create thumbnails directory if it doesn't exist
        if output_dir is None:
            output_dir = os.path.expanduser("~/media-asset-tracker/thumbnails")
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate unique thumbnail filename
        file_basename = os.path.basename(video_path)
        thumbnail_name = f"{os.path.splitext(file_basename)[0]}_{uuid.uuid4().hex[:8]}.jpg"
        thumbnail_path = os.path.join(output_dir, thumbnail_name)
        
        # Extract the frame
        subprocess.run(
            [
                "ffmpeg", 
                "-y",  # Overwrite output files
                "-ss", str(middle_time),  # Seek to middle position
                "-i", video_path,  # Input file
                "-vframes", "1",  # Extract one frame
                "-q:v", "2",  # Quality (2 is high, 31 is low)
                "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",  # Scale and pad
                thumbnail_path  # Output file
            ],
            capture_output=True,
            check=True
        )
        
        return thumbnail_path
    except subprocess.CalledProcessError as e:
        print(f"Error generating thumbnail: {e}")
        return None
    except FileNotFoundError:
        # ffmpeg not installed
        print("ffmpeg not found - thumbnail generation skipped")
        return None
    except Exception as e:
        print(f"Unexpected error generating thumbnail: {e}")
        return None

def generate_r3d_thumbnail(r3d_path, output_dir=None, width=320, height=240):
    """
    Generate a thumbnail from an R3D file using ffmpeg
    
    Args:
        r3d_path: Path to the R3D file
        output_dir: Directory to save thumbnail (defaults to media-asset-tracker/thumbnails)
        width: Thumbnail width
        height: Thumbnail height
        
    Returns:
        Path to the generated thumbnail or None if failed
    """
    # R3D files can be large and cause database locking issues
    # Skip thumbnail generation if the file is too large
    try:
        file_size = os.path.getsize(r3d_path)
        # If larger than 1GB, skip thumbnail generation
        if file_size > 1024*1024*1024:
            print(f"Skipping thumbnail for large R3D file ({file_size/(1024**3):.2f} GB): {r3d_path}")
            return None
    except Exception as e:
        print(f"Error checking R3D file size: {e}")
    
    # Note: The RED SDK integration requires compilation with specific flags
    # For now, we'll use a more compatible ffmpeg approach for R3D files
    print(f"Generating thumbnail for R3D file: {r3d_path}")
    
    try:
        # Create output directory if it doesn't exist
        if output_dir is None:
            output_dir = os.path.expanduser("~/media-asset-tracker/thumbnails")
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate unique thumbnail filename
        file_basename = os.path.basename(r3d_path)
        thumbnail_name = f"{os.path.splitext(file_basename)[0]}_{uuid.uuid4().hex[:8]}.jpg"
        thumbnail_path = os.path.join(output_dir, thumbnail_name)
        
        # Try different ffmpeg flags for R3D compatibility
        print("Trying specialized ffmpeg flags for R3D files...")
        try:
            # First attempt: Use special flags for RED files
            subprocess.run(
                [
                    "ffmpeg", 
                    "-y",  # Overwrite output files
                    "-vsync", "0",  # Avoid frame rate sync issues
                    "-probesize", "100M",  # Larger probe size for complex formats
                    "-analyzeduration", "100M",  # Longer analyze duration
                    "-i", r3d_path,  # Input file
                    "-vframes", "1",  # Extract one frame
                    "-q:v", "2",  # Quality (2 is high, 31 is low)
                    "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",  # Scale and pad
                    thumbnail_path  # Output file
                ],
                capture_output=True,
                check=True,
                timeout=60  # Add timeout to avoid hanging
            )
            
            # Verify the thumbnail was created successfully
            if os.path.exists(thumbnail_path) and os.path.getsize(thumbnail_path) > 0:
                print(f"Successfully created R3D thumbnail: {thumbnail_path}")
                return thumbnail_path
        except subprocess.TimeoutExpired:
            print("Thumbnail generation timed out, trying simpler approach...")
        except Exception as e:
            print(f"First ffmpeg attempt failed: {e}")
            
        # Second attempt: Use simpler ffmpeg command
        try:
            subprocess.run(
                [
                    "ffmpeg", 
                    "-y",  # Overwrite output files
                    "-i", r3d_path,  # Input file
                    "-vframes", "1",  # Extract one frame
                    thumbnail_path  # Output file
                ],
                capture_output=True,
                check=True,
                timeout=60  # Add timeout to avoid hanging
            )
            
            # Verify the thumbnail was created successfully
            if os.path.exists(thumbnail_path) and os.path.getsize(thumbnail_path) > 0:
                print(f"Successfully created R3D thumbnail with simpler command: {thumbnail_path}")
                return thumbnail_path
        except subprocess.TimeoutExpired:
            print("Second thumbnail attempt timed out")
        except Exception as e:
            print(f"Second ffmpeg attempt failed: {e}")
        
        # If we get to this point, thumbnail generation failed with both methods
        print(f"Could not generate thumbnail for {file_basename}, skipping")
        return None
        
    except Exception as e:
        print(f"Error in thumbnail generation process: {e}")
        return None

def transcribe_audio(file_path, language="auto", model_size="base"):
    """
    Generate transcription for audio or video file using Whisper
    
    Args:
        file_path: Path to the audio or video file
        language: Language code or "auto" for automatic detection
        model_size: Whisper model size (tiny, base, small, medium, large)
        
    Returns:
        Dictionary with transcription data or None if failed
    """
    try:
        print(f"Loading Whisper model '{model_size}'...")
        model = whisper.load_model(model_size)
        
        # Check if file is an audio file or needs extraction
        mime_type = mimetypes.guess_type(file_path)[0] or ""
        
        # For video files or RED files, extract audio first
        if mime_type.startswith("video/") or file_path.lower().endswith('.r3d'):
            print(f"Extracting audio from {os.path.basename(file_path)}...")
            
            # Create a temporary WAV file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio_file:
                temp_audio_path = temp_audio_file.name
            
            try:
                # Extract audio using ffmpeg
                subprocess.run([
                    "ffmpeg",
                    "-y",  # Overwrite output files
                    "-i", file_path,  # Input file
                    "-vn",  # Disable video
                    "-acodec", "pcm_s16le",  # Convert to PCM WAV
                    "-ar", "16000",  # 16kHz sample rate (what Whisper expects)
                    "-ac", "1",  # Mono audio
                    temp_audio_path  # Output file
                ], check=True, capture_output=True)
                
                # Use the extracted audio
                transcription_file = temp_audio_path
            except Exception as e:
                print(f"Error extracting audio: {e}")
                if os.path.exists(temp_audio_path):
                    os.unlink(temp_audio_path)
                return None
        else:
            # Use the original file for audio files
            transcription_file = file_path
        
        # Check for matching separate WAV audio file (common with RED footage)
        if file_path.lower().endswith('.r3d'):
            possible_wav = os.path.splitext(file_path)[0] + '.wav'
            if os.path.exists(possible_wav):
                print(f"Found matching WAV file for R3D: {possible_wav}")
                transcription_file = possible_wav
                # Delete temporary extracted audio file if we're using the WAV instead
                if 'temp_audio_path' in locals() and os.path.exists(temp_audio_path):
                    os.unlink(temp_audio_path)
        
        # Transcribe the audio
        print(f"Transcribing audio with Whisper ({model_size} model)...")
        options = {"language": language} if language != "auto" else {}
        
        try:
            result = model.transcribe(transcription_file, **options)
        except RuntimeError as e:
            if "CUDA" in str(e):
                print("CUDA error detected. Falling back to CPU...")
                # Try again with CPU device
                result = model.transcribe(transcription_file, device="cpu", **options)
            else:
                raise
        
        # Clean up temporary file if it exists
        if 'temp_audio_path' in locals() and os.path.exists(temp_audio_path):
            os.unlink(temp_audio_path)
        
        # Prepare result
        transcription_data = {
            "text": result["text"],
            "segments": result["segments"],
            "language": result.get("language", "unknown"),
            "model": model_size,
            "processing_date": datetime.datetime.now().isoformat()
        }
        
        return transcription_data
        
    except ImportError:
        print("Whisper not installed - transcription skipped")
        return None
    except Exception as e:
        print(f"Transcription error: {e}")
        return None
    
    # The following code can be uncommented once the RED SDK is properly integrated:
    """
    try:
        # Create output directory if it doesn't exist
        if output_dir is None:
            output_dir = os.path.expanduser("~/media-asset-tracker/thumbnails")
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate unique thumbnail filename
        file_basename = os.path.basename(r3d_path)
        thumbnail_name = f"{os.path.splitext(file_basename)[0]}_{uuid.uuid4().hex[:8]}.jpg"
        thumbnail_path = os.path.join(output_dir, thumbnail_name)
        
        # Path to the R3D SDK sample executable
        sdk_path = os.path.expanduser("~/Documents/Claude/Projects/hardware-infrastructure/vaultkeeper/R3DSDKv8_6_0")
        sample_exec_path = os.path.join(sdk_path, "Sample code/CPU decoding/CPUDecodeSample")
        
        # Create temporary script to extract thumbnail
        temp_script_path = os.path.join(output_dir, "extract_r3d_thumb.sh")
        with open(temp_script_path, "w") as f:
            f.write(f\"\"\"#!/bin/bash
export LD_LIBRARY_PATH={sdk_path}/Redistributable/linux
{sample_exec_path} "{r3d_path}" "{thumbnail_path}" {width} {height} 1 1
\"\"\")
        
        # Make the script executable
        os.chmod(temp_script_path, 0o755)
        
        # Execute the script
        try:
            subprocess.run(
                [temp_script_path],
                check=True,
                capture_output=True,
                text=True
            )
            
            # Check if thumbnail was created
            if os.path.exists(thumbnail_path):
                print(f"R3D thumbnail generated: {thumbnail_path}")
                return thumbnail_path
            else:
                print("R3D thumbnail generation failed")
                return None
                
        except subprocess.CalledProcessError as e:
            print(f"Error running R3D SDK sample: {e}")
            print(f"Stdout: {e.stdout}")
            print(f"Stderr: {e.stderr}")
            
            # Fall back to using ffmpeg if R3D SDK fails
            print("Falling back to ffmpeg for R3D thumbnail")
            return generate_video_thumbnail_with_ffmpeg(r3d_path, output_dir, width, height)
            
        finally:
            # Clean up temporary script
            if os.path.exists(temp_script_path):
                os.remove(temp_script_path)
            
    except Exception as e:
        print(f"Error in R3D thumbnail generation: {e}")
        # Fall back to using ffmpeg
        print("Falling back to ffmpeg for R3D thumbnail")
        return generate_video_thumbnail_with_ffmpeg(r3d_path, output_dir, width, height)
    """

def generate_video_thumbnail_with_ffmpeg(video_path, output_dir, width, height):
    """Fallback method to generate thumbnail using ffmpeg for any video format"""
    try:
        # Create output directory if it doesn't exist
        if output_dir is None:
            output_dir = os.path.expanduser("~/media-asset-tracker/thumbnails")
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate unique thumbnail filename
        file_basename = os.path.basename(video_path)
        thumbnail_name = f"{os.path.splitext(file_basename)[0]}_{uuid.uuid4().hex[:8]}.jpg"
        thumbnail_path = os.path.join(output_dir, thumbnail_name)
        
        # Try to extract a frame using ffmpeg
        subprocess.run(
            [
                "ffmpeg", 
                "-y",  # Overwrite output files
                "-i", video_path,  # Input file
                "-vframes", "1",  # Extract one frame
                "-q:v", "2",  # Quality (2 is high, 31 is low)
                "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",  # Scale and pad
                thumbnail_path  # Output file
            ],
            capture_output=True,
            check=True
        )
        
        return thumbnail_path
    except Exception as e:
        print(f"Fallback thumbnail generation failed: {e}")
        return None

def catalog_files(drive_info, conn=None):
    """Catalog all files on the drive and store in database"""
    # Check if drive_info is None (operation cancelled during duplicate handling)
    if drive_info is None:
        print("Cataloging cancelled - no changes made.")
        return 0
        
    if conn is None:
        # Set timeout to 60 seconds and enable WAL mode for better concurrency
        conn = sqlite3.connect(DB_PATH, timeout=60.0)
        conn.execute('PRAGMA journal_mode=WAL')
    cursor = conn.cursor()
    
    print("\n=== CATALOGING PROCESS STARTED ===")
    print(f"Drive: {drive_info['volume_name']}")
    print(f"Mount Point: {drive_info['mount_point']}")
    print(f"Size: {drive_info['size_bytes'] / (1024**3):.2f} GB")
    print(f"Format: {drive_info['format']}")
    print(f"Label: {drive_info.get('label', drive_info['volume_name'])}")
    print(f"Drive ID: {drive_info['id']}")
    print("=================================\n")
    
    # First, add the drive info to the database
    print("Adding drive information to database...")
    cursor.execute('''
    INSERT OR REPLACE INTO drives (
        id, volume_name, size_bytes, free_bytes, format, mount_point, date_cataloged, label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        drive_info["id"],
        drive_info["volume_name"],
        drive_info["size_bytes"],
        drive_info["free_bytes"],
        drive_info["format"],
        drive_info["mount_point"],
        drive_info["date_cataloged"],
        drive_info.get("label", drive_info["volume_name"])
    ))
    conn.commit()
    print("Drive information added successfully")
    
    # Initialize counters for analytics
    start_time = datetime.datetime.now()
    total_files = 0
    file_types = {}
    total_size = 0
    error_count = 0
    skipped_count = 0
    r3d_count = 0  # Counter for .r3d files
    
    # Count total files for progress reporting
    print("\nCounting files (initial scan)...")
    file_count = 0
    for root, dirs, files in os.walk(drive_info["mount_point"]):
        file_count += len(files)
        # Remove hidden directories to speed up scan
        dirs[:] = [d for d in dirs if not d.startswith('.')]
    print(f"Found approximately {file_count} files to process")
    
    # Progress tracking
    print("\nStarting file cataloging...")
    mount_point = drive_info["mount_point"]
    
    # Set up progress display
    last_update = datetime.datetime.now()
    update_interval = datetime.timedelta(seconds=1)  # Update every second
    
    for root, dirs, files in os.walk(mount_point):
        # Skip hidden directories and Final Cut Pro bundle internals
        dirs[:] = [d for d in dirs if not d.startswith('.') and not (d.endswith('.fcpbundle') or '.fcpcache' in d)]
        
        # Skip .fcpbundle bundle internals if we're already inside one 
        if '.fcpbundle/' in root or '.fcpcache/' in root:
            continue
        
        current_dir = os.path.relpath(root, mount_point)
        if current_dir == ".":
            current_dir = "/"
        
        # Show current directory less frequently
        now = datetime.datetime.now()
        if now - last_update > update_interval:
            print(f"\rProcessing directory: {current_dir:<60}", end="", flush=True)
            last_update = now
        
        for filename in files:
            file_path = os.path.join(root, filename)
            rel_path = os.path.relpath(file_path, mount_point)
            
            # Skip system files and Final Cut Pro internal files
            if any(part.startswith('.') for part in rel_path.split(os.path.sep)) or '.fcpbundle/' in rel_path or '.fcpcache/' in rel_path:
                skipped_count += 1
                continue
                
            try:
                # Get file stats
                file_stats = os.stat(file_path)
                file_size = file_stats.st_size
                total_size += file_size
                file_created = datetime.datetime.fromtimestamp(file_stats.st_ctime).isoformat()
                file_modified = datetime.datetime.fromtimestamp(file_stats.st_mtime).isoformat()
                
                # Get file extension and MIME type
                _, extension = os.path.splitext(filename)
                extension = extension.lower().lstrip('.')
                
                # Update file type statistics
                if extension in file_types:
                    file_types[extension]["count"] += 1
                    file_types[extension]["size"] += file_size
                else:
                    file_types[extension] = {"count": 1, "size": file_size}
                
                # Check specifically for .r3d files
                is_r3d = extension.lower() == 'r3d'
                if is_r3d:
                    r3d_count += 1
                    # Print a message every 10 r3d files
                    if r3d_count % 10 == 0:
                        print(f"\nProcessed {r3d_count} R3D files so far. Current: {rel_path}")
                
                # Determine MIME type with special handling for R3D files
                if is_r3d:
                    mime_type = "video/x-red-r3d"
                else:
                    mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
                
                # Calculate checksum for small to medium files
                checksum = None
                if file_size < 500_000_000:  # Skip files larger than 500MB
                    checksum = calculate_checksum(file_path)
                
                # Extract media info and generate thumbnail for video files
                media_info = None
                thumbnail_path = None
                
                # Process any video file (including .r3d)
                if is_r3d or (mime_type and mime_type.startswith("video/")):
                    # Handle media info extraction first - different approach for R3D files
                    if is_r3d:
                        # For .r3d files, don't try to extract media info with ffprobe as it can be problematic
                        # Instead, store basic file info
                        media_info = json.dumps({
                            "format": {
                                "filename": file_path,
                                "format_name": "r3d",
                                "size": str(file_size)
                            },
                            "streams": [
                                {
                                    "codec_type": "video",
                                    "codec_name": "r3d"
                                }
                            ]
                        })
                        print(f"\nStored basic info for R3D file: {rel_path}")
                    else:
                        # For other video files, try normal media info extraction
                        media_info = get_media_info(file_path)
                        if media_info:
                            print(f"\nExtracted media info for: {rel_path}")
                    
                    # Generate thumbnail from video
                    thumbnail_dir = os.path.expanduser(f"~/media-asset-tracker/thumbnails/{drive_info['id']}")
                    
                    # Use R3D-specific handling for .r3d files
                    if is_r3d:
                        thumbnail_path = generate_r3d_thumbnail(file_path, thumbnail_dir)
                    else:
                        thumbnail_path = generate_video_thumbnail(file_path, thumbnail_dir)
                        
                    if thumbnail_path:
                        print(f"\nGenerated thumbnail for: {rel_path}")
                
                # Extract media info for audio files
                elif mime_type and mime_type.startswith("audio/"):
                    media_info = get_media_info(file_path)
                    if media_info:
                        print(f"\nExtracted media info for: {rel_path}")
                
                # Store file info in database without transcription (will be processed later)
                cursor.execute('''
                INSERT OR REPLACE INTO files (
                    id, drive_id, path, filename, extension, size_bytes, 
                    date_created, date_modified, checksum, mime_type, media_info,
                    thumbnail_path, transcription_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    str(uuid.uuid4()),
                    drive_info["id"],
                    rel_path,
                    filename,
                    extension,
                    file_size,
                    file_created,
                    file_modified,
                    checksum,
                    mime_type,
                    media_info,
                    thumbnail_path,
                    "pending" if (mime_type and (mime_type.startswith("video/") or mime_type.startswith("audio/"))) else None
                ))
                
                total_files += 1
                
                # Update progress every 100 files
                if total_files % 100 == 0:
                    progress = total_files / file_count * 100 if file_count > 0 else 0
                    elapsed = (datetime.datetime.now() - start_time).total_seconds()
                    files_per_sec = total_files / elapsed if elapsed > 0 else 0
                    
                    # Clear previous line and print updated progress
                    print(f"\rProgress: {total_files}/{file_count} files ({progress:.1f}%) | {files_per_sec:.1f} files/sec | {total_size/(1024**3):.2f} GB indexed", end="", flush=True)
                
                # Commit more frequently for large file collections to reduce locking
                if total_files % 100 == 0:
                    conn.commit()
                
            except Exception as e:
                error_count += 1
                print(f"\nError processing file {rel_path}: {e}")
    
    # Final commit
    conn.commit()
    
    # Calculate summary statistics
    elapsed_time = (datetime.datetime.now() - start_time).total_seconds()
    files_per_second = total_files / elapsed_time if elapsed_time > 0 else 0
    
    # Sort file types by count
    sorted_types = sorted(file_types.items(), key=lambda x: x[1]["count"], reverse=True)
    
    # Count video/audio files and thumbnails
    video_count = 0
    audio_count = 0
    thumbnail_count = 0
    
    try:
        cursor.execute("SELECT COUNT(*) FROM files WHERE mime_type LIKE 'video/%' AND drive_id = ?", (drive_info["id"],))
        video_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM files WHERE mime_type LIKE 'audio/%' AND drive_id = ?", (drive_info["id"],))
        audio_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM files WHERE thumbnail_path IS NOT NULL AND drive_id = ?", (drive_info["id"],))
        thumbnail_count = cursor.fetchone()[0]
        
        # Get R3D file count for summary
        cursor.execute("SELECT COUNT(*) FROM files WHERE extension = 'r3d' AND drive_id = ?", (drive_info["id"],))
        r3d_db_count = cursor.fetchone()[0]
    except Exception as e:
        print(f"Error counting media files: {e}")
        r3d_db_count = r3d_count  # Use our running counter
    
    # Print detailed summary
    print("\n\n=== CATALOGING SUMMARY ===")
    print(f"Total files processed: {total_files}")
    print(f"Total data size: {total_size/(1024**3):.2f} GB")
    print(f"Processing time: {elapsed_time:.2f} seconds")
    print(f"Processing rate: {files_per_second:.2f} files/second")
    print(f"Media files found: {video_count} videos, {audio_count} audio files")
    print(f"RED R3D files found: {r3d_db_count}")
    print(f"Thumbnails generated: {thumbnail_count}")
    print(f"Errors encountered: {error_count}")
    print(f"Files skipped: {skipped_count}")
    
    print("\nTop file types:")
    for i, (ext, stats) in enumerate(sorted_types[:10], 1):
        ext_name = f".{ext}" if ext else "(no extension)"
        print(f"{i}. {ext_name}: {stats['count']} files ({stats['size']/(1024**3):.2f} GB)")
    
    print("\nCataloging complete!")
    return total_files

def generate_qr_code(drive_info, label=None):
    """Generate a QR code with drive information for printing"""
    qr_data = {
        "drive_id": drive_info["id"],
        "volume_name": drive_info["volume_name"],
        "size_gb": round(drive_info["size_bytes"] / (1024**3), 2),
        "date_cataloged": drive_info["date_cataloged"]
    }
    
    if label:
        qr_data["label"] = label
        drive_info["label"] = label
    
    # Generate QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(json.dumps(qr_data))
    qr.make(fit=True)
    
    # Create QR code image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Add label text below QR code
    label_text = label or drive_info["volume_name"]
    
    # Convert the QR code to a PIL Image if it's not already
    if not isinstance(img, Image.Image):
        print("Converting QR code to PIL Image")
        img_data = img.get_image()
        if hasattr(img_data, 'convert'):
            img = img_data.convert('RGB')
        else:
            # If we can't get a proper Image object, create a new one from scratch
            print("Creating new QR code image from scratch")
            qr.make()
            img = qr.make_image(fill_color="black", back_color="white").get_image()
    
    # Get the size of the image
    try:
        width, height = img.size
        print(f"QR code size: {width}x{height}")
    except AttributeError as e:
        print(f"Error getting image size: {e}")
        # Default size as fallback
        width, height = 200, 200
    
    # Create a new image with space for text
    new_img = Image.new('RGB', (width, height + 60), color='white')
    
    # Use a more reliable method to paste the image
    try:
        new_img.paste(img, (0, 0))
    except ValueError as e:
        print(f"Error during paste operation: {e}")
        # Alternative paste method
        try:
            # Convert to RGB if needed
            if img.mode != 'RGB':
                img = img.convert('RGB')
            region = img.crop((0, 0, width, height))
            new_img.paste(region, (0, 0, width, height))
        except Exception as e2:
            print(f"Alternative paste method failed: {e2}")
            # Last resort - just use the QR code without the label
            new_img = img
    
    # Add text
    draw = ImageDraw.Draw(new_img)
    try:
        font = ImageFont.truetype("Arial", 24)
    except IOError:
        font = ImageFont.load_default()
    
    # If using a very old version of PIL, anchor may not be supported
    try:
        draw.text(
            (width // 2, height + 30),
            label_text,
            fill='black',
            font=font,
            anchor="mm"
        )
    except TypeError:
        # Older versions of PIL don't support anchor
        text_size = draw.textsize(label_text, font=font)
        position = ((width - text_size[0]) // 2, height + 30 - text_size[1] // 2)
        draw.text(position, label_text, fill='black', font=font)
    
    # Save image
    os.makedirs(os.path.expanduser("~/media-asset-tracker/qr-codes"), exist_ok=True)
    qr_path = os.path.expanduser(f"~/media-asset-tracker/qr-codes/{label_text}.png")
    new_img.save(qr_path)
    
    # Update drive record with QR code path
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE drives SET qr_code_path = ?, label = ? WHERE id = ?",
        (qr_path, label_text, drive_info["id"])
    )
    conn.commit()
    conn.close()
    
    print(f"QR code generated successfully: {qr_path}")
    return qr_path

def search_files(query, search_type="filename"):
    """Search for files in the database based on query and search type"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Return results as dictionaries
    cursor = conn.cursor()
    
    # Build query based on search type
    if search_type == "filename":
        sql = """
        SELECT f.*, d.label, d.volume_name 
        FROM files f
        JOIN drives d ON f.drive_id = d.id
        WHERE f.filename LIKE ?
        ORDER BY f.date_modified DESC
        LIMIT 100
        """
        cursor.execute(sql, (f"%{query}%",))
    
    elif search_type == "extension":
        sql = """
        SELECT f.*, d.label, d.volume_name 
        FROM files f
        JOIN drives d ON f.drive_id = d.id
        WHERE f.extension = ?
        ORDER BY f.date_modified DESC
        LIMIT 100
        """
        cursor.execute(sql, (query.lstrip('.').lower(),))
    
    elif search_type == "project":
        sql = """
        SELECT f.*, d.label, d.volume_name, p.name as project_name
        FROM files f
        JOIN drives d ON f.drive_id = d.id
        JOIN project_files pf ON f.id = pf.file_id
        JOIN projects p ON pf.project_id = p.id
        WHERE p.name LIKE ? OR p.client LIKE ?
        ORDER BY f.date_modified DESC
        LIMIT 100
        """
        cursor.execute(sql, (f"%{query}%", f"%{query}%"))
    
    elif search_type == "transcription":
        sql = """
        SELECT f.*, d.label, d.volume_name 
        FROM files f
        JOIN drives d ON f.drive_id = d.id
        WHERE 
            f.transcription_status = 'completed' AND
            f.transcription LIKE ?
        ORDER BY f.date_modified DESC
        LIMIT 100
        """
        cursor.execute(sql, (f"%{query}%",))
    
    else:  # General search
        sql = """
        SELECT f.*, d.label, d.volume_name 
        FROM files f
        JOIN drives d ON f.drive_id = d.id
        WHERE 
            f.filename LIKE ? OR
            f.path LIKE ? OR
            d.label LIKE ? OR
            d.volume_name LIKE ? OR
            (f.transcription_status = 'completed' AND f.transcription LIKE ?)
        ORDER BY f.date_modified DESC
        LIMIT 100
        """
        search_pattern = f"%{query}%"
        cursor.execute(sql, (search_pattern, search_pattern, search_pattern, search_pattern, search_pattern))
    
    results = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in results]

def list_drives():
    """List all cataloged drives in the system"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT id, label, volume_name, size_bytes, free_bytes, format, mount_point, 
           date_cataloged, last_verified, notes
    FROM drives
    ORDER BY date_cataloged DESC
    """)
    
    drives = cursor.fetchall()
    conn.close()
    
    return [dict(drive) for drive in drives]

def create_project(name, client=None, notes=None):
    """Create a new project entry"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    project_id = str(uuid.uuid4())
    cursor.execute("""
    INSERT INTO projects (id, name, client, date_created, notes)
    VALUES (?, ?, ?, ?, ?)
    """, (project_id, name, client, datetime.datetime.now().isoformat(), notes))
    
    conn.commit()
    conn.close()
    
    return project_id

def add_files_to_project(project_id, file_paths=None, search_pattern=None):
    """Add files to a project by paths or search pattern"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Verify project exists
    cursor.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
    if not cursor.fetchone():
        print(f"Error: Project with ID {project_id} not found")
        conn.close()
        return 0
    
    files_added = 0
    
    if file_paths:
        for path in file_paths:
            # Find file in database
            cursor.execute(
                "SELECT id FROM files WHERE path LIKE ? OR filename = ?", 
                (f"%{path}%", os.path.basename(path))
            )
            file_rows = cursor.fetchall()
            
            for file_row in file_rows:
                # Add file to project
                try:
                    cursor.execute(
                        "INSERT OR IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)",
                        (project_id, file_row[0])
                    )
                    files_added += 1
                except sqlite3.IntegrityError:
                    # File already in project
                    pass
    
    if search_pattern:
        # Find files by pattern
        cursor.execute(
            """
            SELECT id FROM files 
            WHERE filename LIKE ? OR path LIKE ?
            """, 
            (f"%{search_pattern}%", f"%{search_pattern}%")
        )
        file_rows = cursor.fetchall()
        
        for file_row in file_rows:
            try:
                cursor.execute(
                    "INSERT OR IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)",
                    (project_id, file_row[0])
                )
                files_added += 1
            except sqlite3.IntegrityError:
                # File already in project
                pass
    
    conn.commit()
    conn.close()
    
    return files_added

def process_transcriptions(drive_id=None, max_workers=2, model_size="base"):
    """
    Process transcriptions for pending audio and video files
    
    Args:
        drive_id: Optional drive ID to limit processing to a specific drive
        max_workers: Maximum number of parallel transcription workers
        model_size: Whisper model size to use
    
    Returns:
        Number of files processed
    """
    print("\n=== TRANSCRIPTION PROCESSING ===")
    
    # Connect to database
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Find all pending transcriptions
    if drive_id:
        cursor.execute("""
        SELECT id, drive_id, path, filename, extension, mime_type
        FROM files
        WHERE transcription_status = 'pending' AND drive_id = ?
        ORDER BY size_bytes ASC
        """, (drive_id,))
    else:
        cursor.execute("""
        SELECT id, drive_id, path, filename, extension, mime_type
        FROM files
        WHERE transcription_status = 'pending'
        ORDER BY size_bytes ASC
        """)
    
    pending_files = cursor.fetchall()
    
    if not pending_files:
        print("No pending transcriptions found!")
        conn.close()
        return 0
    
    print(f"Found {len(pending_files)} files needing transcription")
    
    # Function to process a single file
    def process_file(file_data):
        # Get drive mount point for the file
        c = sqlite3.connect(DB_PATH, timeout=60.0)
        c.row_factory = sqlite3.Row
        file_cursor = c.cursor()
        
        file_cursor.execute("SELECT mount_point FROM drives WHERE id = ?", (file_data['drive_id'],))
        drive_row = file_cursor.fetchone()
        
        if not drive_row:
            print(f"Error: Drive not found for file {file_data['filename']}")
            return False
        
        # Construct full path
        mount_point = drive_row['mount_point']
        full_path = os.path.join(mount_point, file_data['path'])
        
        if not os.path.exists(full_path):
            print(f"Error: File not found: {full_path}")
            # Update status to error
            file_cursor.execute("""
            UPDATE files
            SET transcription_status = 'error', 
                transcription_date = ?
            WHERE id = ?
            """, (datetime.datetime.now().isoformat(), file_data['id']))
            c.commit()
            c.close()
            return False
        
        try:
            # Mark as processing
            file_cursor.execute("""
            UPDATE files
            SET transcription_status = 'processing', 
                transcription_date = ?
            WHERE id = ?
            """, (datetime.datetime.now().isoformat(), file_data['id']))
            c.commit()
            
            # Transcribe the file
            print(f"\nTranscribing: {file_data['filename']}")
            result = transcribe_audio(full_path, model_size=model_size)
            
            if result:
                # Store result
                file_cursor.execute("""
                UPDATE files
                SET transcription = ?,
                    transcription_status = 'completed',
                    transcription_date = ?
                WHERE id = ?
                """, (json.dumps(result), datetime.datetime.now().isoformat(), file_data['id']))
                c.commit()
                print(f"✓ Transcription completed: {file_data['filename']}")
                return True
            else:
                # Update status to error
                file_cursor.execute("""
                UPDATE files
                SET transcription_status = 'error',
                    transcription_date = ?
                WHERE id = ?
                """, (datetime.datetime.now().isoformat(), file_data['id']))
                c.commit()
                print(f"✗ Transcription failed: {file_data['filename']}")
                return False
                
        except Exception as e:
            print(f"Error processing {file_data['filename']}: {e}")
            # Update status to error
            file_cursor.execute("""
            UPDATE files
            SET transcription_status = 'error',
                transcription_date = ?
            WHERE id = ?
            """, (datetime.datetime.now().isoformat(), file_data['id']))
            c.commit()
            return False
        finally:
            c.close()
    
    # Process files in parallel
    print(f"Starting transcription with {max_workers} parallel workers")
    processed_count = 0
    error_count = 0
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = []
        for file_data in pending_files:
            futures.append(executor.submit(process_file, dict(file_data)))
        
        for future in futures:
            if future.result():
                processed_count += 1
            else:
                error_count += 1
    
    print("\n=== TRANSCRIPTION SUMMARY ===")
    print(f"Total files processed: {processed_count + error_count}")
    print(f"Successful transcriptions: {processed_count}")
    print(f"Failed transcriptions: {error_count}")
    
    conn.close()
    return processed_count

def clean_duplicate_drives():
    """Interactive tool to clean up duplicate drive entries"""
    print("\n=== DUPLICATE DRIVE CLEANUP UTILITY ===")
    
    # Connect to database
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.execute('PRAGMA journal_mode=WAL')
    cursor = conn.cursor()
    
    # Find all duplicate drives
    cursor.execute("""
    SELECT volume_name, COUNT(*) as count
    FROM drives
    GROUP BY volume_name
    HAVING count > 1
    ORDER BY count DESC
    """)
    duplicates = cursor.fetchall()
    
    if not duplicates:
        print("No duplicate drives found!")
        conn.close()
        return
    
    print(f"\nFound {len(duplicates)} drives with duplicate entries:")
    for volume_name, count in duplicates:
        print(f"  - {volume_name} ({count} entries)")
    
    print("\nStarting interactive cleanup...")
    
    # Process each duplicate set
    for volume_name, count in duplicates:
        print(f"\n=== Processing duplicates for: {volume_name} ===")
        
        # Get all drives with this volume name
        cursor.execute("SELECT * FROM drives WHERE volume_name = ?", (volume_name,))
        drive_rows = cursor.fetchall()
        
        # Convert to dictionaries
        column_names = [description[0] for description in cursor.description]
        drives = []
        
        for row in drive_rows:
            drive_dict = {column_names[i]: row[i] for i in range(len(column_names))}
            
            # Get the file count for this drive
            cursor.execute("SELECT COUNT(*) FROM files WHERE drive_id = ?", (drive_dict['id'],))
            file_count = cursor.fetchone()[0]
            drive_dict['file_count'] = file_count
            
            drives.append(drive_dict)
        
        # Display drive entries
        print(f"\nFound {len(drives)} entries for '{volume_name}':")
        for i, drive in enumerate(drives):
            catalog_date = drive.get('date_cataloged', 'Unknown date')
            # Parse date for better display
            try:
                date_obj = datetime.datetime.fromisoformat(catalog_date)
                catalog_date = date_obj.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pass
                
            print(f"{i+1}. ID: {drive.get('id')}")
            print(f"   Label: {drive.get('label') or drive.get('volume_name')}")
            print(f"   Size: {drive.get('size_bytes', 0) / (1024**3):.2f} GB")
            print(f"   Cataloged: {catalog_date}")
            print(f"   Files: {drive.get('file_count', 0)}")
            print()
        
        print("Options:")
        print("1) Keep one entry and delete others")
        print("2) Skip this drive (no changes)")
        print("3) Exit cleanup tool")
        
        choice = input("\nYour choice (1-3): ").strip()
        
        if choice == "1":
            keep_idx = input(f"Which entry to keep (1-{len(drives)}): ").strip()
            try:
                idx = int(keep_idx) - 1
                if 0 <= idx < len(drives):
                    drive_to_keep = drives[idx]
                    
                    # Ask about file handling
                    file_choice = input("\nHow to handle files for deleted entries?\n" +
                                      "1) Delete all files from other entries\n" +
                                      "2) Keep files but reassign to the kept entry\n" +
                                      "Your choice (1-2): ").strip()
                    
                    reassign_files = (file_choice == "2")
                    
                    # Process the deletion
                    for i, drive in enumerate(drives):
                        if i != idx:
                            print(f"Processing entry {i+1}...")
                            if reassign_files:
                                # Update files to point to the kept drive
                                cursor.execute("""
                                UPDATE files 
                                SET drive_id = ? 
                                WHERE drive_id = ?
                                """, (drive_to_keep['id'], drive['id']))
                                print(f"  - Reassigned files to kept drive ID: {drive_to_keep['id']}")
                            else:
                                # Delete the files
                                cursor.execute("DELETE FROM files WHERE drive_id = ?", (drive['id'],))
                                print(f"  - Deleted {drive.get('file_count', 0)} files")
                            
                            # Delete the drive entry
                            cursor.execute("DELETE FROM drives WHERE id = ?", (drive['id'],))
                            print(f"  - Deleted drive entry: {drive['id']}")
                    
                    conn.commit()
                    print(f"\nKept entry {idx+1} and processed {len(drives)-1} other entries")
                else:
                    print("Invalid selection, skipping this drive")
            except ValueError:
                print("Invalid input, skipping this drive")
        
        elif choice == "3":
            print("Exiting cleanup tool")
            break
        else:
            print("Skipping this drive")
    
    # Final commit and cleanup
    conn.commit()
    conn.close()
    print("\nCleanup process completed!")

def main():
    """Main function to handle command line arguments"""
    parser = argparse.ArgumentParser(
        description="Media Asset Tracking System - Catalog and track archived media files"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Initialize database
    init_parser = subparsers.add_parser("init", help="Initialize the database")
    init_parser.add_argument(
        "--force", 
        action="store_true",
        help="Force reinitialize database and fix column issues"
    )
    
    # Cleanup command for managing duplicate entries
    cleanup_parser = subparsers.add_parser("cleanup", help="Clean up duplicate drive entries")
    
    # Transcription command for processing media files
    transcribe_parser = subparsers.add_parser("transcribe", help="Process transcriptions for audio/video files")
    transcribe_parser.add_argument(
        "-d", "--drive-id",
        help="Optional drive ID to limit processing to a specific drive"
    )
    transcribe_parser.add_argument(
        "-w", "--workers",
        type=int,
        default=2,
        help="Number of parallel workers for transcription (default: 2)"
    )
    transcribe_parser.add_argument(
        "-m", "--model",
        choices=["tiny", "base", "small", "medium", "large"],
        default="base",
        help="Whisper model size to use (default: base)"
    )
    
    # Catalog drive
    catalog_parser = subparsers.add_parser("catalog", help="Catalog a drive")
    catalog_parser.add_argument(
        "mount_point", 
        help="Mount point of the drive to catalog"
    )
    catalog_parser.add_argument(
        "-l", "--label", 
        help="Custom label for the drive"
    )
    catalog_parser.add_argument(
        "-t", "--transcribe",
        action="store_true",
        help="Run transcription after cataloging"
    )
    catalog_parser.add_argument(
        "--batch-mode",
        action="store_true",
        help="Run in batch mode (less interactive)"
    )
    catalog_parser.add_argument(
        "--duplicate-choice",
        type=int,
        choices=[1, 2, 3],
        help="How to handle duplicate drives in batch mode (1=replace, 2=new, 3=skip)"
    )
    
    # Generate QR code
    qr_parser = subparsers.add_parser("qr", help="Generate QR code for a drive")
    qr_parser.add_argument(
        "drive_id", 
        help="ID of the drive to generate QR code for"
    )
    qr_parser.add_argument(
        "-l", "--label", 
        help="Custom label for the QR code"
    )
    
    # Search files
    search_parser = subparsers.add_parser("search", help="Search for files")
    search_parser.add_argument(
        "query", 
        help="Search query"
    )
    search_parser.add_argument(
        "-t", "--type",
        choices=["filename", "extension", "project", "transcription", "any"],
        default="any",
        help="Type of search to perform"
    )
    
    # List drives
    list_parser = subparsers.add_parser("drives", help="List all cataloged drives")
    
    # Create project
    project_parser = subparsers.add_parser("project", help="Create a new project")
    project_parser.add_argument(
        "name", 
        help="Project name"
    )
    project_parser.add_argument(
        "-c", "--client", 
        help="Client name"
    )
    project_parser.add_argument(
        "-n", "--notes", 
        help="Project notes"
    )
    
    # Add files to project
    add_files_parser = subparsers.add_parser("add-files", help="Add files to a project")
    add_files_parser.add_argument(
        "project_id", 
        help="Project ID"
    )
    add_files_parser.add_argument(
        "-f", "--files", 
        nargs="+", 
        help="File paths to add"
    )
    add_files_parser.add_argument(
        "-p", "--pattern", 
        help="Search pattern to find files"
    )
    
    # Show transcription
    transcription_parser = subparsers.add_parser("show-transcription", help="Show full transcription for a file")
    transcription_parser.add_argument(
        "file_id",
        help="File ID to show transcription for"
    )
    
    args = parser.parse_args()
    
    # Initialize the database if it doesn't exist
    if not os.path.exists(DB_PATH) or args.command == "init":
        print("Initializing database...")
        init_db()
        print(f"Database initialized at {DB_PATH}")
        if args.command == "init":
            return
    
    # Execute command
    if args.command == "init" and args.force:
        # Add any specific database fixes here
        print("Checking and fixing database columns...")
        conn = sqlite3.connect(DB_PATH, timeout=60.0)
        conn.execute('PRAGMA journal_mode=WAL')
        cursor = conn.cursor()
        
        # Check if thumbnail_path column exists, if not add it
        cursor.execute("PRAGMA table_info(files)")
        columns = cursor.fetchall()
        column_names = [column[1] for column in columns]
        
        if 'thumbnail_path' not in column_names:
            print("Adding thumbnail_path column to files table...")
            cursor.execute("ALTER TABLE files ADD COLUMN thumbnail_path TEXT")
            conn.commit()
            print("Fixed missing thumbnail_path column")
        else:
            print("thumbnail_path column already exists")
        
        # Check for duplicate drives based on volume name
        print("\nChecking for duplicate drive entries...")
        cursor.execute("SELECT volume_name, COUNT(*) FROM drives GROUP BY volume_name HAVING COUNT(*) > 1")
        duplicates = cursor.fetchall()
        
        if duplicates:
            print("\nFound duplicate entries for the following drives:")
            for volume_name, count in duplicates:
                print(f"  - {volume_name} ({count} entries)")
            
            print("\nOptions:")
            print("1) Launch interactive cleanup tool")
            print("2) Continue without cleanup")
            
            choice = input("\nYour choice (1-2): ").strip()
            if choice == "1":
                clean_duplicate_drives()
        else:
            print("No duplicate drives found.")
            
        conn.close()
        
    elif args.command == "cleanup":
        # Special command for cleaning up duplicate drives
        clean_duplicate_drives()
        
    elif args.command == "catalog":
        print(f"Cataloging drive at {args.mount_point}...")
        
        # Get drive info with batch mode handling if specified
        drive_info = get_drive_info(
            args.mount_point,
            batch_mode=args.batch_mode,
            duplicate_choice=args.duplicate_choice
        )
        
        if drive_info:
            if args.label:
                drive_info["label"] = args.label
            
            total_files = catalog_files(drive_info)
            print(f"Cataloged {total_files} files from {drive_info['volume_name']}")
            
            # Generate QR code
            try:
                qr_path = generate_qr_code(drive_info, args.label)
                print(f"QR code generated: {qr_path}")
            except Exception as e:
                print(f"Warning: Error generating QR code: {e}")
                print("Continuing with processing...")
            
            # Run transcription if requested
            if args.transcribe:
                print("\nStarting transcription process for newly cataloged files...")
                process_transcriptions(drive_info["id"])
                
    elif args.command == "transcribe":
        # Process transcriptions for audio/video files
        process_transcriptions(
            drive_id=args.drive_id, 
            max_workers=args.workers,
            model_size=args.model
        )
        
    elif args.command == "qr":
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM drives WHERE id = ?", 
            (args.drive_id,)
        )
        drive_row = cursor.fetchone()
        
        if drive_row:
            column_names = [description[0] for description in cursor.description]
            drive_info = {column_names[i]: drive_row[i] for i in range(len(column_names))}
            
            qr_path = generate_qr_code(drive_info, args.label)
            print(f"QR code generated: {qr_path}")
        else:
            print(f"Error: Drive with ID {args.drive_id} not found")
        
        conn.close()
        
    elif args.command == "search":
        results = search_files(args.query, args.type)
        print(f"Found {len(results)} results for '{args.query}':")
        
        for i, result in enumerate(results, 1):
            drive_label = result["label"] or result["volume_name"]
            size_mb = result["size_bytes"] / (1024**2)
            print(f"{i}. {result['filename']} ({size_mb:.2f} MB)")
            print(f"   Path: {result['path']}")
            print(f"   Drive: {drive_label}")
            print(f"   Modified: {result['date_modified']}")
            
            # Show transcription snippet if this was a transcription search and we have one
            if args.type == "transcription" and result.get('transcription'):
                try:
                    transcription_data = json.loads(result['transcription'])
                    full_text = transcription_data.get('text', '')
                    
                    # Find the context around the search term
                    search_term = args.query.lower()
                    text_lower = full_text.lower()
                    position = text_lower.find(search_term)
                    
                    if position != -1:
                        # Extract a snippet (100 chars before and after the match)
                        start = max(0, position - 100)
                        end = min(len(full_text), position + len(search_term) + 100)
                        snippet = full_text[start:end]
                        
                        # Add ellipsis if we've truncated
                        if start > 0:
                            snippet = "..." + snippet
                        if end < len(full_text):
                            snippet += "..."
                        
                        print(f"   Transcription: \"{snippet}\"")
                        print(f"   Language: {transcription_data.get('language', 'unknown')}")
                except (json.JSONDecodeError, KeyError):
                    print("   Transcription: [Error parsing transcription data]")
            
            print()
            
            if i >= 20:
                print(f"...showing 20 of {len(results)} results")
                break
        
    elif args.command == "drives":
        drives = list_drives()
        print(f"Found {len(drives)} cataloged drives:")
        
        for i, drive in enumerate(drives, 1):
            size_gb = drive["size_bytes"] / (1024**3)
            label = drive["label"] or drive["volume_name"]
            print(f"{i}. {label} ({size_gb:.2f} GB)")
            print(f"   Volume Name: {drive['volume_name']}")
            print(f"   ID: {drive['id']}")
            print(f"   Format: {drive['format']}")
            print(f"   Cataloged: {drive['date_cataloged']}")
            if drive["last_verified"]:
                print(f"   Last Verified: {drive['last_verified']}")
            print()
        
    elif args.command == "project":
        project_id = create_project(args.name, args.client, args.notes)
        print(f"Created project '{args.name}' with ID: {project_id}")
        
    elif args.command == "add-files":
        if not (args.files or args.pattern):
            print("Error: Must specify either files or a search pattern")
            return
            
        files_added = add_files_to_project(args.project_id, args.files, args.pattern)
        print(f"Added {files_added} files to project {args.project_id}")
    
    elif args.command == "show-transcription":
        # Show full transcription for a file
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
        SELECT f.*, d.label, d.volume_name 
        FROM files f
        JOIN drives d ON f.drive_id = d.id
        WHERE f.id = ?
        """, (args.file_id,))
        
        file_data = cursor.fetchone()
        
        if not file_data:
            print(f"Error: File with ID {args.file_id} not found")
            conn.close()
            return
        
        # Display file info
        drive_label = file_data["label"] or file_data["volume_name"]
        print(f"File: {file_data['filename']}")
        print(f"Path: {file_data['path']}")
        print(f"Drive: {drive_label}")
        
        # Check transcription status
        if not file_data['transcription_status']:
            print("This file has not been marked for transcription.")
            conn.close()
            return
        
        if file_data['transcription_status'] != 'completed':
            print(f"Transcription status: {file_data['transcription_status']}")
            print("No completed transcription available.")
            conn.close()
            return
        
        # Display transcription
        try:
            transcription_data = json.loads(file_data['transcription'])
            print("\n=== TRANSCRIPTION ===")
            print(f"Date: {file_data['transcription_date']}")
            print(f"Language: {transcription_data.get('language', 'unknown')}")
            print(f"Model: {transcription_data.get('model', 'unknown')}")
            print("\nFull Text:")
            print("-" * 80)
            print(transcription_data.get('text', '[No text available]'))
            print("-" * 80)
            
            # Ask if user wants to see segments
            segments = transcription_data.get('segments', [])
            if segments:
                show_segments = input("\nShow detailed segments with timestamps? (y/n): ").strip().lower()
                if show_segments == 'y':
                    print("\n=== SEGMENTS ===")
                    for i, segment in enumerate(segments, 1):
                        start_time = segment.get('start', 0)
                        end_time = segment.get('end', 0)
                        text = segment.get('text', '')
                        
                        # Format as MM:SS.ms
                        start_formatted = f"{int(start_time // 60):02}:{start_time % 60:06.3f}"
                        end_formatted = f"{int(end_time // 60):02}:{end_time % 60:06.3f}"
                        
                        print(f"[{start_formatted} - {end_formatted}] {text}")
        
        except json.JSONDecodeError:
            print("Error parsing transcription data.")
        except Exception as e:
            print(f"Error displaying transcription: {e}")
            
        conn.close()
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
