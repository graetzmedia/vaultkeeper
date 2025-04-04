# Physical Asset Tracking and Labeling System

This document outlines the physical tracking and labeling components of the Media Asset Tracker system, focusing on creating a comprehensive solution for both drive labeling and shelf organization.

## 1. Labeling System Overview

The physical tracking system will consist of:

1. **Drive Labels**: QR-coded labels for each drive using your NIIMBOT printer
2. **Shelf Labels**: Corresponding shelf location labels with matching QR codes
3. **Shelf Organization System**: Logical grouping of drives based on clients/projects
4. **Label Database**: Storage location tracking in the database
5. **Mobile App Integration**: Scanning capabilities for quick location and verification

## 2. Label Design and Content

### Drive Labels

Each drive label will contain:

1. **QR Code**: Linking to the drive's database entry
2. **Drive ID**: Unique identifier in human-readable format
3. **Client/Project**: Brief description of primary content
4. **Date Archived**: When the drive was cataloged
5. **Color Coding**: Visual identifier for content type (optional)

Example QR code data structure:
```json
{
  "type": "drive",
  "id": "d-4f8c2a9b",
  "label": "RED_ClientX_2023Q2",
  "size": "8TB",
  "date_cataloged": "2025-03-15"
}
```

### Shelf Labels

Each shelf position will have:

1. **QR Code**: Linking to the shelf location in the database
2. **Location ID**: Bay/shelf/position identifier
3. **Status Indicator**: Empty/Occupied/Reserved

Example QR code data structure:
```json
{
  "type": "location",
  "id": "loc-b2s3p5",
  "bay": 2,
  "shelf": 3,
  "position": 5
}
```

## 3. Physical Organization System

### Shelf Structure

Define a consistent naming convention for physical locations:

```
[Bay]-[Shelf]-[Position]
```

Example: `B2-S3-P5` refers to Bay 2, Shelf 3, Position 5

### Organization Logic

Consider these organization methods:

1. **Client-based**: Group drives by client
2. **Project-based**: Group by project (within client sections)
3. **Chronological**: Organize by date
4. **Size-based**: Group drives by capacity
5. **Media Type**: Separate sections for different media types (RED footage, DCP deliverables, etc.)

A hybrid approach is recommended:
- Primary organization by client
- Secondary by project
- Chronological within projects

## 4. Database Schema Additions

Add these tables to the database schema:

```python
# In src/database.py

def init_db():
    """Initialize the SQLite database with schema including physical tracking."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Existing tables (drives, files, projects)...
    
    # Locations table for shelf positions
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        bay INTEGER,
        shelf INTEGER,
        position INTEGER,
        status TEXT,
        notes TEXT,
        qr_code_path TEXT,
        UNIQUE(bay, shelf, position)
    )
    ''')
    
    # Add location_id to drives table
    cursor.execute('''
    ALTER TABLE drives ADD COLUMN location_id TEXT
    REFERENCES locations(id)
    ''')
    
    conn.commit()
    conn.close()
```

## 5. QR Code Label Generation Module

Create a dedicated module for label generation:

