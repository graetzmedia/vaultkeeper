#!/usr/bin/env python3
"""
REDline Single Frame Extractor
----------------------------
Extracts a single frame from the middle of an R3D clip for thumbnails
"""

import os
import sys
import sqlite3
import argparse
import glob
import time
import uuid
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

# Database path
DB_PATH = os.path.expanduser("~/media-asset-tracker/asset-db.sqlite")

def get_cataloged_drives(mounted_only=True):
    """Get all cataloged drives from the database, optionally filtering for currently mounted drives"""
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return []
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, label, volume_name, mount_point FROM drives")
        drives = cursor.fetchall()
        
        if mounted_only:
            # Filter for drives that are currently mounted
            mounted_drives = []
            for drive in drives:
                drive_id, label, volume_name, mount_point = drive
                if mount_point and os.path.exists(mount_point):
                    name_display = label or volume_name
                    mounted_drives.append(drive)
                    print(f"✓ Drive {name_display} is mounted at {mount_point}")
                else:
                    name_display = label or volume_name
                    print(f"✗ Drive {name_display} is not currently mounted (mount point: {mount_point})")
            return mounted_drives
        else:
            return drives
    finally:
        conn.close()

def find_r3d_files_without_thumbnails(drive_id, drive_mount_point):
    """Find all R3D files in the database that don't have thumbnails"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Find all R3D files for this drive without thumbnails
        cursor.execute("""
            SELECT id, path 
            FROM files 
            WHERE drive_id = ? AND 
                  LOWER(extension) = 'r3d' AND 
                  (thumbnail_path IS NULL OR thumbnail_path = '')
        """, (drive_id,))
        
        r3d_files = cursor.fetchall()
        
        # Convert to full paths
        full_paths = []
        for file_id, rel_path in r3d_files:
            full_path = os.path.join(drive_mount_point, rel_path)
            if os.path.exists(full_path):
                full_paths.append((file_id, full_path))
            else:
                print(f"Warning: File {rel_path} not found at {full_path}")
        
        return full_paths
    finally:
        conn.close()

def update_thumbnail_path(file_id, thumbnail_path):
    """Update the thumbnail path in the database for a file"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            UPDATE files 
            SET thumbnail_path = ? 
            WHERE id = ?
        """, (thumbnail_path, file_id))
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()

def get_clip_duration(clip_path):
    """Try to get the clip duration from the R3D file"""
    try:
        # First try with REDline
        cmd = [
            "/usr/local/bin/REDline",
            "--i", clip_path,
            "--listClip"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        output = result.stdout
        
        # Try to find frame count information
        import re
        frame_match = re.search(r"Frame Count:\s+(\d+)", output)
        if frame_match:
            return int(frame_match.group(1))
        else:
            # Default to 100 frames if we can't determine
            return 100
    except Exception as e:
        print(f"Warning: Could not determine clip duration: {e}")
        return 100  # Default to 100 frames

def extract_single_frame(r3d_path, output_dir, frame_number=None, width=320, height=240, timeout=300):
    """
    Extract a single frame from an R3D file using REDline
    
    Args:
        r3d_path: Path to the R3D file
        output_dir: Directory to save output
        frame_number: Specific frame number to extract (defaults to middle frame)
        width: Output width
        height: Output height
        timeout: Timeout in seconds
        
    Returns:
        Path to the extracted frame or None if failed
    """
    # Create temporary working directory
    temp_dir = os.path.join(output_dir, f"temp_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)
    
    # Create unique thumbnail filename for final output
    file_basename = os.path.basename(r3d_path)
    thumbnail_name = f"{os.path.splitext(file_basename)[0]}_{uuid.uuid4().hex[:8]}.jpg"
    final_thumbnail_path = os.path.join(output_dir, thumbnail_name)
    
    # Generate a temporary output pattern for REDline
    temp_output_pattern = os.path.join(temp_dir, "frame_%05d.jpg")
    
    # Determine middle frame if not specified
    if frame_number is None:
        total_frames = get_clip_duration(r3d_path)
        frame_number = total_frames // 2
        print(f"Using middle frame ({frame_number}) of ~{total_frames} total frames")
    
    # Create the REDline command
    cmd = [
        "/usr/local/bin/REDline",
        "--i", r3d_path,
        "--format", "3",  # JPEG format
        "--start", str(frame_number),
        "--frameCount", "1",  # Just one frame
        "--resizeX", str(width),
        "--resizeY", str(height),
        "--o", temp_output_pattern
    ]
    
    cmd_str = " ".join(cmd)
    print(f"Running: {cmd_str}")
    
    try:
        # Execute REDline
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        # Monitor process and output
        start_time = time.time()
        while process.poll() is None:
            # Check if we've exceeded the timeout
            if time.time() - start_time > timeout:
                print(f"Timeout after {timeout} seconds, terminating...")
                process.terminate()
                break
                
            # Sleep briefly to avoid CPU spinning
            time.sleep(0.5)
            
            # Check if any frames have been generated
            generated_frames = list(Path(temp_dir).glob("frame_*.jpg"))
            if generated_frames:
                # Find the first valid frame
                for frame_path in sorted(generated_frames):
                    if os.path.getsize(frame_path) > 0:
                        # Copy the first valid frame to the final location
                        shutil.copy2(frame_path, final_thumbnail_path)
                        print(f"Found frame, copied to {final_thumbnail_path}")
                        
                        # We got our thumbnail, terminate REDline
                        process.terminate()
                        return final_thumbnail_path
        
        # Check if REDline completed successfully
        if process.returncode == 0:
            # Look for generated frames
            generated_frames = list(Path(temp_dir).glob("frame_*.jpg"))
            if generated_frames:
                # Find the first valid frame
                for frame_path in sorted(generated_frames):
                    if os.path.getsize(frame_path) > 0:
                        # Copy the first valid frame to the final location
                        shutil.copy2(frame_path, final_thumbnail_path)
                        print(f"REDline completed, copied frame to {final_thumbnail_path}")
                        return final_thumbnail_path
            
            print("REDline completed but no frames were found")
        else:
            print(f"REDline failed with return code: {process.returncode}")
        
        return None
    
    except Exception as e:
        print(f"Error extracting frame: {e}")
        return None
    finally:
        # Clean up temporary directory
        try:
            shutil.rmtree(temp_dir)
            print(f"Cleaned up temporary directory: {temp_dir}")
        except Exception as e:
            print(f"Error cleaning up temporary directory: {e}")

def process_r3d_thumbnails(drive_filter=None, frame_number=None, width=640, height=480, limit=None, summary_interval=10, timeout=300):
    """Generate thumbnails for all R3D files in cataloged drives"""
    # Get all mounted drives
    drives = get_cataloged_drives(mounted_only=True)
    
    if not drives:
        print("No mounted drives found.")
        return
    
    # If a drive filter is provided, only process that drive
    if drive_filter:
        drives = [d for d in drives if (drive_filter in d[1] or drive_filter in d[2] or drive_filter in d[0])]
        if not drives:
            print(f"No mounted drives found matching filter '{drive_filter}'.")
            return
    
    print(f"\nFound {len(drives)} mounted drives to process")
    
    # Process each drive
    total_files = 0
    total_processed = 0
    total_updated = 0
    total_failed = 0
    
    for drive in drives:
        drive_id, label, volume_name, mount_point = drive
        drive_name = label or volume_name
        
        print(f"\n=== Processing drive: {drive_name} ===")
        print(f"Mount point: {mount_point}")
        print(f"Drive ID: {drive_id}")
        
        # Find all R3D files without thumbnails
        r3d_files = find_r3d_files_without_thumbnails(drive_id, mount_point)
        
        # Apply limit if specified
        if limit and len(r3d_files) > limit:
            print(f"Limiting to {limit} files (out of {len(r3d_files)} total files)")
            r3d_files = r3d_files[:limit]
        
        # Show file count
        file_count = len(r3d_files)
        total_files += file_count
        print(f"Found {file_count} R3D files without thumbnails")
        
        # Process each file
        start_time = time.time()
        
        # Create a thumbnail directory for this drive
        thumbnail_dir = os.path.expanduser(f"~/media-asset-tracker/thumbnails/{drive_id}")
        os.makedirs(thumbnail_dir, exist_ok=True)
        
        for i, (file_id, file_path) in enumerate(r3d_files, 1):
            file_basename = os.path.basename(file_path)
            rel_path = os.path.relpath(file_path, mount_point)
            
            # Show progress
            if i % summary_interval == 0 or i == 1 or i == file_count:
                elapsed_time = time.time() - start_time
                files_per_second = i / elapsed_time if elapsed_time > 0 else 0
                eta_seconds = (file_count - i) / files_per_second if files_per_second > 0 else 0
                eta_str = time.strftime("%H:%M:%S", time.gmtime(eta_seconds))
                
                print(f"\nProgress: {i}/{file_count} ({i/file_count*100:.1f}%) | {files_per_second:.2f} files/sec | ETA: {eta_str}")
            
            print(f"[{i}/{file_count}] Processing: {rel_path}", end=" ", flush=True)
            
            # Extract thumbnail
            thumbnail_path = None
            try:
                thumbnail_path = extract_single_frame(file_path, thumbnail_dir, frame_number, width, height, timeout)
                
                if thumbnail_path:
                    # Update database with thumbnail path
                    updated = update_thumbnail_path(file_id, thumbnail_path)
                    if updated:
                        total_processed += 1
                        total_updated += 1
                        print("✓")
                    else:
                        print("✓ (generated thumbnail but database update failed)")
                        total_processed += 1
                        total_failed += 1
                else:
                    print("✗ (thumbnail extraction failed)")
                    total_failed += 1
            except Exception as e:
                print(f"✗ (error: {e})")
                total_failed += 1
    
    # Print summary
    print("\n=== THUMBNAIL PROCESSING SUMMARY ===")
    print(f"Total drives processed: {len(drives)}")
    print(f"Total R3D files found: {total_files}")
    print(f"Successfully processed: {total_processed}")
    print(f"Database entries updated: {total_updated}")
    print(f"Failed: {total_failed}")
    
    if total_processed > 0:
        success_rate = (total_processed / total_files) * 100 if total_files > 0 else 0
        print(f"Success rate: {success_rate:.1f}%")
    
    print(f"Thumbnails saved to: ~/media-asset-tracker/thumbnails/")

def main():
    parser = argparse.ArgumentParser(
        description="Extract thumbnails from R3D files in already cataloged drives"
    )
    
    parser.add_argument(
        "-d", "--drive",
        help="Filter for a specific drive by ID, label, or volume name"
    )
    
    parser.add_argument(
        "-f", "--frame",
        type=int,
        help="Specific frame number to extract (defaults to middle frame)"
    )
    
    parser.add_argument(
        "-w", "--width",
        type=int,
        default=640,
        help="Thumbnail width (default: 640)"
    )
    
    parser.add_argument(
        "-t", "--height",
        type=int,
        default=480,
        help="Thumbnail height (default: 480)"
    )
    
    parser.add_argument(
        "-l", "--limit",
        type=int,
        help="Limit number of files to process per drive"
    )
    
    parser.add_argument(
        "-s", "--summary-interval",
        type=int,
        default=10,
        help="Show detailed progress every N files (default: 10)"
    )
    
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Timeout in seconds for REDline processing (default: 300)"
    )
    
    args = parser.parse_args()
    
    process_r3d_thumbnails(args.drive, args.frame, args.width, args.height, args.limit, args.summary_interval, args.timeout)

if __name__ == "__main__":
    main()