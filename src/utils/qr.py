"""
QR code generation utilities for VaultKeeper.

This module provides functions for generating QR code labels for drives and locations.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

import qrcode
from PIL import Image, ImageDraw, ImageFont


# Constants for label sizes
LABEL_WIDTH_MM = 40  # NIIMBOT standard width
LABEL_HEIGHT_MM = 20  # Adjust based on label size
DPI = 300  # Print resolution
LABEL_WIDTH_PX = int(LABEL_WIDTH_MM * DPI / 25.4)
LABEL_HEIGHT_PX = int(LABEL_HEIGHT_MM * DPI / 25.4)

# Constants for smaller labels (D101 printer)
SMALL_LABEL_WIDTH_MM = 16  # NIIMBOT D101 width
SMALL_LABEL_HEIGHT_MM = 12  # Adjust based on label size
SMALL_LABEL_WIDTH_PX = int(SMALL_LABEL_WIDTH_MM * DPI / 25.4)
SMALL_LABEL_HEIGHT_PX = int(SMALL_LABEL_HEIGHT_MM * DPI / 25.4)


def get_default_font(size: int) -> ImageFont.FreeTypeFont:
    """Get a default font for QR code labels.
    
    Args:
        size: Font size in points
        
    Returns:
        Font object
    """
    try:
        # Try standard system fonts
        for font_name in ["Arial", "DejaVuSans", "FreeSans", "LiberationSans", "Helvetica"]:
            try:
                return ImageFont.truetype(font_name, size)
            except IOError:
                pass
    except Exception:
        pass
        
    # Fallback to default font
    return ImageFont.load_default()


def generate_drive_label(drive_info: Dict[str, Any], output_dir: Optional[str] = None,
                        small: bool = False) -> str:
    """Generate a printable label for a drive.
    
    Args:
        drive_info: Dictionary containing drive information
        output_dir: Optional directory to save the label image
        small: Whether to generate a small label (for D101 printer)
        
    Returns:
        Path to the generated label image
    """
    # Determine label size
    if small:
        label_width = SMALL_LABEL_WIDTH_PX
        label_height = SMALL_LABEL_HEIGHT_PX
    else:
        label_width = LABEL_WIDTH_PX
        label_height = LABEL_HEIGHT_PX
        
    # Create QR code with drive info
    qr_data = {
        "type": "drive",
        "id": drive_info["id"],
        "label": drive_info["label"],
        "size": f"{int(drive_info['size_bytes'] / (1024**3))}GB",
        "date_cataloged": drive_info["date_cataloged"]
    }
    
    # Create base image
    img = Image.new("RGB", (label_width, label_height), color="white")
    draw = ImageDraw.Draw(img)
    
    # Add QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=0,
    )
    qr.add_data(json.dumps(qr_data))
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # Resize QR code to fit label (left side)
    qr_size = label_height
    qr_img = qr_img.resize((qr_size, qr_size))
    img.paste(qr_img, (0, 0))
    
    # Add text info (right side)
    font_large = get_default_font(14) if not small else get_default_font(10)
    font_small = get_default_font(10) if not small else get_default_font(8)
    
    # Draw text
    text_x = qr_size + 5
    text_width = label_width - text_x
    
    # Drive label (truncate if needed)
    label_text = drive_info["label"]
    if small:
        # Truncate to fit small label
        if len(label_text) > 10:
            label_text = label_text[:8] + ".."
    else:
        # Truncate to fit standard label
        if len(label_text) > 15:
            label_text = label_text[:13] + ".."
            
    draw.text((text_x, 5), label_text, fill="black", font=font_large)
    
    # Size info
    size_gb = int(drive_info["size_bytes"] / (1024**3))
    size_text = f"{size_gb}GB"
    draw.text((text_x, 25 if not small else 20), size_text, fill="black", font=font_small)
    
    # Date info
    date_str = ""
    if isinstance(drive_info["date_cataloged"], str):
        date_str = drive_info["date_cataloged"].split("T")[0]
    else:
        date_str = drive_info["date_cataloged"].strftime("%Y-%m-%d")
        
    # Only show date on standard label (not enough space on small label)
    if not small:
        draw.text((text_x, 40), date_str, fill="black", font=font_small)
    
    # Determine output path
    if not output_dir:
        output_dir = os.path.expanduser("~/.vaultkeeper/labels")
        
    os.makedirs(output_dir, exist_ok=True)
    label_path = os.path.join(output_dir, f"drive-{drive_info['id']}.png")
    
    # Save image
    img.save(label_path, dpi=(DPI, DPI))
    
    return label_path


def generate_location_label(location_info: Dict[str, Any], output_dir: Optional[str] = None,
                           small: bool = False) -> str:
    """Generate a printable label for a shelf location.
    
    Args:
        location_info: Dictionary containing location information
        output_dir: Optional directory to save the label image
        small: Whether to generate a small label (for D101 printer)
        
    Returns:
        Path to the generated label image
    """
    # Determine label size
    if small:
        label_width = SMALL_LABEL_WIDTH_PX
        label_height = SMALL_LABEL_HEIGHT_PX
    else:
        label_width = LABEL_WIDTH_PX
        label_height = LABEL_HEIGHT_PX
        
    # Create QR code with location info
    qr_data = {
        "type": "location",
        "id": location_info["id"],
        "bay": location_info["bay"],
        "shelf": location_info["shelf"],
        "position": location_info["position"]
    }
    
    # Create base image
    img = Image.new("RGB", (label_width, label_height), color="white")
    draw = ImageDraw.Draw(img)
    
    # Add QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=0,
    )
    qr.add_data(json.dumps(qr_data))
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # Resize QR code to fit label (left side)
    qr_size = label_height
    qr_img = qr_img.resize((qr_size, qr_size))
    img.paste(qr_img, (0, 0))
    
    # Add text info (right side)
    font_large = get_default_font(16) if not small else get_default_font(12)
    font_small = get_default_font(12) if not small else get_default_font(9)
    
    # Draw text
    text_x = qr_size + 5
    location_text = f"B{location_info['bay']}-S{location_info['shelf']}-P{location_info['position']}"
    
    # Position text based on label size
    if small:
        draw.text((text_x, 5), location_text, fill="black", font=font_large)
        # Only show status on standard label (not enough space on small label)
        if location_info.get("status"):
            status_text = location_info.get("status", "EMPTY")
            draw.text((text_x, 25), status_text[:6], fill="black", font=font_small)
    else:
        draw.text((text_x, 15), location_text, fill="black", font=font_large)
        if location_info.get("status"):
            status_text = location_info.get("status", "EMPTY")
            draw.text((text_x, 40), status_text, fill="black", font=font_small)
    
    # Determine output path
    if not output_dir:
        output_dir = os.path.expanduser("~/.vaultkeeper/labels")
        
    os.makedirs(output_dir, exist_ok=True)
    label_path = os.path.join(output_dir, f"loc-{location_info['id']}.png")
    
    # Save image
    img.save(label_path, dpi=(DPI, DPI))
    
    return label_path


def batch_print_labels(label_paths: list, printer_type: str = "b1") -> str:
    """Prepare multiple labels for printing at once.
    
    Args:
        label_paths: List of paths to label images
        printer_type: Type of printer (b1 or d101)
        
    Returns:
        Path to the combined image or PDF file
    """
    # Set label size based on printer type
    if printer_type.lower() == "d101":
        label_width = SMALL_LABEL_WIDTH_PX
        label_height = SMALL_LABEL_HEIGHT_PX
    else:  # b1
        label_width = LABEL_WIDTH_PX
        label_height = LABEL_HEIGHT_PX
    
    # Create a single page with all labels for easier printing
    if not label_paths:
        raise ValueError("No label paths provided")
        
    # Determine dimensions for the combined image
    max_cols = 2
    rows = (len(label_paths) + max_cols - 1) // max_cols  # Ceiling division
    
    # Create a new image to hold all labels
    combined_width = label_width * min(max_cols, len(label_paths))
    combined_height = label_height * rows
    combined_img = Image.new("RGB", (combined_width, combined_height), color="white")
    
    # Paste each label into the combined image
    for i, path in enumerate(label_paths):
        if not os.path.exists(path):
            continue
            
        try:
            label_img = Image.open(path)
            
            # Resize if necessary
            if label_img.size != (label_width, label_height):
                label_img = label_img.resize((label_width, label_height))
                
            # Calculate position
            row = i // max_cols
            col = i % max_cols
            position = (col * label_width, row * label_height)
            
            # Paste into combined image
            combined_img.paste(label_img, position)
        except Exception as e:
            print(f"Error processing label {path}: {e}")
    
    # Save combined image
    output_dir = os.path.expanduser("~/.vaultkeeper/labels")
    os.makedirs(output_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    output_path = os.path.join(output_dir, f"batch_{timestamp}.png")
    combined_img.save(output_path, dpi=(DPI, DPI))
    
    return output_path