#!/usr/bin/env python3
"""
REDline Thumbnail Extractor
--------------------------
Uses RED-supplied tools to directly extract thumbnails from R3D files
"""

import os
import sys
import sqlite3
import argparse
import glob
import time
import uuid
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

def extract_redline_thumbnail(r3d_path, output_dir, timeout=300):
    """
    Extract a thumbnail from an R3D file using REDline
    
    Returns:
        Path to the extracted thumbnail or None if failed
    """
    # Create unique thumbnail filename
    file_basename = os.path.basename(r3d_path)
    thumbnail_name = f"{os.path.splitext(file_basename)[0]}_{uuid.uuid4().hex[:8]}.jpg"
    thumbnail_path = os.path.join(output_dir, thumbnail_name)
    
    # Create a shell script to run REDline with extended timeout
    script_path = os.path.join(output_dir, f"extract_thumb_{uuid.uuid4().hex[:8]}.sh")
    with open(script_path, "w") as f:
        f.write(f"""#!/bin/bash
export LD_LIBRARY_PATH=/usr/local/lib:/usr/lib:/lib
echo "Extracting thumbnail for {r3d_path}..."
echo "Output path: {thumbnail_path}"
/usr/local/bin/REDline --i "{r3d_path}" --format 3 --resizeX 320 --resizeY 240 --o "{thumbnail_path}"
exit_code=$?
echo "REDline exit code: $exit_code"
exit $exit_code
""")
    
    # Make the script executable
    os.chmod(script_path, 0o755)
    
    try:
        # Run the script
        print(f"Running REDline extraction script...")
        proc = subprocess.Popen(script_path, shell=True)
        
        # Wait for process to complete or timeout
        for i in range(timeout):
            if proc.poll() is not None:  # Process finished
                break
            
            # Check if thumbnail was created
            if os.path.exists(thumbnail_path) and os.path.getsize(thumbnail_path) > 0:
                print(f"Thumbnail created after {i} seconds")
                # Kill the process since we have our thumbnail
                proc.terminate()
                break
                
            # Wait a bit
            time.sleep(1)
            
            # Print progress dot every 10 seconds
            if i % 10 == 0:
                print(".", end="", flush=True)
        
        # Check if we have a thumbnail
        if os.path.exists(thumbnail_path) and os.path.getsize(thumbnail_path) > 0:
            print(f"Thumbnail extracted successfully: {thumbnail_path}")
            return thumbnail_path
        else:
            # If REDline is still running, kill it
            if proc.poll() is None:
                print("Terminating REDline process due to timeout")
                proc.terminate()
            print("Thumbnail extraction failed")
            return None
    
    except Exception as e:
        print(f"Error extracting thumbnail: {e}")
        return None
    finally:
        # Clean up script
        if os.path.exists(script_path):
            os.remove(script_path)

def process_r3d_thumbnails(drive_filter=None, limit=None, summary_interval=10, timeout=300):
    """Generate thumbnails for all R3D files in cataloged drives"""
    # Get all mounted drives
    drives = get_cataloged_drives(mounted_only=True)
    
    if not drives:
        print("No mounted drives found.")
        return
    
    # If a drive filter is provided, only process that drive
    if drive_filter:
        drives = [d for d in drives if drive_filter in d[1] or drive_filter in d[2] or drive_filter in d[0]]
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
                thumbnail_path = extract_redline_thumbnail(file_path, thumbnail_dir, timeout)
                
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
        "-t", "--timeout",
        type=int,
        default=300,
        help="Timeout in seconds for REDline processing (default: 300)"
    )
    
    args = parser.parse_args()
    
    process_r3d_thumbnails(args.drive, args.limit, args.summary_interval, args.timeout)

if __name__ == "__main__":
    main()