```python
# src/label_generator.py

import qrcode
import os
import json
from PIL import Image, ImageDraw, ImageFont
from . import database

# Constants
LABEL_WIDTH_MM = 40  # NIIMBOT standard width
LABEL_HEIGHT_MM = 20  # Adjust based on your label size
DPI = 300  # Print resolution
LABEL_WIDTH_PX = int(LABEL_WIDTH_MM * DPI / 25.4)
LABEL_HEIGHT_PX = int(LABEL_HEIGHT_MM * DPI / 25.4)

def generate_drive_label(drive_info):
    """Generate a printable label for a drive."""
    # Create QR code with drive info
    qr_data = {
        "type": "drive",
        "id": drive_info["id"],
        "label": drive_info["label"],
        "size": f"{int(drive_info['size_bytes'] / (1024**3))}GB",
        "date_cataloged": drive_info["date_cataloged"]
    }
    
    # Create base image
    img = Image.new('RGB', (LABEL_WIDTH_PX, LABEL_HEIGHT_PX), color='white')
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
    qr_size = LABEL_HEIGHT_PX
    qr_img = qr_img.resize((qr_size, qr_size))
    img.paste(qr_img, (0, 0))
    
    # Add text info (right side)
    try:
        font_large = ImageFont.truetype("Arial", 14)
        font_small = ImageFont.truetype("Arial", 10)
    except IOError:
        font_large = ImageFont.load_default()
        font_small = font_large
    
    # Draw text
    text_x = qr_size + 10
    draw.text((text_x, 5), drive_info["label"][:15], fill='black', font=font_large)
    draw.text((text_x, 25), f"Size: {qr_data['size']}", fill='black', font=font_small)
    draw.text((text_x, 40), drive_info["date_cataloged"].split('T')[0], fill='black', font=font_small)
    
    # Save image
    os.makedirs(os.path.expanduser("~/media-asset-tracker/labels"), exist_ok=True)
    label_path = os.path.expanduser(f"~/media-asset-tracker/labels/drive-{drive_info['id']}.png")
    img.save(label_path, dpi=(DPI, DPI))
    
    return label_path

def generate_location_label(location_info):
    """Generate a printable label for a shelf location."""
    # Create QR code with location info
    qr_data = {
        "type": "location",
        "id": location_info["id"],
        "bay": location_info["bay"],
        "shelf": location_info["shelf"],
        "position": location_info["position"]
    }
    
    # Create base image
    img = Image.new('RGB', (LABEL_WIDTH_PX, LABEL_HEIGHT_PX), color='white')
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
    qr_size = LABEL_HEIGHT_PX
    qr_img = qr_img.resize((qr_size, qr_size))
    img.paste(qr_img, (0, 0))
    
    # Add text info (right side)
    try:
        font_large = ImageFont.truetype("Arial", 16)
        font_small = ImageFont.truetype("Arial", 12)
    except IOError:
        font_large = ImageFont.load_default()
        font_small = font_large
    
    # Draw text
    text_x = qr_size + 10
    location_text = f"B{location_info['bay']}-S{location_info['shelf']}-P{location_info['position']}"
    draw.text((text_x, 15), location_text, fill='black', font=font_large)
    draw.text((text_x, 40), location_info.get("status", "EMPTY"), fill='black', font=font_small)
    
    # Save image
    os.makedirs(os.path.expanduser("~/media-asset-tracker/labels"), exist_ok=True)
    label_path = os.path.expanduser(f"~/media-asset-tracker/labels/loc-{location_info['id']}.png")
    img.save(label_path, dpi=(DPI, DPI))
    
    return label_path

def batch_print_labels(label_paths):
    """Prepare multiple labels for printing at once."""
    # Create a multi-page PDF or combined image based on NIIMBOT requirements
    pass
```

## 6. Location Management in CLI

Add location management commands to the CLI:

