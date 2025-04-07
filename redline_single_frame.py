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
import re
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
        print(f"Found {len(r3d_files)} R3D files without thumbnails in database")
        
        # Convert to full paths
        full_paths = []
        for file_id, rel_path in r3d_files:
            full_path = os.path.join(drive_mount_point, rel_path)
            if os.path.exists(full_path):
                full_paths.append((file_id, full_path))
            else:
                print(f"Warning: File {rel_path} not found at {full_path}")
        
        print(f"Successfully resolved {len(full_paths)} full paths")
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

def update_thumbnails_for_rdc_group(file_ids, thumbnail_path):
    """Update the thumbnail path for all files in an RDC group"""
    if not file_ids:
        print("ERROR: No file IDs provided to update_thumbnails_for_rdc_group")
        return 0
        
    print(f"Updating {len(file_ids)} files with thumbnail: {thumbnail_path}")
    print(f"File IDs: {file_ids[:5]}{'...' if len(file_ids) > 5 else ''}")
    
    total_updated = 0
    conn = sqlite3.connect(DB_PATH)
    
    try:
        # Update files in batches to avoid query parameter limits
        batch_size = 100
        batches = [file_ids[i:i+batch_size] for i in range(0, len(file_ids), batch_size)]
        
        print(f"Updating files in {len(batches)} batches of max {batch_size} each")
        
        for batch_idx, batch in enumerate(batches):
            cursor = conn.cursor()
            placeholders = ','.join(['?'] * len(batch))
            query = f"UPDATE files SET thumbnail_path = ? WHERE id IN ({placeholders})"
            params = [thumbnail_path] + batch
            
            # Execute the update for this batch
            try:
                cursor.execute(query, params)
                conn.commit()
                batch_updated = cursor.rowcount
                total_updated += batch_updated
                print(f"Batch {batch_idx+1}/{len(batches)}: Updated {batch_updated}/{len(batch)} files")
            except Exception as e:
                print(f"Error in batch {batch_idx+1}: {e}")
                conn.rollback()
        
        print(f"Successfully updated {total_updated} out of {len(file_ids)} files")
        return total_updated
    except Exception as e:
        print(f"ERROR in update_thumbnails_for_rdc_group: {e}")
        return 0
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

def extract_single_frame(r3d_path, output_dir, frame_number=None, width=640, height=480, timeout=300):
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

def extract_clip_info(file_path):
    """
    Extract clip information from a RED file path
    Returns a tuple of (clip_prefix, rdc_folder_name)
    """
    # Extract clip name pattern (like A001_C001)
    file_name = os.path.basename(file_path)
    clip_match = re.match(r'^([A-Z]\d{3}_[A-Z]\d{3}).*\.[Rr]3[Dd]$', file_name)
    clip_prefix = clip_match.group(1) if clip_match else None
    
    # Look for RDC folder in path
    norm_path = os.path.normpath(file_path)
    path_parts = norm_path.split(os.sep)
    
    rdc_folder = None
    for part in path_parts:
        if part.upper().endswith(".RDC"):
            rdc_folder = part
            break
    
    return (clip_prefix, rdc_folder)

def get_rdc_group_key(file_path):
    """
    Generate a unique key for grouping R3D files from the same clip.
    
    The key is based on:
    1. The RDC folder name if present
    2. The clip prefix (A001_C001) if present
    3. A combination of both if both are present
    
    Returns None if not an R3D file or can't determine grouping
    """
    # Only process R3D files
    if not file_path.upper().endswith('.R3D'):
        return None
    
    try:
        # Extract the directory containing the file
        dir_path = os.path.dirname(file_path)
        
        # Try to find RDC folder in the path
        path_parts = os.path.normpath(dir_path).split(os.sep)
        rdc_folder = None
        
        # Look for RDC folder (either named RDC or ending with .RDC)
        for part in path_parts:
            if part.upper() == "RDC" or part.upper().endswith(".RDC"):
                rdc_folder = part
                break
        
        # If no RDC folder found, this is a standalone R3D file
        if not rdc_folder:
            return None
            
        # Extract clip info from filename (looking for patterns like A001_C001_XXXXXX.R3D)
        file_name = os.path.basename(file_path)
        clip_match = re.match(r'^([A-Z]\d{3}_[A-Z]\d{3}).*\.[Rr]3[Dd]$', file_name)
        
        if clip_match:
            # If we have both RDC folder and clip pattern, use both for the key
            clip_prefix = clip_match.group(1)  # e.g., A001_C001
            return f"{rdc_folder}_{clip_prefix}"
        else:
            # If only RDC folder is available, use that
            return rdc_folder
            
    except Exception as e:
        print(f"Error determining RDC group key for {file_path}: {e}")
        return None

