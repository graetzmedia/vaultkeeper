"""
Drive scanning functionality for VaultKeeper.

This module provides functions for scanning drives, extracting file information,
and populating the database with the results.
"""

import hashlib
import os
import shutil
import stat
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import magic
from tqdm import tqdm

from vaultkeeper.core.database import Database


def get_drive_info(mount_point: str) -> Dict[str, Any]:
    """Get drive information at the specified mount point.
    
    Args:
        mount_point: Path to the mounted drive
        
    Returns:
        Dictionary containing drive information
    """
    if not os.path.exists(mount_point):
        raise ValueError(f"Mount point {mount_point} does not exist")
        
    # Get drive information
    drive_info = {
        "id": str(uuid.uuid4()),
        "label": os.path.basename(mount_point),
        "volume_name": os.path.basename(mount_point),
        "date_cataloged": datetime.utcnow(),
        "last_updated": datetime.utcnow(),
    }
    
    # Get drive size information
    try:
        stat_info = os.statvfs(mount_point)
        total_size = stat_info.f_frsize * stat_info.f_blocks
        free_size = stat_info.f_frsize * stat_info.f_bfree
        used_size = total_size - free_size
        
        drive_info["size_bytes"] = total_size
        drive_info["used_bytes"] = used_size
        drive_info["free_bytes"] = free_size
        drive_info["filesystem"] = get_filesystem(mount_point)
    except Exception as e:
        print(f"Error getting drive size information: {e}")
        
    # Try to get additional drive information if available
    try:
        if sys.platform == "linux":
            get_linux_drive_info(mount_point, drive_info)
        elif sys.platform == "darwin":
            get_macos_drive_info(mount_point, drive_info)
        elif sys.platform == "win32":
            get_windows_drive_info(mount_point, drive_info)
    except Exception as e:
        print(f"Error getting additional drive information: {e}")
        
    return drive_info


def get_filesystem(mount_point: str) -> str:
    """Get filesystem type of the drive.
    
    Args:
        mount_point: Path to the mounted drive
        
    Returns:
        Filesystem type string
    """
    try:
        if sys.platform == "linux":
            # Get filesystem using df command
            result = subprocess.run(
                ["df", "-T", mount_point], 
                capture_output=True, 
                text=True, 
                check=True
            )
            lines = result.stdout.strip().split("\n")
            if len(lines) > 1:
                fields = lines[1].split()
                if len(fields) > 1:
                    return fields[1]
        elif sys.platform == "darwin":
            # Get filesystem using df command
            result = subprocess.run(
                ["df", "-T", mount_point], 
                capture_output=True, 
                text=True, 
                check=True
            )
            lines = result.stdout.strip().split("\n")
            if len(lines) > 1:
                fields = lines[1].split()
                if len(fields) > 1:
                    return fields[0]
        elif sys.platform == "win32":
            # Windows - use fsutil
            result = subprocess.run(
                ["fsutil", "fsinfo", "volumeinfo", mount_point],
                capture_output=True,
                text=True,
                check=True
            )
            for line in result.stdout.split("\n"):
                if "File System Name" in line:
                    return line.split(":")[-1].strip()
    except Exception as e:
        print(f"Error determining filesystem: {e}")
    
    return "unknown"