```python
# In src/cli.py

def main():
    """Main function to handle command line arguments."""
    parser = argparse.ArgumentParser(
        description="Media Asset Tracking System - Catalog and track archived media files"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Existing commands...
    
    # Location management
    location_parser = subparsers.add_parser("location", help="Manage physical locations")
    location_subparsers = location_parser.add_subparsers(dest="location_cmd")
    
    # Add location
    add_loc_parser = location_subparsers.add_parser("add", help="Add a shelf location")
    add_loc_parser.add_argument("-b", "--bay", type=int, required=True, help="Bay number")
    add_loc_parser.add_argument("-s", "--shelf", type=int, required=True, help="Shelf number")
    add_loc_parser.add_argument("-p", "--position", type=int, required=True, help="Position number")
    add_loc_parser.add_argument("-n", "--notes", help="Additional notes")
    
    # List locations
    list_loc_parser = location_subparsers.add_parser("list", help="List shelf locations")
    list_loc_parser.add_argument("-s", "--status", choices=["empty", "occupied", "all"], default="all", 
                              help="Filter by status")
    
    # Assign drive to location
    assign_parser = location_subparsers.add_parser("assign", help="Assign drive to location")
    assign_parser.add_argument("drive_id", help="Drive ID")
    assign_parser.add_argument("location_id", help="Location ID")
    
    # Generate location labels
    label_loc_parser = location_subparsers.add_parser("label", help="Generate location labels")
    label_loc_parser.add_argument("-b", "--bay", type=int, help="Bay number")
    label_loc_parser.add_argument("-s", "--shelf", type=int, help="Shelf number")
    label_loc_parser.add_argument("-a", "--all", action="store_true", help="Generate all location labels")
    
    args = parser.parse_args()
    
    # Handle location commands
    if args.command == "location" and args.location_cmd:
        if args.location_cmd == "add":
            # Add location
            from . import database
            location_id = database.add_location(args.bay, args.shelf, args.position, args.notes)
            print(f"Added location B{args.bay}-S{args.shelf}-P{args.position} with ID: {location_id}")
            
            # Generate label
            from . import label_generator
            location_info = database.get_location(location_id)
            label_path = label_generator.generate_location_label(location_info)
            print(f"Location label generated: {label_path}")
            
        elif args.location_cmd == "list":
            # List locations
            from . import database
            locations = database.list_locations(args.status)
            print(f"Found {len(locations)} locations:")
            for i, loc in enumerate(locations, 1):
                status = loc.get("status", "EMPTY")
                drive_info = ""
                if status == "OCCUPIED" and loc.get("drive_id"):
                    drive = database.get_drive(loc["drive_id"])
                    if drive:
                        drive_info = f" - {drive['label'] or drive['volume_name']}"
                print(f"{i}. B{loc['bay']}-S{loc['shelf']}-P{loc['position']} ({status}){drive_info}")
                
        elif args.location_cmd == "assign":
            # Assign drive to location
            from . import database
            success = database.assign_drive_to_location(args.drive_id, args.location_id)
            if success:
                print(f"Drive {args.drive_id} assigned to location {args.location_id}")
            else:
                print("Assignment failed. Check drive and location IDs.")
                
        elif args.location_cmd == "label":
            # Generate location labels
            from . import database
            from . import label_generator
            
            if args.all:
                locations = database.list_locations("all")
            else:
                locations = database.get_locations_by_bay_shelf(args.bay, args.shelf)
                
            if not locations:
                print("No locations found matching criteria")
                return
                
            label_paths = []
            for loc in locations:
                label_path = label_generator.generate_location_label(loc)
                label_paths.append(label_path)
                print(f"Generated label for B{loc['bay']}-S{loc['shelf']}-P{loc['position']}: {label_path}")
                
            if label_paths:
                print(f"Generated {len(label_paths)} location labels")
```

## 7. Location Management in the Database

Add these functions to the database module:

```python
# In src/database.py

def add_location(bay, shelf, position, notes=None):
    """Add a shelf location to the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    location_id = f"loc-b{bay}s{shelf}p{position}"
    
    try:
        cursor.execute('''
        INSERT INTO locations (id, bay, shelf, position, status, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', (location_id, bay, shelf, position, "EMPTY", notes))
        
        conn.commit()
        conn.close()
        return location_id
    except sqlite3.IntegrityError:
        # Location already exists
        conn.close()
        return None

def get_location(location_id):
    """Get location information by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT id, bay, shelf, position, status, notes, qr_code_path
    FROM locations
    WHERE id = ?
    ''', (location_id,))
    
    location = cursor.fetchone()
    conn.close()
    
    return location

def list_locations(status="all"):
    """List locations, optionally filtered by status."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if status == "empty":
        cursor.execute('''
        SELECT l.*, d.id as drive_id
        FROM locations l
        LEFT JOIN drives d ON l.id = d.location_id
        WHERE l.status = "EMPTY"
        ORDER BY l.bay, l.shelf, l.position
        ''')
    elif status == "occupied":
        cursor.execute('''
        SELECT l.*, d.id as drive_id
        FROM locations l
        LEFT JOIN drives d ON l.id = d.location_id
        WHERE l.status = "OCCUPIED"
        ORDER BY l.bay, l.shelf, l.position
        ''')
    else:
        cursor.execute('''
        SELECT l.*, d.id as drive_id
        FROM locations l
        LEFT JOIN drives d ON l.id = d.location_id
        ORDER BY l.bay, l.shelf, l.position
        ''')
    
    locations = cursor.fetchall()
    conn.close()
    
    return locations

def get_locations_by_bay_shelf(bay, shelf=None):
    """Get locations for a specific bay and optional shelf."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if shelf is not None:
        cursor.execute('''
        SELECT id, bay, shelf, position, status, notes, qr_code_path
        FROM locations
        WHERE bay = ? AND shelf = ?
        ORDER BY position
        ''', (bay, shelf))
    else:
        cursor.execute('''
        SELECT id, bay, shelf, position, status, notes, qr_code_path
        FROM locations
        WHERE bay = ?
        ORDER BY shelf, position
        ''', (bay,))
    
    locations = cursor.fetchall()
    conn.close()
    
    return locations

def assign_drive_to_location(drive_id, location_id):
    """Assign a drive to a physical location."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # First check if location exists and is empty
    cursor.execute('''
    SELECT status FROM locations WHERE id = ?
    ''', (location_id,))
    
    location = cursor.fetchone()
    if not location:
        conn.close()
        return False
    
    # Check if drive exists
    cursor.execute('''
    SELECT id FROM drives WHERE id = ?
    ''', (drive_id,))
    
    if not cursor.fetchone():
        conn.close()
        return False
    
    # Update drive with location and update location status
    try:
        cursor.execute('''
        UPDATE drives SET location_id = ? WHERE id = ?
        ''', (location_id, drive_id))
        
        cursor.execute('''
        UPDATE locations SET status = "OCCUPIED" WHERE id = ?
        ''', (location_id,))
        
        conn.commit()
        conn.close()
        return True
    except:
        conn.rollback()
        conn.close()
        return False
```

