"""
Video thumbnail generation functionality for VaultKeeper.

This module provides functions for generating thumbnails from video files.
"""

import os
import subprocess
import uuid
from pathlib import Path
from typing import Optional, Union

# Constants
DEFAULT_THUMBNAIL_WIDTH = 320


def probe_video_duration(file_path: str) -> float:
    """Get the duration of a video file using ffprobe.
    
    Args:
        file_path: Path to the video file
        
    Returns:
        Duration in seconds
    """
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        duration = float(result.stdout.strip())
        return duration
    except subprocess.CalledProcessError as e:
        print(f"Error probing video duration: {e}")
        return 0.0
    except ValueError:
        print("Could not parse video duration")
        return 0.0


def is_red_video(file_path: str) -> bool:
    """Check if the file is a RED video file.
    
    Args:
        file_path: Path to the video file
        
    Returns:
        True if it's a RED video file, False otherwise
    """
    # Check file extension
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".r3d":
        return True
        
    # Check file header
    try:
        with open(file_path, "rb") as f:
            header = f.read(16)
            # RED files typically have "RED" in the first few bytes
            if b"RED" in header:
                return True
    except Exception:
        pass
        
    return False


def generate_thumbnail_from_r3d(file_path: str, output_path: str, time_pos: Optional[float] = None,
                              width: int = DEFAULT_THUMBNAIL_WIDTH) -> str:
    """Generate a thumbnail from a RED (.r3d) video file.
    
    Args:
        file_path: Path to the R3D file
        output_path: Path to save the thumbnail
        time_pos: Time position in seconds (default: middle of video)
        width: Width of the thumbnail in pixels
        
    Returns:
        Path to the generated thumbnail
    """
    # Check if REDline tools are available
    try:
        result = subprocess.run(["which", "REDline"], capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError("REDline tools not found. Cannot process R3D files.")
    except Exception:
        # Fallback to ffmpeg if REDline is not available
        print("REDline not found, attempting to use ffmpeg for R3D files")
        return generate_thumbnail_from_video(file_path, output_path, time_pos, width)
        
    # Get video duration using REDline if time_pos not specified
    if time_pos is None:
        try:
            result = subprocess.run(
                ["REDline", "--i", file_path, "--info"],
                capture_output=True,
                text=True
            )
            
            # Parse output to find duration
            duration = 0.0
            for line in result.stdout.split("\n"):
                if "Duration:" in line:
                    time_parts = line.split("Duration:")[1].strip().split(":")
                    if len(time_parts) == 3:
                        hours, minutes, seconds = time_parts
                        duration = (
                            float(hours) * 3600 +
                            float(minutes) * 60 +
                            float(seconds)
                        )
                        break
                        
            # Use middle point of video
            if duration > 0:
                time_pos = duration / 2
            else:
                time_pos = 0
        except Exception as e:
            print(f"Error getting R3D duration: {e}")
            time_pos = 0
            
    # Use REDline to extract a frame
    try:
        cmd = [
            "REDline",
            "--i", file_path,
            "--outDir", os.path.dirname(output_path),
            "--outType", "jpg",
            "--frameRange", f"{time_pos}",
            "--resize", f"{width}",
        ]
        
        subprocess.run(cmd, check=True)
        
        # REDline generates files with its own naming convention
        # We need to find the generated file and rename it
        output_dir = os.path.dirname(output_path)
        for f in os.listdir(output_dir):
            if f.startswith(os.path.basename(file_path).split(".")[0]) and f.endswith(".jpg"):
                generated_path = os.path.join(output_dir, f)
                os.rename(generated_path, output_path)
                return output_path
                
        # If we can't find the generated file, fall back to ffmpeg
        return generate_thumbnail_from_video(file_path, output_path, time_pos, width)
    except Exception as e:
        print(f"Error generating R3D thumbnail with REDline: {e}")
        # Fall back to ffmpeg
        return generate_thumbnail_from_video(file_path, output_path, time_pos, width)


def generate_thumbnail_from_video(file_path: str, output_path: str, time_pos: Optional[float] = None,
                                width: int = DEFAULT_THUMBNAIL_WIDTH) -> str:
    """Generate a thumbnail from a video file using ffmpeg.
    
    Args:
        file_path: Path to the video file
        output_path: Path to save the thumbnail
        time_pos: Time position in seconds (default: middle of video)
        width: Width of the thumbnail in pixels
        
    Returns:
        Path to the generated thumbnail
    """
    # Get video duration if time_pos not specified
    if time_pos is None:
        duration = probe_video_duration(file_path)
        if duration > 0:
            time_pos = duration / 2
        else:
            time_pos = 0
            
    # Calculate aspect ratio for height (maintain original aspect ratio)
    height = -2  # This tells ffmpeg to maintain the aspect ratio
    
    # Generate thumbnail with ffmpeg
    try:
        cmd = [
            "ffmpeg",
            "-ss", str(time_pos),
            "-i", file_path,
            "-vframes", "1",
            "-vf", f"scale={width}:{height}",
            "-y",  # Overwrite output file if it exists
            output_path
        ]
        
        subprocess.run(cmd, capture_output=True, check=True)
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"Error generating thumbnail with ffmpeg: {e}")
        raise RuntimeError(f"Failed to generate thumbnail: {e}")


def generate_thumbnail(file_path: str, output_dir: Optional[str] = None, 
                      time_pos: Optional[float] = None,
                      width: int = DEFAULT_THUMBNAIL_WIDTH) -> str:
    """Generate a thumbnail from a video file.
    
    Args:
        file_path: Path to the video file
        output_dir: Directory to save the thumbnail (default: ~/.vaultkeeper/thumbnails)
        time_pos: Time position in seconds (default: middle of video)
        width: Width of the thumbnail in pixels
        
    Returns:
        Path to the generated thumbnail
    """
    # Determine output directory
    if not output_dir:
        output_dir = os.path.expanduser("~/.vaultkeeper/thumbnails")
        
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Generate a unique filename for the thumbnail
    filename = os.path.basename(file_path)
    name, _ = os.path.splitext(filename)
    thumbnail_filename = f"{name}_{uuid.uuid4().hex[:8]}.jpg"
    output_path = os.path.join(output_dir, thumbnail_filename)
    
    # Generate thumbnail based on file type
    if is_red_video(file_path):
        return generate_thumbnail_from_r3d(file_path, output_path, time_pos, width)
    else:
        return generate_thumbnail_from_video(file_path, output_path, time_pos, width)


def batch_generate_thumbnails(file_paths: list, output_dir: Optional[str] = None,
                             width: int = DEFAULT_THUMBNAIL_WIDTH) -> dict:
    """Generate thumbnails for multiple video files.
    
    Args:
        file_paths: List of paths to video files
        output_dir: Directory to save the thumbnails
        width: Width of the thumbnails in pixels
        
    Returns:
        Dictionary mapping file paths to thumbnail paths
    """
    results = {}
    
    for file_path in file_paths:
        try:
            thumbnail_path = generate_thumbnail(file_path, output_dir, width=width)
            results[file_path] = thumbnail_path
        except Exception as e:
            print(f"Error generating thumbnail for {file_path}: {e}")
            results[file_path] = None
            
    return results