def get_linux_drive_info(mount_point: str, drive_info: Dict[str, Any]) -> None:
    """Get additional drive information on Linux.
    
    Args:
        mount_point: Path to the mounted drive
        drive_info: Dictionary to update with drive information
    """
    try:
        # Try to get the device path for the mount point
        result = subprocess.run(
            ["findmnt", "-n", "-o", "SOURCE", mount_point],
            capture_output=True,
            text=True,
            check=True
        )
        device_path = result.stdout.strip()
        
        if device_path and device_path.startswith("/dev/"):
            # Try to get drive model and vendor using lsblk
            result = subprocess.run(
                ["lsblk", "-n", "-o", "MODEL,VENDOR,SERIAL", device_path],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                fields = result.stdout.strip().split(maxsplit=2)
                if len(fields) >= 1:
                    drive_info["model"] = fields[0]
                if len(fields) >= 2:
                    drive_info["vendor"] = fields[1]
                if len(fields) >= 3:
                    drive_info["serial_number"] = fields[2]
            
            # Determine drive type (HDD or SSD)
            drive_info["drive_type"] = "HDD"  # Default
            try:
                # Check if it's a rotational drive (HDD) or not (SSD)
                rotational_path = f"/sys/block/{os.path.basename(device_path)}/queue/rotational"
                if os.path.exists(rotational_path):
                    with open(rotational_path, "r") as f:
                        if f.read().strip() == "0":
                            drive_info["drive_type"] = "SSD"
            except Exception:
                pass
    except Exception as e:
        print(f"Error getting Linux drive info: {e}")


def get_macos_drive_info(mount_point: str, drive_info: Dict[str, Any]) -> None:
    """Get additional drive information on macOS.
    
    Args:
        mount_point: Path to the mounted drive
        drive_info: Dictionary to update with drive information
    """
    try:
        # Use diskutil to get drive information
        result = subprocess.run(
            ["diskutil", "info", mount_point],
            capture_output=True,
            text=True,
            check=True
        )
        
        output = result.stdout
        for line in output.split("\n"):
            line = line.strip()
            if ":" not in line:
                continue
                
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            
            if "Volume Name" in key:
                drive_info["volume_name"] = value
            elif "Device / Media Name" in key:
                drive_info["model"] = value
            elif "File System Personality" in key:
                drive_info["filesystem"] = value
            elif "Disk Type" in key and "SSD" in value:
                drive_info["drive_type"] = "SSD"
            elif "Disk Type" in key:
                drive_info["drive_type"] = "HDD"
    except Exception as e:
        print(f"Error getting macOS drive info: {e}")


def get_windows_drive_info(mount_point: str, drive_info: Dict[str, Any]) -> None:
    """Get additional drive information on Windows.
    
    Args:
        mount_point: Path to the mounted drive
        drive_info: Dictionary to update with drive information
    """
    try:
        # Windows implementation for drive info
        drive_letter = mount_point[:2]  # Example: "C:"
        
        # Get volume information
        result = subprocess.run(
            ["wmic", "logicaldisk", "where", f"DeviceID='{drive_letter}'", "get", "VolumeName"],
            capture_output=True,
            text=True,
            check=True
        )
        lines = result.stdout.strip().split("\n")
        if len(lines) > 1:
            drive_info["volume_name"] = lines[1].strip()
            
        # Get drive type
        result = subprocess.run(
            ["wmic", "diskdrive", "get", "Model,InterfaceType,MediaType"],
            capture_output=True,
            text=True,
            check=True
        )
        lines = result.stdout.strip().split("\n")
        if len(lines) > 1:
            for line in lines[1:]:
                if "SSD" in line:
                    drive_info["drive_type"] = "SSD"
                    fields = line.split(maxsplit=2)
                    if len(fields) >= 1:
                        drive_info["model"] = fields[0].strip()
                    break
            else:
                drive_info["drive_type"] = "HDD"
    except Exception as e:
        print(f"Error getting Windows drive info: {e}")


def calculate_checksum(file_path: str, algorithm: str = "md5", buffer_size: int = 8192) -> str:
    """Calculate file checksum using specified algorithm.
    
    Args:
        file_path: Path to the file
        algorithm: Hash algorithm to use (md5, sha1, sha256)
        buffer_size: Size of buffer for reading file
        
    Returns:
        Hexadecimal string of the file hash
    """
    if algorithm == "md5":
        hasher = hashlib.md5()
    elif algorithm == "sha1":
        hasher = hashlib.sha1()
    elif algorithm == "sha256":
        hasher = hashlib.sha256()
    else:
        raise ValueError(f"Unsupported hash algorithm: {algorithm}")
        
    try:
        with open(file_path, "rb") as f:
            buf = f.read(buffer_size)
            while buf:
                hasher.update(buf)
                buf = f.read(buffer_size)
                
        return hasher.hexdigest()
    except Exception as e:
        print(f"Error calculating checksum for {file_path}: {e}")
        return ""


def is_media_file(file_path: str, mime_type: Optional[str] = None) -> bool:
    """Determine if a file is a media file (video, audio, image).
    
    Args:
        file_path: Path to the file
        mime_type: Optional MIME type if already known
        
    Returns:
        True if the file is a media file, False otherwise
    """
    if not mime_type:
        try:
            mime_type = magic.from_file(file_path, mime=True)
        except Exception:
            # If mime detection fails, try to use the file extension
            ext = os.path.splitext(file_path)[1].lower()
            return ext in [
                ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".mxf", ".r3d",
                ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac",
                ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"
            ]
    
    if mime_type:
        return (
            mime_type.startswith("video/") or
            mime_type.startswith("audio/") or
            mime_type.startswith("image/") or
            # Handle some special cases
            "mxf" in mime_type or
            "quicktime" in mime_type or
            "red" in mime_type
        )
    
    return False


def scan_drive(mount_point: str, db: Database, label: Optional[str] = None,
               calculate_checksums: bool = False, verbose: bool = False) -> str:
    """Scan a drive and add all files to the database.
    
    Args:
        mount_point: Path to the mounted drive
        db: Database instance
        label: Optional custom label for the drive
        calculate_checksums: Whether to calculate checksums for files
        verbose: Whether to show verbose output
        
    Returns:
        Drive ID
    """
    # Get drive information
    drive_info = get_drive_info(mount_point)
    
    # Use custom label if provided
    if label:
        drive_info["label"] = label
        
    # Add drive to database
    drive_id = db.add_drive(drive_info)
    
    # Count total files for progress reporting
    total_files = 0
    if verbose:
        print("Counting files...")
        for root, _, files in os.walk(mount_point):
            total_files += len(files)
        print(f"Found {total_files} files to scan")
    
    # Scan all files
    scanned_files = 0
    with tqdm(total=total_files, disable=not verbose) as progress_bar:
        for root, _, files in os.walk(mount_point):
            for filename in files:
                try:
                    file_path = os.path.join(root, filename)
                    
                    # Skip if not a regular file
                    if not os.path.isfile(file_path):
                        continue
                        
                    # Get file stats
                    try:
                        file_stat = os.stat(file_path)
                    except (FileNotFoundError, PermissionError):
                        continue
                        
                    # Get file information
                    rel_path = os.path.relpath(file_path, mount_point)
                    file_size = file_stat.st_size
                    file_created = datetime.fromtimestamp(file_stat.st_ctime)
                    file_modified = datetime.fromtimestamp(file_stat.st_mtime)
                    file_accessed = datetime.fromtimestamp(file_stat.st_atime)
                    
                    # Get file extension
                    _, extension = os.path.splitext(filename)
                    if extension:
                        extension = extension[1:].lower()  # Remove the dot and lowercase
                        
                    # Get MIME type
                    try:
                        mime_type = magic.from_file(file_path, mime=True)
                    except Exception:
                        mime_type = None
                        
                    # Determine if it's a media file
                    is_media = is_media_file(file_path, mime_type)
                    
                    # Calculate checksum if requested
                    checksum = None
                    if calculate_checksums:
                        checksum = calculate_checksum(file_path)
                        
                    # Create file record
                    file_id = str(uuid.uuid4())
                    file_info = {
                        "id": file_id,
                        "drive_id": drive_id,
                        "path": rel_path,
                        "filename": filename,
                        "extension": extension,
                        "size_bytes": file_size,
                        "created_time": file_created,
                        "modified_time": file_modified,
                        "accessed_time": file_accessed,
                        "mime_type": mime_type,
                        "checksum": checksum,
                        "is_media": is_media,
                    }
                    
                    # Add file to database
                    db.add_file(file_info)
                    scanned_files += 1
                    
                except Exception as e:
                    if verbose:
                        print(f"Error scanning file {filename}: {e}")
                        
                if verbose:
                    progress_bar.update(1)
                    
    if verbose:
        print(f"Scan complete. Added {scanned_files} files to database.")
        
    return drive_id