## 8. Web Interface Enhancements

Add a locations section to the web interface:

```python
# In src/web.py

@app.route('/locations')
def locations():
    """List all physical locations."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get all bays for the sidebar
    cursor.execute('''
    SELECT DISTINCT bay FROM locations ORDER BY bay
    ''')
    bays = [row["bay"] for row in cursor.fetchall()]
    
    # Get locations, grouped by bay and shelf
    locations_by_bay = {}
    for bay in bays:
        cursor.execute('''
        SELECT DISTINCT shelf FROM locations WHERE bay = ? ORDER BY shelf
        ''', (bay,))
        shelves = [row["shelf"] for row in cursor.fetchall()]
        
        bay_data = {"shelves": {}}
        for shelf in shelves:
            cursor.execute('''
            SELECT l.*, d.label as drive_label, d.volume_name as drive_volume
            FROM locations l
            LEFT JOIN drives d ON l.id = d.location_id
            WHERE l.bay = ? AND l.shelf = ?
            ORDER BY l.position
            ''', (bay, shelf))
            
            positions = cursor.fetchall()
            bay_data["shelves"][shelf] = positions
            
        locations_by_bay[bay] = bay_data
    
    conn.close()
    
    return render_template('locations.html', bays=bays, locations_by_bay=locations_by_bay)

@app.route('/location/<location_id>')
def location_detail(location_id):
    """Location detail page."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get location info
    cursor.execute('''
    SELECT l.*, d.id as drive_id, d.label as drive_label, 
           d.volume_name as drive_volume, d.size_bytes as drive_size
    FROM locations l
    LEFT JOIN drives d ON l.id = d.location_id
    WHERE l.id = ?
    ''', (location_id,))
    
    location = cursor.fetchone()
    
    if not location:
        conn.close()
        return "Location not found", 404
    
    conn.close()
    
    return render_template('location_detail.html', location=location)

@app.route('/api/print-labels', methods=['POST'])
def api_print_labels():
    """API endpoint to prepare labels for printing."""
    data = request.json
    
    if not data or not data.get('label_ids'):
        return jsonify({'success': False, 'error': 'Missing label IDs'}), 400
        
    label_ids = data['label_ids']
    label_type = data.get('type', 'mixed')
    
    # Collect labels to print
    label_paths = []
    
    if label_type == 'drive' or label_type == 'mixed':
        # Get drive labels
        for drive_id in [id for id in label_ids if id.startswith('d-')]:
            drive_info = database.get_drive(drive_id)
            if drive_info:
                label_path = label_generator.generate_drive_label(drive_info)
                label_paths.append(label_path)
                
    if label_type == 'location' or label_type == 'mixed':
        # Get location labels
        for loc_id in [id for id in label_ids if id.startswith('loc-')]:
            location_info = database.get_location(loc_id)
            if location_info:
                label_path = label_generator.generate_location_label(location_info)
                label_paths.append(label_path)
    
    # Create a batch file for printing or return paths
    if label_paths:
        if data.get('batch_print', False):
            batch_path = label_generator.batch_print_labels(label_paths)
            return jsonify({
                'success': True,
                'count': len(label_paths),
                'batch_path': batch_path
            })
        else:
            return jsonify({
                'success': True,
                'count': len(label_paths),
                'paths': label_paths
            })
    else:
        return jsonify({'success': False, 'error': 'No valid labels found'})
```