def group_r3d_files_by_rdc(r3d_files):
    """
    Group R3D files by their RDC folder and clip prefix.
    Files not in RDC folders are treated individually.
    
    Returns:
        A dictionary where:
        - Keys are RDC group keys
        - Values are lists of (file_id, file_path) tuples
    """
    grouped_files = {}
    rdc_count = 0
    non_rdc_count = 0
    
    # First, try to extract key identifiers for debugging
    if r3d_files:
        sample_file = r3d_files[0][1]
        print(f"Sample file: {sample_file}")
        print(f"  RDC group key: {get_rdc_group_key(sample_file)}")
    
    for file_id, file_path in r3d_files:
        group_key = get_rdc_group_key(file_path)
        
        if group_key:
            # This is an RDC file, group by RDC folder and clip prefix
            if group_key not in grouped_files:
                grouped_files[group_key] = []
                print(f"Found new RDC group: {group_key}")
            
            grouped_files[group_key].append((file_id, file_path))
            rdc_count += 1
        else:
            # Not in an RDC folder, use the file itself as the key
            # Each non-RDC file gets its own group
            file_key = f"single_{file_id}"
            grouped_files[file_key] = [(file_id, file_path)]
            non_rdc_count += 1
    
    print(f"Grouped {len(r3d_files)} files into {len(grouped_files)} groups/folders")
    print(f"Files in RDC groups: {rdc_count}, Standalone files: {non_rdc_count}")
    
    # Print RDC group details
    for group_key, files in grouped_files.items():
        if len(files) > 1:
            print(f"RDC group: {group_key} has {len(files)} files")
            print(f"  First file: {os.path.basename(files[0][1])}")
            print(f"  Last file: {os.path.basename(files[-1][1])}")
    
    return grouped_files

