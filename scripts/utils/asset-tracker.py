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

# Initialize mime types
mimetypes.init()

# Database setup
DB_PATH = os.path.expanduser("~/media-asset-tracker/asset-db.sqlite")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def init_db():
    """Initialize the SQLite database with proper schema"""
    conn = sqlite3.connect(DB_PATH)
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
    
    # Files table with metadata
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
        FOREIGN KEY (drive_id) REFERENCES drives (id)
    )
    ''')
    
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
    
    conn.commit()
    conn.close()

def get_drive_info(mount_point):
    """Get drive information at the specified mount point"""
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
    
    return {
        "id": str(uuid.uuid4()),
        "volume_name": volume_name,
        "size_bytes": size_bytes,
        "free_bytes": free_bytes,
        "format": format_type,
        "mount_point": mount_point,
        "date_cataloged": datetime.datetime.now().isoformat()
    }

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

def catalog_files(drive_info, conn=None):
    """Catalog all files on the drive and store in database"""
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
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
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        
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
            
            # Skip system files
            if any(part.startswith('.') for part in rel_path.split(os.path.sep)):
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
                
                mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
                
                # Calculate checksum for small to medium files
                checksum = None
                if file_size < 500_000_000:  # Skip files larger than 500MB
                    checksum = calculate_checksum(file_path)
                
                # Extract media info and generate thumbnail for video files
                media_info = None
                thumbnail_path = None
                
                if mime_type and mime_type.startswith("video/"):
                    # Extract media metadata
                    media_info = get_media_info(file_path)
                    if media_info:
                        print(f"\nExtracted media info for: {rel_path}")
                    
                    # Generate thumbnail from video
                    thumbnail_dir = os.path.expanduser(f"~/media-asset-tracker/thumbnails/{drive_info['id']}")
                    thumbnail_path = generate_video_thumbnail(file_path, thumbnail_dir)
                    if thumbnail_path:
                        print(f"\nGenerated thumbnail for: {rel_path}")
                
                # Extract media info for audio files
                elif mime_type and mime_type.startswith("audio/"):
                    media_info = get_media_info(file_path)
                    if media_info:
                        print(f"\nExtracted media info for: {rel_path}")
                
                # Store file info in database
                cursor.execute('''
                INSERT OR REPLACE INTO files (
                    id, drive_id, path, filename, extension, size_bytes, 
                    date_created, date_modified, checksum, mime_type, media_info,
                    thumbnail_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    thumbnail_path
                ))
                
                total_files += 1
                
                # Update progress every 100 files
                if total_files % 100 == 0:
                    progress = total_files / file_count * 100 if file_count > 0 else 0
                    elapsed = (datetime.datetime.now() - start_time).total_seconds()
                    files_per_sec = total_files / elapsed if elapsed > 0 else 0
                    
                    # Clear previous line and print updated progress
                    print(f"\rProgress: {total_files}/{file_count} files ({progress:.1f}%) | {files_per_sec:.1f} files/sec | {total_size/(1024**3):.2f} GB indexed", end="", flush=True)
                
                # Commit every 1000 files to avoid huge transactions
                if total_files % 1000 == 0:
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
    except Exception as e:
        print(f"Error counting media files: {e}")
    
    # Print detailed summary
    print("\n\n=== CATALOGING SUMMARY ===")
    print(f"Total files processed: {total_files}")
    print(f"Total data size: {total_size/(1024**3):.2f} GB")
    print(f"Processing time: {elapsed_time:.2f} seconds")
    print(f"Processing rate: {files_per_second:.2f} files/second")
    print(f"Media files found: {video_count} videos, {audio_count} audio files")
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
    
    # Create a new image with space for text
    width, height = img.size
    new_img = Image.new('RGB', (width, height + 60), color='white')
    new_img.paste(img, (0, 0))
    
    # Add text
    draw = ImageDraw.Draw(new_img)
    try:
        font = ImageFont.truetype("Arial", 24)
    except IOError:
        font = ImageFont.load_default()
    
    draw.text(
        (width // 2, height + 30),
        label_text,
        fill='black',
        font=font,
        anchor="mm"
    )
    
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
    
    else:  # General search
        sql = """
        SELECT f.*, d.label, d.volume_name 
        FROM files f
        JOIN drives d ON f.drive_id = d.id
        WHERE 
            f.filename LIKE ? OR
            f.path LIKE ? OR
            d.label LIKE ? OR
            d.volume_name LIKE ?
        ORDER BY f.date_modified DESC
        LIMIT 100
        """
        search_pattern = f"%{query}%"
        cursor.execute(sql, (search_pattern, search_pattern, search_pattern, search_pattern))
    
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

def main():
    """Main function to handle command line arguments"""
    parser = argparse.ArgumentParser(
        description="Media Asset Tracking System - Catalog and track archived media files"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Initialize database
    init_parser = subparsers.add_parser("init", help="Initialize the database")
    
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
        choices=["filename", "extension", "project", "any"],
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
    
    args = parser.parse_args()
    
    # Initialize the database if it doesn't exist
    if not os.path.exists(DB_PATH) or args.command == "init":
        print("Initializing database...")
        init_db()
        print(f"Database initialized at {DB_PATH}")
        if args.command == "init":
            return
    
    # Execute command
    if args.command == "catalog":
        print(f"Cataloging drive at {args.mount_point}...")
        drive_info = get_drive_info(args.mount_point)
        if drive_info:
            if args.label:
                drive_info["label"] = args.label
            
            total_files = catalog_files(drive_info)
            print(f"Cataloged {total_files} files from {drive_info['volume_name']}")
            
            # Generate QR code
            qr_path = generate_qr_code(drive_info, args.label)
            print(f"QR code generated: {qr_path}")
        
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
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