## 9. NIIMBOT Printer Integration

Develop interfaces for the NIIMBOT label printer:

### Direct Printing Module

```python
# src/printer.py

import subprocess
import os
import platform
import tempfile
import logging

logger = logging.getLogger(__name__)

class NiimbotPrinter:
    """Interface for NIIMBOT Bluetooth label printer."""
    
    def __init__(self, printer_id=None):
        """Initialize the printer interface."""
        self.printer_id = printer_id
        self.platform = platform.system()
    
    def discover_printers(self):
        """Discover available NIIMBOT printers."""
        # This would use platform-specific tools to find Bluetooth printers
        # For example, on macOS, you might use 'system_profiler SPBluetoothDataType'
        # On Linux, 'bluetoothctl devices'
        pass
    
    def connect(self, printer_id=None):
        """Connect to a specific printer."""
        if printer_id:
            self.printer_id = printer_id
        # Implement connection logic
        pass
    
    def print_image(self, image_path):
        """Print an image to the NIIMBOT printer."""
        # This would need to use platform-specific approaches
        if not self.printer_id:
            logger.error("No printer connected")
            return False
        
        # Real implementation would use Bluetooth APIs or 
        # the NIIMBOT app's sharing features
        logger.info(f"Printing {image_path} to NIIMBOT printer {self.printer_id}")
        return True

    def print_batch(self, image_paths):
        """Print multiple labels in a batch."""
        success_count = 0
        for path in image_paths:
            if self.print_image(path):
                success_count += 1
        return success_count
```

### Mobile App Instructions

For use with the NIIMBOT mobile app:

```python
def generate_printing_instructions():
    """Generate instructions for printing with the NIIMBOT app."""
    instructions = """
    # Printing Labels with NIIMBOT App
    
    Since direct Bluetooth printing requires device-specific drivers, the easiest method
    is to use the NIIMBOT mobile app:
    
    1. Connect your NIIMBOT printer to your phone via Bluetooth
    2. Open the NIIMBOT app
    3. Choose "Create Label"
    4. Select "Image" as the label type
    5. Select the QR code image from your phone's gallery
    6. Adjust size if needed (labels are designed for 40mm width)
    7. Print the label
    
    For batch printing:
    1. Export all label images to your phone
    2. Create a label batch in the NIIMBOT app
    3. Add each image to the batch
    4. Print the entire batch
    """
    return instructions
```

## 10. Shelf Setup and Labeling System

Add documentation for physical organization:

```markdown
# Physical Organization System

## Shelf Setup

### Bay Numbering

Number each bay (shelving unit) sequentially, starting from 1:

- Bay 1: First shelving unit
- Bay 2: Second shelving unit
- etc.

Label each bay clearly with a large, visible number.

### Shelf Numbering

Within each bay, number shelves from top to bottom:

- Shelf 1: Topmost shelf
- Shelf 2: Second shelf from top
- etc.

Add a small label to each shelf with the bay and shelf number.

### Position Numbering

On each shelf, number positions from left to right:

- Position 1: Leftmost position
- Position 2: Second position from left
- etc.

Each position should be sized to accommodate your typical drive storage cases.

## Organization Strategy

### Client-Based Organization

Assign specific bay ranges to major clients:

- Bay 1-2: Client A projects
- Bay 3: Client B projects
- Bay 4-5: Client C projects
- etc.

### Project-Based Sub-Organization

Within each client area, group drives by project:

- Bay 1, Shelf 1-2: Client A, Project X
- Bay 1, Shelf 3: Client A, Project Y
- etc.

### Chronological Ordering

Within each project area, arrange drives chronologically:

- Position 1: Oldest footage/materials
- Position 2: Next oldest
- etc.

### Color Coding (Optional)

Use colored labels or stickers to indicate content type:

- Green: RAW camera footage
- Blue: Edited projects
- Red: Deliverables
- Yellow: Mixed content
- etc.

## Implementation Steps

1. Set up shelving units in your server room
2. Label each bay, shelf, and position
3. Scan each label into the system
4. Create a logical organization plan
5. As drives are cataloged, assign them to appropriate locations
6. Print matching QR codes for drives and shelf positions
```