def select_representative_r3d(file_group):
    """
    Select the most representative R3D file from a group.
    For RDC folders, this tries to find the middle clip in the sequence.
    """
    if not file_group:
        return None
    
    # If only one file, return it
    if len(file_group) == 1:
        return file_group[0]
    
    # Sort files by name (which generally sorts by sequence number for RED cameras)
    sorted_files = sorted(file_group, key=lambda x: os.path.basename(x[1]))
    
    # Try to find files that match the pattern A???_???.R3D
    # These are the main camera files, not proxies or other secondary files
    main_files = []
    for file_tuple in sorted_files:
        file_path = file_tuple[1]
        file_name = os.path.basename(file_path)
        # Check if matches the typical RED naming pattern
        if re.match(r'^[A-Za-z]\d{3}_[A-Za-z]\d{3}.*\.[Rr]3[Dd]$', file_name):
            main_files.append(file_tuple)
    
    # If we found main files, use those; otherwise use all files
    files_to_process = main_files if main_files else sorted_files
    
    # Return the middle file in the sequence
    middle_index = len(files_to_process) // 2
    return files_to_process[middle_index]

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
    total_groups = 0
    total_files = 0
    total_processed = 0
    total_updated = 0
    total_skipped = 0
    total_failed = 0
    
    for drive in drives:
        drive_id, label, volume_name, mount_point = drive
        drive_name = label or volume_name
        
        print(f"\n=== Processing drive: {drive_name} ===")
        print(f"Mount point: {mount_point}")
        print(f"Drive ID: {drive_id}")
        
        # Find all R3D files without thumbnails
        r3d_files = find_r3d_files_without_thumbnails(drive_id, mount_point)
        
        # Group files by RDC folder
        grouped_files = group_r3d_files_by_rdc(r3d_files)
        
        # Count total files before limiting
        original_group_count = len(grouped_files)
        original_file_count = sum(len(files) for files in grouped_files.values())
        
        # Apply limit if specified (to groups, not individual files)
        if limit and len(grouped_files) > limit:
            print(f"Limiting to {limit} groups (out of {len(grouped_files)} total groups)")
            # Take first N keys
            keys_to_keep = list(grouped_files.keys())[:limit]
            grouped_files = {k: grouped_files[k] for k in keys_to_keep}
        
        # Show file count
        group_count = len(grouped_files)
        file_count = sum(len(files) for files in grouped_files.values())
        total_groups += group_count
        total_files += file_count
        
        print(f"Found {file_count} R3D files in {group_count} groups/folders")
        print(f"Will process 1 representative file from each group (total: {group_count})")
        
        if group_count < original_group_count:
            print(f"Limited from {original_group_count} to {group_count} groups")
            print(f"Limited from {original_file_count} to {file_count} total files")
        
        # Create a thumbnail directory for this drive
        thumbnail_dir = os.path.expanduser(f"~/media-asset-tracker/thumbnails/{drive_id}")
        os.makedirs(thumbnail_dir, exist_ok=True)
        
        # Process each group
        start_time = time.time()
        group_num = 0
        
        for group_key, file_group in grouped_files.items():
            group_num += 1
            
            # Select representative file
            representative = select_representative_r3d(file_group)
            if not representative:
                print(f"[{group_num}/{group_count}] No files to process in group {group_key}")
                continue
                
            file_id, file_path = representative
            
            # Get relative path for display
            rel_path = os.path.relpath(file_path, mount_point)
            is_rdc = len(file_group) > 1  # If more than one file, it's an RDC group
            
            # Show progress
            if group_num % summary_interval == 0 or group_num == 1 or group_num == group_count:
                elapsed_time = time.time() - start_time
                groups_per_second = group_num / elapsed_time if elapsed_time > 0 else 0
                eta_seconds = (group_count - group_num) / groups_per_second if groups_per_second > 0 else 0
                eta_str = time.strftime("%H:%M:%S", time.gmtime(eta_seconds))
                
                print(f"\nProgress: {group_num}/{group_count} ({group_num/group_count*100:.1f}%) | {groups_per_second:.2f} groups/sec | ETA: {eta_str}")
            
            group_type = "RDC group" if is_rdc else "file"
            file_count_in_group = len(file_group)
            
            print(f"[{group_num}/{group_count}] Processing {group_type}: {rel_path}", end=" ", flush=True)
            if file_count_in_group > 1:
                print(f"({file_count_in_group} files in group)", end=" ", flush=True)
            
            # Extract thumbnail from representative file
            thumbnail_path = None
            try:
                thumbnail_path = extract_single_frame(file_path, thumbnail_dir, frame_number, width, height, timeout)
                
                if thumbnail_path:
                    # Get all file IDs in this group
                    all_file_ids = [f[0] for f in file_group]
                    
                    # For clarity in log messages
                    if len(all_file_ids) > 1:
                        print(f"RDC folder found with {len(all_file_ids)} files - will apply same thumbnail to all")
                    
                    # Update all files in the group with the same thumbnail
                    updated = update_thumbnails_for_rdc_group(all_file_ids, thumbnail_path)
                    
                    if updated > 0:
                        total_processed += 1
                        total_updated += updated
                        print(f"✓ (updated {updated}/{file_count_in_group} files)")
                    else:
                        print("✓ (generated thumbnail but database update failed)")
                        total_processed += 1
                        total_failed += file_count_in_group
                else:
                    print("✗ (thumbnail extraction failed)")
                    total_failed += file_count_in_group
            except Exception as e:
                print(f"✗ (error: {e})")
                total_failed += file_count_in_group
    
    # Print summary
    print("\n=== THUMBNAIL PROCESSING SUMMARY ===")
    print(f"Total drives processed: {len(drives)}")
    print(f"Total R3D groups/folders found: {total_groups}")
    print(f"Total R3D files in groups: {total_files}")
    print(f"Successfully processed groups: {total_processed}")
    print(f"Total files updated with thumbnails: {total_updated}")
    print(f"Failed: {total_failed}")
    
    if total_processed > 0:
        success_rate = (total_processed / total_groups) * 100 if total_groups > 0 else 0
        file_update_rate = (total_updated / total_files) * 100 if total_files > 0 else 0
        print(f"Group success rate: {success_rate:.1f}%")
        print(f"File update rate: {file_update_rate:.1f}%")
    
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
        help="Limit number of groups to process per drive"
    )
    
    parser.add_argument(
        "-s", "--summary-interval",
        type=int,
        default=10,
        help="Show detailed progress every N groups (default: 10)"
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