## 11. Mobile Interface for QR Scanning

Create a mobile-friendly interface for scanning QR codes on drives and shelves. This will work with any mobile device without requiring a dedicated app:

```python
# src/mobile.py

from flask import Blueprint, request, jsonify, render_template
from . import database

mobile_bp = Blueprint('mobile', __name__, url_prefix='/mobile')

@mobile_bp.route('/')
def index():
    """Mobile interface home page."""
    return render_template('mobile/index.html')

@mobile_bp.route('/scan')
def scan():
    """QR code scanning interface."""
    return render_template('mobile/scan.html')

@mobile_bp.route('/api/lookup', methods=['POST'])
def lookup():
    """Look up an item based on QR code data."""
    data = request.json
    
    if not data or not data.get('qr_data'):
        return jsonify({'success': False, 'error': 'Missing QR data'})
    
    qr_data = data['qr_data']
    
    try:
        # Parse QR data
        import json
        qr_info = json.loads(qr_data)
        
        item_type = qr_info.get('type')
        item_id = qr_info.get('id')
        
        if not item_type or not item_id:
            return jsonify({'success': False, 'error': 'Invalid QR format'})
        
        # Look up the item
        if item_type == 'drive':
            drive = database.get_drive(item_id)
            if drive:
                # Get drive location if available
                location = None
                if drive.get('location_id'):
                    location = database.get_location(drive['location_id'])
                
                # Get file count and stats
                file_stats = database.get_drive_file_stats(item_id)
                
                return jsonify({
                    'success': True,
                    'type': 'drive',
                    'data': drive,
                    'location': location,
                    'stats': file_stats
                })
        
        elif item_type == 'location':
            location = database.get_location(item_id)
            if location:
                # See if there's a drive at this location
                drive = None
                if location.get('status') == 'OCCUPIED':
                    drive = database.get_drive_by_location(item_id)
                
                return jsonify({
                    'success': True,
                    'type': 'location',
                    'data': location,
                    'drive': drive
                })
        
        return jsonify({'success': False, 'error': 'Item not found'})
        
    except json.JSONDecodeError:
        return jsonify({'success': False, 'error': 'Invalid QR data format'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@mobile_bp.route('/api/checkout', methods=['POST'])
def checkout():
    """Check out a drive from its location."""
    data = request.json
    
    if not data or not data.get('drive_id'):
        return jsonify({'success': False, 'error': 'Missing drive ID'})
    
    user = data.get('user', 'Unknown')
    purpose = data.get('purpose')
    drive_id = data['drive_id']
    
    success = database.checkout_drive(drive_id, user, purpose)
    
    if success:
        return jsonify({
            'success': True,
            'message': f'Drive {drive_id} checked out successfully'
        })
    else:
        return jsonify({
            'success': False,
            'error': 'Failed to check out drive. Verify drive ID and location.'
        })

@mobile_bp.route('/api/checkin', methods=['POST'])
def checkin():
    """Check in a drive to a location."""
    data = request.json
    
    if not data or not data.get('drive_id'):
        return jsonify({'success': False, 'error': 'Missing drive ID'})
    
    drive_id = data['drive_id']
    location_id = data.get('location_id')
    user = data.get('user', 'Unknown')
    
    success = database.checkin_drive(drive_id, location_id, user)
    
    if success:
        return jsonify({
            'success': True,
            'message': f'Drive {drive_id} checked in successfully'
        })
    else:
        return jsonify({
            'success': False,
            'error': 'Failed to check in drive. Verify drive and location.'
        })

@mobile_bp.route('/mobile/checkout/<drive_id>')
def checkout_form(drive_id):
    """Form for checking out a drive."""
    drive = database.get_drive(drive_id)
    
    if not drive:
        return "Drive not found", 404
        
    return render_template('mobile/checkout.html', drive=drive)

@mobile_bp.route('/mobile/checkin/<drive_id>')
def checkin_form(drive_id):
    """Form for checking in a drive."""
    drive = database.get_drive(drive_id)
    
    if not drive:
        return "Drive not found", 404
        
    # Get available locations
    locations = database.list_locations("empty")
    
    # Add the drive's original location if it's reserved
    original_location = None
    movements = database.get_drive_movement_history(drive_id)
    if movements:
        for movement in movements:
            if movement['action'] == 'CHECKOUT':
                location_id = movement['location_id']
                if location_id:
                    location = database.get_location(location_id)
                    if location and location['status'] == 'RESERVED':
                        original_location = location
                        break
        
    return render_template(
        'mobile/checkin.html', 
        drive=drive,
        locations=locations,
        original_location=original_location
    )
```

## 12. Asset Movement and Tracking

Add functionality to track when drives are removed and returned. This is crucial for maintaining accountability, especially when drives are temporarily pulled for client work or access:

```python
# In src/database.py

def checkout_drive(drive_id, user, purpose=None):
    """Check out a drive (temporarily remove from location)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get current location
    cursor.execute('''
    SELECT location_id FROM drives WHERE id = ?
    ''', (drive_id,))
    
    drive = cursor.fetchone()
    if not drive or not drive['location_id']:
        conn.close()
        return False
    
    location_id = drive['location_id']
    
    # Record checkout
    import datetime
    checkout_time = datetime.datetime.now().isoformat()
    
    cursor.execute('''
    INSERT INTO drive_movements (
        drive_id, location_id, action, user, purpose, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?)
    ''', (drive_id, location_id, 'CHECKOUT', user, purpose, checkout_time))
    
    # Update drive and location
    cursor.execute('''
    UPDATE drives SET location_id = NULL, status = 'CHECKED_OUT' WHERE id = ?
    ''', (drive_id,))
    
    cursor.execute('''
    UPDATE locations SET status = 'RESERVED' WHERE id = ?
    ''', (location_id,))
    
    conn.commit()
    conn.close()
    return True

def checkin_drive(drive_id, location_id=None, user=None):
    """Check in a drive (return to location)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get drive info
    cursor.execute('''
    SELECT id, status FROM drives WHERE id = ?
    ''', (drive_id,))
    
    drive = cursor.fetchone()
    if not drive:
        conn.close()
        return False
    
    # If no location specified, look up the reserved location
    if not location_id:
        cursor.execute('''
        SELECT location_id FROM drive_movements 
        WHERE drive_id = ? AND action = 'CHECKOUT'
        ORDER BY timestamp DESC LIMIT 1
        ''', (drive_id,))
        
        last_checkout = cursor.fetchone()
        if last_checkout:
            location_id = last_checkout['location_id']
    
    # Verify location exists
    if location_id:
        cursor.execute('''
        SELECT id, status FROM locations WHERE id = ?
        ''', (location_id,))
        
        location = cursor.fetchone()
        if not location:
            conn.close()
            return False
            
        # Only allow check-in to empty or reserved locations
        if location['status'] != 'EMPTY' and location['status'] != 'RESERVED':
            conn.close()
            return False
    
    # Record check-in
    import datetime
    checkin_time = datetime.datetime.now().isoformat()
    
    cursor.execute('''
    INSERT INTO drive_movements (
        drive_id, location_id, action, user, timestamp
    ) VALUES (?, ?, ?, ?, ?)
    ''', (drive_id, location_id, 'CHECKIN', user, checkin_time))
    
    # Update drive and location
    cursor.execute('''
    UPDATE drives SET location_id = ?, status = 'AVAILABLE' WHERE id = ?
    ''', (location_id, drive_id))
    
    cursor.execute('''
    UPDATE locations SET status = 'OCCUPIED' WHERE id = ?
    ''', (location_id,))
    
    conn.commit()
    conn.close()
    return True

def get_drive_movement_history(drive_id):
    """Get the movement history for a drive."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT m.*, l.bay, l.shelf, l.position
    FROM drive_movements m
    LEFT JOIN locations l ON m.location_id = l.id
    WHERE m.drive_id = ?
    ORDER BY m.timestamp DESC
    ''', (drive_id,))
    
    movements = cursor.fetchall()
    conn.close()
    
    return movements