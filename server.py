#!/usr/bin/env python3

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import sqlite3
import json
import uuid
from datetime import datetime
import mimetypes
import sys

# Add the tools directory to the Python path
tools_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tools')
sys.path.append(tools_dir)

# Try to import pandas-based converter first, then fall back to Go-based one if necessary
try:
    # Check if pandas is available
    import pandas as pd
    from convert_with_pandas import convert_csv_to_xlsx
    print("Using pandas for CSV to XLSX conversion")
    XLSX_SUPPORT = True
except ImportError:
    try:
        from convert_csv_to_xlsx import convert_csv_to_xlsx
        print("Using Go-based tool for CSV to XLSX conversion")
        XLSX_SUPPORT = True
    except ImportError:
        print("Warning: CSV to XLSX conversion not available")
        XLSX_SUPPORT = False

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Allow cross-origin requests

# Database configuration
DB_PATH = os.path.expanduser("~/media-asset-tracker/asset-db.sqlite")
THUMBNAILS_DIR = os.path.expanduser("~/media-asset-tracker/thumbnails")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')

# Create a placeholder directory for missing thumbnails
PLACEHOLDER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web', 'placeholders')
if not os.path.exists(PLACEHOLDER_DIR):
    os.makedirs(PLACEHOLDER_DIR)

# Helper function to connect to the database
def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.row_factory = sqlite3.Row
    return conn

# Helper function to convert SQLite row to dictionary
def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

# Serve static files from web directory
@app.route('/')
def serve_index():
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(STATIC_DIR, path)

# Serve thumbnail images with improved path handling
@app.route('/thumbnails/<path:path>')
def serve_thumbnail(path):
    # First, determine the file type to provide appropriate placeholder
    file_extension = os.path.splitext(path)[1].lower() if '.' in path else ''
    
    # Set up file type for placeholder
    if file_extension in ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.gif', '.cr2', '.arw']:
        file_type = 'image'
    elif file_extension in ['.mp4', '.mov', '.avi', '.mxf', '.r3d']:
        file_type = 'video'
    elif file_extension in ['.wav', '.mp3', '.aac', '.flac']:
        file_type = 'audio'
    else:
        file_type = 'document'
    
    # Attempt to handle both formats: drive_id/filename or just filename
    if '/' in path:
        # Path contains directory separator (drive_id/filename format)
        parts = path.split('/')
        if len(parts) == 2:
            drive_id, filename = parts
            thumbnail_path = os.path.join(THUMBNAILS_DIR, drive_id, filename)
            if os.path.exists(thumbnail_path):
                return send_from_directory(os.path.join(THUMBNAILS_DIR, drive_id), filename)
    
    # First try direct path
    if os.path.exists(os.path.join(THUMBNAILS_DIR, path)):
        return send_from_directory(THUMBNAILS_DIR, path)
    
    # Then try searching for the filename in subdirectories
    for root, dirs, files in os.walk(THUMBNAILS_DIR):
        if os.path.basename(path) in files:
            rel_dir = os.path.relpath(root, THUMBNAILS_DIR)
            if rel_dir == '.':
                return send_from_directory(THUMBNAILS_DIR, os.path.basename(path))
            else:
                return send_from_directory(root, os.path.basename(path))
    
    # Check if a placeholder exists for this file type
    placeholder_path = os.path.join(PLACEHOLDER_DIR, f"{file_type}.png")
    if os.path.exists(placeholder_path):
        return send_from_directory(PLACEHOLDER_DIR, f"{file_type}.png")
    
    # If no suitable placeholder, return a 404
    return jsonify({'error': 'Thumbnail not found'}), 404

# API routes
@app.route('/api/locations', methods=['GET', 'POST'])
def handle_locations():
    if request.method == 'GET':
        conn = get_db_connection()
        conn.row_factory = dict_factory
        cursor = conn.cursor()
        
        # Support filtering by bay, shelf, status
        bay = request.args.get('bay')
        shelf = request.args.get('shelf')
        status = request.args.get('status')
        
        where_clauses = []
        params = []
        
        if bay:
            where_clauses.append("bay = ?")
            params.append(int(bay))
        if shelf:
            where_clauses.append("shelf = ?")
            params.append(int(shelf))
        if status:
            where_clauses.append("status = ?")
            params.append(status)
        
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Check if locations table exists, if not create it
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
        if not cursor.fetchone():
            cursor.execute("""
            CREATE TABLE locations (
                id TEXT PRIMARY KEY,
                bay INTEGER NOT NULL,
                shelf INTEGER NOT NULL,
                position INTEGER NOT NULL,
                status TEXT DEFAULT 'EMPTY',
                section TEXT,
                notes TEXT,
                occupied_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bay, shelf, position)
            )
            """)
            conn.commit()
        
        # Query locations
        cursor.execute(f"""
        SELECT id, bay, shelf, position, status, section, notes, occupied_by as occupiedBy,
               created_at as createdAt, updated_at as updatedAt
        FROM locations
        WHERE {where_sql}
        ORDER BY bay, shelf, position
        """, params)
        
        locations = cursor.fetchall()
        
        # Convert to array and add locationId virtual field
        for location in locations:
            location['locationId'] = f"B{location['bay']}-S{location['shelf']}-P{location['position']}"
        
        conn.close()
        return jsonify(locations)
    
    elif request.method == 'POST':
        # Create a new location
        data = request.json
        
        # Validate required fields
        bay = data.get('bay')
        shelf = data.get('shelf')
        position = data.get('position')
        status = data.get('status', 'EMPTY')
        section = data.get('section')
        notes = data.get('notes')
        
        if not bay or not shelf or not position:
            return jsonify({'error': 'Bay, shelf, and position are required'}), 400
        
        try:
            bay = int(bay)
            shelf = int(shelf)
            position = int(position)
        except ValueError:
            return jsonify({'error': 'Bay, shelf, and position must be integers'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if locations table exists, if not create it
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
        if not cursor.fetchone():
            cursor.execute("""
            CREATE TABLE locations (
                id TEXT PRIMARY KEY,
                bay INTEGER NOT NULL,
                shelf INTEGER NOT NULL,
                position INTEGER NOT NULL,
                status TEXT DEFAULT 'EMPTY',
                section TEXT,
                notes TEXT,
                occupied_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bay, shelf, position)
            )
            """)
            conn.commit()
        
        # Check if location already exists
        cursor.execute("""
        SELECT id FROM locations 
        WHERE bay = ? AND shelf = ? AND position = ?
        """, (bay, shelf, position))
        
        if cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Location already exists'}), 400
        
        # Generate unique ID for the location
        location_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        
        # Create the location
        cursor.execute("""
        INSERT INTO locations 
            (id, bay, shelf, position, status, section, notes, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (location_id, bay, shelf, position, status, section, notes, timestamp, timestamp))
        
        conn.commit()
        
        # Return the created location
        cursor.execute("""
        SELECT id, bay, shelf, position, status, section, notes, occupied_by as occupiedBy,
               created_at as createdAt, updated_at as updatedAt
        FROM locations
        WHERE id = ?
        """, (location_id,))
        
        location = cursor.fetchone()
        conn.close()
        
        if location:
            # Add the locationId virtual field
            location = dict(location)
            location['locationId'] = f"B{location['bay']}-S{location['shelf']}-P{location['position']}"
            return jsonify(location), 201
        else:
            return jsonify({'error': 'Failed to create location'}), 500

@app.route('/api/locations/batch', methods=['POST'])
def create_batch_locations():
    data = request.json
    locations = data.get('locations', [])
    
    if not locations or not isinstance(locations, list):
        return jsonify({'error': 'Locations array is required'}), 400
    
    results = {
        'success': True,
        'created': [],
        'failed': [],
        'total': len(locations)
    }
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if locations table exists, if not create it
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
    if not cursor.fetchone():
        cursor.execute("""
        CREATE TABLE locations (
            id TEXT PRIMARY KEY,
            bay INTEGER NOT NULL,
            shelf INTEGER NOT NULL,
            position INTEGER NOT NULL,
            status TEXT DEFAULT 'EMPTY',
            section TEXT,
            notes TEXT,
            occupied_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(bay, shelf, position)
        )
        """)
        conn.commit()
    
    timestamp = datetime.now().isoformat()
    
    for location in locations:
        try:
            bay = int(location.get('bay'))
            shelf = int(location.get('shelf'))
            position = int(location.get('position'))
            status = location.get('status', 'EMPTY')
            section = location.get('section')
            notes = location.get('notes')
            
            # Check if location already exists
            cursor.execute("""
            SELECT id FROM locations 
            WHERE bay = ? AND shelf = ? AND position = ?
            """, (bay, shelf, position))
            
            if cursor.fetchone():
                results['failed'].append({
                    'location': location,
                    'error': 'Location already exists'
                })
                continue
            
            # Generate unique ID for the location
            location_id = str(uuid.uuid4())
            
            # Create the location
            cursor.execute("""
            INSERT INTO locations 
                (id, bay, shelf, position, status, section, notes, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (location_id, bay, shelf, position, status, section, notes, timestamp, timestamp))
            
            conn.commit()
            
            results['created'].append({
                'id': location_id,
                'locationId': f"B{bay}-S{shelf}-P{position}"
            })
            
        except Exception as e:
            results['failed'].append({
                'location': location,
                'error': str(e)
            })
    
    conn.close()
    
    # Update success flag if all locations failed
    if len(results['failed']) > 0 and len(results['created']) == 0:
        results['success'] = False
    
    status_code = 201 if results['success'] else 400
    return jsonify(results), status_code

@app.route('/api/locations/summary', methods=['GET'])
def get_locations_summary():
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Check if locations table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
    if not cursor.fetchone():
        conn.close()
        return jsonify({}), 200
    
    # Get all locations
    cursor.execute("""
    SELECT bay, shelf, status FROM locations
    ORDER BY bay, shelf, position
    """)
    
    locations = cursor.fetchall()
    conn.close()
    
    # Create summary by bay and shelf
    summary = {}
    
    for location in locations:
        bay_key = f"Bay {location['bay']}"
        shelf_key = f"Shelf {location['shelf']}"
        
        # Initialize bay if not exists
        if bay_key not in summary:
            summary[bay_key] = {
                'totalLocations': 0,
                'occupied': 0,
                'empty': 0,
                'shelves': {}
            }
        
        # Initialize shelf if not exists
        if shelf_key not in summary[bay_key]['shelves']:
            summary[bay_key]['shelves'][shelf_key] = {
                'totalLocations': 0,
                'occupied': 0,
                'empty': 0
            }
        
        # Increment counters
        summary[bay_key]['totalLocations'] += 1
        summary[bay_key]['shelves'][shelf_key]['totalLocations'] += 1
        
        if location['status'] == 'OCCUPIED':
            summary[bay_key]['occupied'] += 1
            summary[bay_key]['shelves'][shelf_key]['occupied'] += 1
        else:
            summary[bay_key]['empty'] += 1
            summary[bay_key]['shelves'][shelf_key]['empty'] += 1
    
    return jsonify(summary)

@app.route('/api/locations/bays', methods=['GET'])
def get_location_bays():
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Check if locations table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
    if not cursor.fetchone():
        conn.close()
        return jsonify([]), 200
    
    # Get all unique bays
    cursor.execute("""
    SELECT DISTINCT bay FROM locations
    ORDER BY bay
    """)
    
    bays_data = cursor.fetchall()
    conn.close()
    
    # Convert to simple array of bay numbers
    bays = [entry['bay'] for entry in bays_data]
    
    return jsonify(bays)

@app.route('/api/locations/shelves', methods=['GET'])
def get_location_shelves():
    bay = request.args.get('bay')
    
    if not bay:
        return jsonify({'error': 'Bay parameter is required'}), 400
    
    try:
        bay = int(bay)
    except ValueError:
        return jsonify({'error': 'Bay must be an integer'}), 400
    
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Check if locations table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
    if not cursor.fetchone():
        conn.close()
        return jsonify([]), 200
    
    # Get all unique shelves for the specified bay
    cursor.execute("""
    SELECT DISTINCT shelf FROM locations
    WHERE bay = ?
    ORDER BY shelf
    """, (bay,))
    
    shelves_data = cursor.fetchall()
    conn.close()
    
    # Convert to simple array of shelf numbers
    shelves = [entry['shelf'] for entry in shelves_data]
    
    return jsonify(shelves)

@app.route('/api/locations/export-batch', methods=['GET'])
def export_location_labels_batch():
    try:
        # Check if the user wants XLSX format
        format_type = request.args.get('format', 'csv').lower()
        
        bay = request.args.get('bay')
        shelf = request.args.get('shelf')
        
        if not bay:
            return jsonify({'error': 'Bay parameter is required'}), 400
        
        # Build query
        query = {}
        params = []
        
        query_sql = "bay = ?"
        params.append(int(bay))
        
        if shelf:
            query_sql += " AND shelf = ?"
            params.append(int(shelf))
        
        conn = get_db_connection()
        conn.row_factory = dict_factory
        cursor = conn.cursor()
        
        # Check if locations table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Locations table not found'}), 404
        
        # Find matching locations
        cursor.execute(f"""
        SELECT id, bay, shelf, position, status, section, notes
        FROM locations
        WHERE {query_sql}
        ORDER BY bay, shelf, position
        """, params)
        
        locations = cursor.fetchall()
        conn.close()
        
        if not locations or len(locations) == 0:
            return jsonify({'error': 'No locations found matching the criteria'}), 404
        
        # Create CSV header with simplified columns
        csv_header = 'QR_Code,Location_ID,Bay,Shelf,Position,Status,Section\n'
        csv_content = csv_header
        
        # Add a row for each location
        for location in locations:
            # Generate location ID for display
            location_id = f"B{location['bay']}-S{location['shelf']}-P{location['position']}"
            
            # Generate simple QR code data - just the location ID
            qr_data = location['id']
            
            # Format section info
            section = location['section'] or ''
            
            # Add row to CSV with simplified columns
            csv_row = f"{qr_data},{location_id},{location['bay']},{location['shelf']},{location['position']},{location['status'] or 'EMPTY'},{section}\n"
            
            csv_content += csv_row
        
        # Determine filename based on query parameters
        filename = f"locations_B{bay}"
        if shelf:
            filename += f"_S{shelf}"
        
        # Determine if we should convert to XLSX
        if format_type == 'xlsx' and XLSX_SUPPORT:
            # Convert to XLSX
            xlsx_data = convert_csv_to_xlsx(csv_content, delimiter=',')
            
            if xlsx_data:
                from flask import Response
                response = Response(
                    xlsx_data,
                    mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    headers={
                        'Content-Disposition': f'attachment; filename="{filename}.xlsx"'
                    }
                )
                return response
            else:
                # Fall back to CSV if conversion fails
                print("Error converting to XLSX, falling back to CSV")
                
        # Set headers for download as CSV (default or fallback)
        from flask import Response
        response = Response(
            csv_content,
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}.csv"'
            }
        )
        
        return response
        
    except Exception as error:
        print(f'Error exporting location labels: {str(error)}')
        return jsonify({'error': 'Failed to export location labels'}), 500

@app.route('/api/locations/<location_id>/export-label', methods=['GET'])
def export_location_label(location_id):
    try:
        # Check if the user wants XLSX format
        format_type = request.args.get('format', 'csv').lower()
        
        # Handle the "undefined" edge case which can be sent from frontend
        if location_id == "undefined":
            return jsonify({'error': 'Invalid location ID'}), 400
        
        conn = get_db_connection()
        conn.row_factory = dict_factory
        cursor = conn.cursor()
        
        # Get location by ID
        cursor.execute("""
        SELECT id, bay, shelf, position, status, section, notes
        FROM locations
        WHERE id = ?
        """, (location_id,))
        
        location = cursor.fetchone()
        conn.close()
        
        if not location:
            return jsonify({'error': 'Location not found'}), 404
        
        # Generate location ID for display
        location_id_text = f"B{location['bay']}-S{location['shelf']}-P{location['position']}"
        
        # Generate simple QR code data - just the location ID
        qr_data = location['id']  
        
        # Format section info
        section = location['section'] or ''
        
        # Create CSV with the requested columns in a clear, simple format
        csv_header = 'QR_Code,Location_ID,Bay,Shelf,Position,Status,Section\n'
        csv_row = f"{qr_data},{location_id_text},{location['bay']},{location['shelf']},{location['position']},{location['status'] or 'EMPTY'},{section}\n"
                  
        csv_content = csv_header + csv_row
        
        # Determine if we should convert to XLSX
        if format_type == 'xlsx' and XLSX_SUPPORT:
            # Convert to XLSX
            xlsx_data = convert_csv_to_xlsx(csv_content, delimiter=',')
            
            if xlsx_data:
                from flask import Response
                response = Response(
                    xlsx_data,
                    mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    headers={
                        'Content-Disposition': f'attachment; filename="location_label_{location_id_text}.xlsx"'
                    }
                )
                return response
            else:
                # Fall back to CSV if conversion fails
                print("Error converting to XLSX, falling back to CSV")
        
        # Set headers for download as CSV (default or fallback)
        from flask import Response
        response = Response(
            csv_content,
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename="location_label_{location_id_text}.csv"'
            }
        )
        
        return response
        
    except Exception as error:
        print(f'Error exporting location label: {str(error)}')
        return jsonify({'error': 'Failed to export location label'}), 500

@app.route('/api/locations/<location_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_location(location_id):
    # Handle the "undefined" edge case which can be sent from frontend
    if location_id == "undefined":
        return jsonify({'error': 'Invalid location ID'}), 400
        
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Check if locations table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='locations'")
    if not cursor.fetchone():
        create_locations_table(conn)
    
    if request.method == 'GET':
        # Get location by ID
        cursor.execute("""
        SELECT id, bay, shelf, position, status, section, notes, occupied_by as occupiedBy,
               created_at as createdAt, updated_at as updatedAt
        FROM locations
        WHERE id = ?
        """, (location_id,))
        
        location = cursor.fetchone()
        
        if not location:
            conn.close()
            return jsonify({'error': 'Location not found'}), 404
        
        # Add locationId virtual field
        location['locationId'] = f"B{location['bay']}-S{location['shelf']}-P{location['position']}"
        
        conn.close()
        return jsonify(location)
    
    elif request.method == 'PUT':
        # Update location
        data = request.json
        
        # Get existing location
        cursor.execute("SELECT * FROM locations WHERE id = ?", (location_id,))
        existing = cursor.fetchone()
        
        if not existing:
            conn.close()
            return jsonify({'error': 'Location not found'}), 404
        
        # Extract update fields (only update what's provided)
        status = data.get('status')
        section = data.get('section')
        notes = data.get('notes')
        occupied_by = data.get('occupiedBy')
        timestamp = datetime.now().isoformat()
        
        # Prepare update query parts
        update_parts = []
        params = []
        
        if status is not None:
            update_parts.append("status = ?")
            params.append(status)
        
        if section is not None:
            update_parts.append("section = ?")
            params.append(section)
        
        if notes is not None:
            update_parts.append("notes = ?")
            params.append(notes)
        
        if occupied_by is not None:
            update_parts.append("occupied_by = ?")
            params.append(occupied_by)
            
            # If assigning drive, also update the drive's physical_location
            if occupied_by and occupied_by != '':
                # First check if physical_location column exists in drives table
                cursor.execute("PRAGMA table_info(drives)")
                columns = cursor.fetchall()
                column_exists = False
                for column in columns:
                    if column['name'] == 'physical_location':
                        column_exists = True
                        break
                
                if not column_exists:
                    cursor.execute("ALTER TABLE drives ADD COLUMN physical_location TEXT")
                
                # Update the drive to point to this location
                cursor.execute("""
                UPDATE drives
                SET physical_location = ?
                WHERE id = ?
                """, (location_id, occupied_by))
        
        # Always update timestamp
        update_parts.append("updated_at = ?")
        params.append(timestamp)
        
        # Add location_id to params
        params.append(location_id)
        
        # Execute update if there are fields to update
        if update_parts:
            update_sql = f"UPDATE locations SET {', '.join(update_parts)} WHERE id = ?"
            cursor.execute(update_sql, params)
            conn.commit()
        
        # Get updated location
        cursor.execute("""
        SELECT id, bay, shelf, position, status, section, notes, occupied_by as occupiedBy,
               created_at as createdAt, updated_at as updatedAt
        FROM locations
        WHERE id = ?
        """, (location_id,))
        
        updated_location = cursor.fetchone()
        
        if updated_location:
            # Add locationId virtual field
            updated_location['locationId'] = f"B{updated_location['bay']}-S{updated_location['shelf']}-P{updated_location['position']}"
            
            # Get drive details if occupied
            if updated_location['occupiedBy']:
                cursor.execute("""
                SELECT id, label, volume_name as volumeName
                FROM drives
                WHERE id = ?
                """, (updated_location['occupiedBy'],))
                
                drive = cursor.fetchone()
                if drive:
                    updated_location['driveDetails'] = drive
        
        conn.close()
        return jsonify(updated_location)
    
    elif request.method == 'DELETE':
        # Delete location
        cursor.execute("DELETE FROM locations WHERE id = ?", (location_id,))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Location not found'}), 404
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Location deleted successfully'})

# Helper function to create locations table
def create_locations_table(conn):
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE locations (
        id TEXT PRIMARY KEY,
        bay INTEGER NOT NULL,
        shelf INTEGER NOT NULL,
        position INTEGER NOT NULL,
        status TEXT DEFAULT 'EMPTY',
        section TEXT,
        notes TEXT,
        occupied_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bay, shelf, position)
    )
    """)
    conn.commit()

@app.route('/api/drives/<drive_id>/assign-location', methods=['POST'])
def assign_drive_to_location(drive_id):
    data = request.json
    location_id = data.get('locationId')
    
    if not location_id:
        return jsonify({'error': 'Location ID is required'}), 400
    
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Verify drive exists
    cursor.execute("SELECT id FROM drives WHERE id = ?", (drive_id,))
    drive = cursor.fetchone()
    
    if not drive:
        conn.close()
        return jsonify({'error': 'Drive not found'}), 404
    
    # Verify location exists
    cursor.execute("SELECT id, status, occupied_by FROM locations WHERE id = ?", (location_id,))
    location = cursor.fetchone()
    
    if not location:
        conn.close()
        return jsonify({'error': 'Location not found'}), 404
    
    # Check if location is already occupied by another drive
    if location['status'] == 'OCCUPIED' and location['occupied_by'] and location['occupied_by'] != drive_id:
        conn.close()
        return jsonify({'error': 'Location is already occupied by another drive'}), 400
    
    # Update location to be occupied by this drive
    timestamp = datetime.now().isoformat()
    cursor.execute("""
    UPDATE locations
    SET status = 'OCCUPIED', occupied_by = ?, updated_at = ?
    WHERE id = ?
    """, (drive_id, timestamp, location_id))
    
    # Also update drive to record its location
    cursor.execute("""
    UPDATE drives
    SET physical_location = ?
    WHERE id = ?
    """, (location_id, drive_id))
    
    conn.commit()
    
    # Get updated location
    cursor.execute("""
    SELECT id, bay, shelf, position, status, section, notes, occupied_by as occupiedBy,
           created_at as createdAt, updated_at as updatedAt
    FROM locations
    WHERE id = ?
    """, (location_id,))
    
    updated_location = cursor.fetchone()
    updated_location['locationId'] = f"B{updated_location['bay']}-S{updated_location['shelf']}-P{updated_location['position']}"
    
    conn.close()
    
    return jsonify({
        'status': 'success',
        'message': f"Drive {drive_id} assigned to location {updated_location['locationId']}",
        'location': updated_location
    })

@app.route('/api/drives', methods=['GET'])
def get_drives():
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Check if physical_location column exists in drives table
    cursor.execute("PRAGMA table_info(drives)")
    columns = cursor.fetchall()
    if 'physical_location' not in [column['name'] for column in columns]:
        # Add physical_location column if it doesn't exist
        cursor.execute("ALTER TABLE drives ADD COLUMN physical_location TEXT")
        conn.commit()
    
    # Get drives with optional location filter
    location_id = request.args.get('locationId')
    
    if location_id:
        cursor.execute("""
        SELECT id, label, volume_name as volumeName, size_bytes as sizeBytes, 
               free_bytes as freeBytes, format, mount_point as mountPoint, 
               date_cataloged as dateCataloged, last_verified as lastVerified,
               physical_location as physicalLocation
        FROM drives
        WHERE physical_location = ?
        ORDER BY date_cataloged DESC
        """, (location_id,))
    else:
        cursor.execute("""
        SELECT id, label, volume_name as volumeName, size_bytes as sizeBytes, 
               free_bytes as freeBytes, format, mount_point as mountPoint, 
               date_cataloged as dateCataloged, last_verified as lastVerified,
               physical_location as physicalLocation
        FROM drives
        ORDER BY date_cataloged DESC
        """)
    
    drives = cursor.fetchall()
    
    # For each drive, determine if it has a project associating it with a client
    # and fetch location details if available
    for drive in drives:
        # Look for projects that seem to be related to this drive
        cursor.execute("""
        SELECT DISTINCT p.client
        FROM projects p
        WHERE p.name LIKE ? OR p.notes LIKE ?
        """, (f"Drive: {drive['label'] or drive['volumeName'] or drive['id']}%", 
              f"%drive {drive['id']}%"))
        
        client_result = cursor.fetchone()
        drive['client'] = client_result['client'] if client_result else None
        
        # If drive has a physical location, fetch the location details
        if drive.get('physicalLocation'):
            cursor.execute("""
            SELECT bay, shelf, position
            FROM locations
            WHERE id = ?
            """, (drive['physicalLocation'],))
            
            location = cursor.fetchone()
            if location:
                drive['locationId'] = f"B{location['bay']}-S{location['shelf']}-P{location['position']}"
            else:
                drive['locationId'] = None
        else:
            drive['locationId'] = None
    
    conn.close()
    
    return jsonify(drives)

@app.route('/api/drives/<drive_id>/export-label', methods=['GET'])
def export_drive_label(drive_id):
    """Export drive label as CSV or XLSX for Niimbot thermal printer with specific columns"""
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Check if the user wants XLSX format
    format_type = request.args.get('format', 'csv').lower()
    
    # Verify drive exists
    cursor.execute("SELECT id, label, volume_name, date_cataloged FROM drives WHERE id = ?", (drive_id,))
    drive = cursor.fetchone()
    
    if not drive:
        conn.close()
        return jsonify({'error': 'Drive not found'}), 404
    
    # Get root folders
    cursor.execute("""
    SELECT DISTINCT SUBSTR(path, 1, INSTR(path || '/', '/') - 1) as folder
    FROM files
    WHERE drive_id = ? AND path IS NOT NULL AND path != ''
    ORDER BY folder
    """, (drive_id,))
    
    folders = cursor.fetchall()
    root_folders = ', '.join([f['folder'] for f in folders])
    
    # Try to get earliest creation year from files
    cursor.execute("""
    SELECT MIN(SUBSTR(date_created, 1, 4)) as earliest_year
    FROM files
    WHERE drive_id = ? AND date_created IS NOT NULL AND date_created != ''
    """, (drive_id,))
    
    year_result = cursor.fetchone()
    earliest_year = year_result['earliest_year'] if year_result and year_result['earliest_year'] else ''
    
    # Get catalog date
    date_added = drive['date_cataloged'].split('T')[0] if drive['date_cataloged'] and 'T' in drive['date_cataloged'] else ''
    
    # Generate simple QR code data with just the drive ID
    qr_data = drive['id']
    
    # Get a clean drive name
    drive_name = drive['label'] or drive['volume_name'] or f"Drive {drive['id']}"
    
    conn.close()
    
    # Create CSV with the requested columns in a clear, simple format
    csv_header = 'QR_Code,Drive_Name,Root_Folders,Drive_ID,Creation_Year\n'
    csv_row = f"{qr_data},{drive_name},{root_folders},{drive['id']},{earliest_year}\n"
    
    csv_content = csv_header + csv_row
    
    # Determine if we should convert to XLSX
    if format_type == 'xlsx' and XLSX_SUPPORT:
        # Convert to XLSX
        xlsx_data = convert_csv_to_xlsx(csv_content, delimiter=',')
        
        if xlsx_data:
            from flask import Response
            response = Response(
                xlsx_data,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                headers={
                    'Content-Disposition': f'attachment; filename=drive_label_{drive["id"]}.xlsx'
                }
            )
            return response
        else:
            # Fall back to CSV if conversion fails
            print("Error converting to XLSX, falling back to CSV")
            
    # Set headers for download as CSV (default or fallback)
    from flask import Response
    response = Response(
        csv_content,
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename=drive_label_{drive["id"]}.csv'
        }
    )
    
    return response

@app.route('/api/drives/<drive_id>/qr-code', methods=['GET'])
def get_drive_qr_code(drive_id):
    """Serve a QR code for a drive"""
    qr_code_path = os.path.join(os.path.expanduser('~/media-asset-tracker/qr-codes'), f"{drive_id}.png")
    
    # If the QR code exists, serve it
    if os.path.exists(qr_code_path):
        return send_from_directory(os.path.dirname(qr_code_path), os.path.basename(qr_code_path))
    
    # Otherwise, try to generate it (if we have qrcode library)
    try:
        import qrcode
        from PIL import Image
        
        # Get drive info
        conn = get_db_connection()
        conn.row_factory = dict_factory
        cursor = conn.cursor()
        cursor.execute("SELECT id, label, volume_name FROM drives WHERE id = ?", (drive_id,))
        drive = cursor.fetchone()
        conn.close()
        
        if not drive:
            return jsonify({'error': 'Drive not found'}), 404
        
        # Create QR code directory if it doesn't exist
        qr_dir = os.path.dirname(qr_code_path)
        if not os.path.exists(qr_dir):
            os.makedirs(qr_dir)
        
        # Generate QR code with drive info
        drive_info = {
            'id': drive['id'],
            'label': drive['label'],
            'volume_name': drive['volume_name']
        }
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(json.dumps(drive_info))
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        img.save(qr_code_path)
        
        return send_from_directory(os.path.dirname(qr_code_path), os.path.basename(qr_code_path))
        
    except ImportError:
        # If qrcode is not installed, return a placeholder
        return jsonify({'error': 'QR code generation not available. Install the qrcode library: pip install qrcode[pil]'}), 501
    except Exception as e:
        return jsonify({'error': f'Failed to generate QR code: {str(e)}'}), 500

@app.route('/api/drives/<drive_id>/folders', methods=['GET'])
def get_drive_folders(drive_id):
    """Get top-level folders for a drive"""
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Verify drive exists
    cursor.execute("SELECT id FROM drives WHERE id = ?", (drive_id,))
    drive = cursor.fetchone()
    
    if not drive:
        conn.close()
        return jsonify({'error': 'Drive not found'}), 404
    
    # Get unique top-level folders from this drive
    # We'll extract the first segment of each file path
    cursor.execute("""
    SELECT 
        DISTINCT SUBSTR(path, 1, INSTR(path || '/', '/') - 1) as folder_path,
        COUNT(*) as item_count
    FROM files
    WHERE drive_id = ? AND path IS NOT NULL AND path != ''
    GROUP BY folder_path
    ORDER BY folder_path
    """, (drive_id,))
    
    folders = cursor.fetchall()
    
    # Get client assignments for each folder (if any)
    for folder in folders:
        # For each folder, get the most recent project that specifically targets this folder
        cursor.execute("""
        SELECT p.id, p.client, p.date_created
        FROM projects p
        WHERE p.name LIKE ? AND p.notes LIKE ?
        ORDER BY p.date_created DESC
        LIMIT 1
        """, (f"Folder: {folder['folder_path']}%", f"%Folder assignment for {folder['folder_path']}%"))
        
        folder_project = cursor.fetchone()
        
        if folder_project:
            folder['client'] = folder_project['client']
            folder['project_id'] = folder_project['id']
        else:
            # If no specific folder project, check files within this folder
            cursor.execute("""
            SELECT DISTINCT p.client, p.id
            FROM projects p
            JOIN project_files pf ON p.id = pf.project_id
            JOIN files f ON pf.file_id = f.id
            WHERE f.drive_id = ? AND f.path LIKE ?
            ORDER BY p.date_created DESC
            LIMIT 1
            """, (drive_id, folder['folder_path'] + '/%'))
            
            client_result = cursor.fetchone()
            
            if client_result:
                folder['client'] = client_result['client']
                folder['project_id'] = client_result['id']
            else:
                folder['client'] = None
                folder['project_id'] = None
    
    conn.close()
    
    return jsonify(folders)

@app.route('/api/drives/<drive_id>/assign-client', methods=['POST'])
def assign_drive_to_client(drive_id):
    """Assign a drive to a client by creating a project for the drive"""
    data = request.json
    client_name = data.get('client', '').strip()
    
    if not client_name:
        return jsonify({'error': 'Client name is required'}), 400
    
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Verify drive exists
    cursor.execute("SELECT id, label, volume_name FROM drives WHERE id = ?", (drive_id,))
    drive = cursor.fetchone()
    
    if not drive:
        conn.close()
        return jsonify({'error': 'Drive not found'}), 404
    
    # Create a project for this drive
    drive_name = drive['label'] or drive['volume_name'] or drive['id']
    project_id = str(uuid.uuid4())
    project_name = f"Drive: {drive_name}"
    
    cursor.execute("""
    INSERT INTO projects (id, name, client, date_created, notes)
    VALUES (?, ?, ?, ?, ?)
    """, (project_id, project_name, client_name, datetime.now().isoformat(), f"Drive assignment for {drive_name}"))
    
    # Get all files from this drive
    cursor.execute("SELECT id FROM files WHERE drive_id = ?", (drive_id,))
    files = cursor.fetchall()
    
    # Assign all files to the project
    for file in files:
        cursor.execute("""
        INSERT OR IGNORE INTO project_files (project_id, file_id)
        VALUES (?, ?)
        """, (project_id, file['id']))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'status': 'success',
        'drive_id': drive_id,
        'client': client_name,
        'project_id': project_id
    })

@app.route('/api/folders/assign-client', methods=['POST'])
def assign_folder_to_client():
    """Assign a folder to a client by creating a project for the folder contents"""
    data = request.json
    drive_id = data.get('drive_id', '').strip()
    folder_path = data.get('folder_path', '').strip()
    client_name = data.get('client', '').strip()
    
    if not client_name:
        return jsonify({'error': 'Client name is required'}), 400
    
    if not drive_id:
        return jsonify({'error': 'Drive ID is required'}), 400
    
    if not folder_path:
        return jsonify({'error': 'Folder path is required'}), 400
    
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Verify drive exists
    cursor.execute("SELECT id, label, volume_name FROM drives WHERE id = ?", (drive_id,))
    drive = cursor.fetchone()
    
    if not drive:
        conn.close()
        return jsonify({'error': 'Drive not found'}), 404
    
    # Check if this folder already has an explicit project assignment
    cursor.execute("""
    SELECT id, client FROM projects 
    WHERE name LIKE ? AND notes LIKE ?
    ORDER BY date_created DESC
    LIMIT 1
    """, (f"Folder: {folder_path}%", f"%Folder assignment for {folder_path}%"))
    
    existing_project = cursor.fetchone()
    
    if existing_project:
        # If this folder already has a project but with a different client,
        # we'll update the existing project instead of creating a new one
        if existing_project['client'] != client_name:
            cursor.execute("""
            UPDATE projects 
            SET client = ?, date_created = ?
            WHERE id = ?
            """, (client_name, datetime.now().isoformat(), existing_project['id']))
            
            project_id = existing_project['id']
            
            # Log the update for debugging
            print(f"Updated project {project_id} for folder {folder_path} from client '{existing_project['client']}' to '{client_name}'")
        else:
            # Already assigned to this client, nothing to do
            project_id = existing_project['id']
            conn.close()
            return jsonify({
                'status': 'success',
                'drive_id': drive_id,
                'folder_path': folder_path,
                'client': client_name,
                'project_id': project_id,
                'message': 'Folder already assigned to this client, no changes made'
            })
    else:
        # Create a new project for this folder
        drive_name = drive['label'] or drive['volume_name'] or drive['id']
        project_id = str(uuid.uuid4())
        project_name = f"Folder: {folder_path} ({drive_name})"
        
        cursor.execute("""
        INSERT INTO projects (id, name, client, date_created, notes)
        VALUES (?, ?, ?, ?, ?)
        """, (project_id, project_name, client_name, datetime.now().isoformat(), 
              f"Folder assignment for {folder_path} on drive {drive_name}"))
    
    # Get all files from this folder
    cursor.execute("""
    SELECT id FROM files 
    WHERE drive_id = ? AND path LIKE ?
    """, (drive_id, folder_path + '/%'))
    
    files = cursor.fetchall()
    
    # Remove any previous project assignments for these files
    file_ids = [file['id'] for file in files]
    if file_ids:
        placeholders = ','.join(['?'] * len(file_ids))
        
        # Get all project IDs for these files that aren't the current project
        cursor.execute(f"""
        SELECT DISTINCT project_id
        FROM project_files
        WHERE file_id IN ({placeholders}) AND project_id != ?
        """, file_ids + [project_id])
        
        old_project_ids = [row['project_id'] for row in cursor.fetchall()]
        
        # Remove these files from their old projects
        if old_project_ids:
            for old_project_id in old_project_ids:
                cursor.execute(f"""
                DELETE FROM project_files
                WHERE project_id = ? AND file_id IN ({placeholders})
                """, [old_project_id] + file_ids)
    
    # Assign all files to the new/updated project
    for file in files:
        cursor.execute("""
        INSERT OR IGNORE INTO project_files (project_id, file_id)
        VALUES (?, ?)
        """, (project_id, file['id']))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'status': 'success',
        'drive_id': drive_id,
        'folder_path': folder_path,
        'client': client_name,
        'project_id': project_id
    })

@app.route('/api/clients', methods=['GET'])
def get_clients():
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Get all unique clients from projects table by client name
    # Note: Using DISTINCT ON client, not id to avoid duplicates
    cursor.execute("""
    SELECT DISTINCT client as name
    FROM projects
    WHERE client IS NOT NULL AND client != ''
    ORDER BY client
    """)
    
    clients = cursor.fetchall()
    
    # Convert to list of objects with id and name
    result = []
    for i, client in enumerate(clients):
        result.append({
            'id': f"client-{i+1}",
            'name': client['name']
        })
    
    conn.close()
    
    return jsonify(result)

@app.route('/api/clients', methods=['POST'])
def add_client():
    data = request.json
    client_name = data.get('name')
    
    if not client_name:
        return jsonify({'error': 'Client name is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create a new project with the client name
    # In a real system, you might have a dedicated clients table
    project_id = str(uuid.uuid4())
    cursor.execute("""
    INSERT INTO projects (id, name, client, date_created, notes)
    VALUES (?, ?, ?, ?, ?)
    """, (project_id, f"Client: {client_name}", client_name, datetime.now().isoformat(), "Created via GUI"))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': project_id,
        'name': client_name
    })

@app.route('/api/clients/<client_id>/assign-files', methods=['POST'])
def assign_files_to_client(client_id):
    data = request.json
    file_ids = data.get('fileIds', [])
    
    if not file_ids:
        return jsonify({'error': 'No files provided'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Find project ID associated with this client ID
    cursor.execute("SELECT id FROM projects WHERE id = ?", (client_id,))
    project = cursor.fetchone()
    
    if not project:
        return jsonify({'error': 'Client/project not found'}), 404
    
    # Assign files to the project
    for file_id in file_ids:
        try:
            cursor.execute("""
            INSERT OR IGNORE INTO project_files (project_id, file_id)
            VALUES (?, ?)
            """, (client_id, file_id))
        except sqlite3.Error as e:
            return jsonify({'error': f'Database error: {str(e)}'}), 500
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'files_assigned': len(file_ids)})

@app.route('/api/search', methods=['GET'])
def search():
    query = request.args.get('query', '')
    search_type = request.args.get('type', 'any')
    include_transcripts = request.args.get('transcripts', 'false').lower() == 'true'
    drive_id = request.args.get('drive', '')
    client_id = request.args.get('client', '')
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('pageSize', 20))
    
    offset = (page - 1) * page_size
    
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Build WHERE clauses based on search parameters
    where_clauses = []
    params = []
    
    # Add drive filter if specified
    if drive_id:
        where_clauses.append("f.drive_id = ?")
        params.append(drive_id)
    
    # Add client/project filter if specified
    if client_id:
        where_clauses.append("EXISTS (SELECT 1 FROM project_files pf JOIN projects p ON pf.project_id = p.id WHERE pf.file_id = f.id AND p.id = ?)")
        params.append(client_id)
    
    # Add search criteria based on type
    if query:
        if search_type == 'filename':
            where_clauses.append("f.filename LIKE ?")
            params.append(f"%{query}%")
        elif search_type == 'extension':
            where_clauses.append("f.extension = ?")
            params.append(query.lstrip('.').lower())
        elif search_type == 'project':
            where_clauses.append("EXISTS (SELECT 1 FROM project_files pf JOIN projects p ON pf.project_id = p.id WHERE pf.file_id = f.id AND (p.name LIKE ? OR p.client LIKE ?))")
            params.extend([f"%{query}%", f"%{query}%"])
        else:  # 'any' - general search
            if include_transcripts:
                where_clauses.append("(f.filename LIKE ? OR f.path LIKE ? OR d.label LIKE ? OR d.volume_name LIKE ? OR (f.transcription_status = 'completed' AND f.transcription LIKE ?))")
                params.extend([f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%"])
            else:
                where_clauses.append("(f.filename LIKE ? OR f.path LIKE ? OR d.label LIKE ? OR d.volume_name LIKE ?)")
                params.extend([f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%"])
    
    # Combine WHERE clauses
    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    # Get total count for pagination
    cursor.execute(f"""
    SELECT COUNT(*) as total
    FROM files f
    JOIN drives d ON f.drive_id = d.id
    WHERE {where_sql}
    """, params)
    
    total_results = cursor.fetchone()['total']
    total_pages = (total_results + page_size - 1) // page_size
    
    # Execute search query with pagination
    cursor.execute(f"""
    SELECT f.id, f.drive_id as driveId, f.path, f.filename, f.extension,
           f.size_bytes as sizeBytes, f.date_modified as dateModified,
           f.mime_type as mimeType, f.thumbnail_path as thumbnailPath,
           f.transcription, d.label as driveLabel, d.volume_name as volumeName
    FROM files f
    JOIN drives d ON f.drive_id = d.id
    WHERE {where_sql}
    ORDER BY f.date_modified DESC
    LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    
    results = cursor.fetchall()
    
    # Process the results to make them JSON-friendly
    for result in results:
        # Process transcription JSON if it exists
        if result['transcription']:
            try:
                result['transcription'] = json.loads(result['transcription'])
            except json.JSONDecodeError:
                result['transcription'] = None
        
        # Combine drive label and volume name
        result['driveName'] = result['driveLabel'] or result['volumeName']
        
        # Remove redundant keys
        result.pop('driveLabel', None)
        result.pop('volumeName', None)
    
    conn.close()
    
    return jsonify({
        'results': results,
        'total': total_results,
        'page': page,
        'pageSize': page_size,
        'totalPages': total_pages
    })

# Projects API endpoints
@app.route('/api/projects', methods=['GET'])
def get_projects():
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT p.id, p.name, p.client, p.date_created as dateCreated, p.notes,
           COUNT(pf.file_id) as fileCount
    FROM projects p
    LEFT JOIN project_files pf ON p.id = pf.project_id
    GROUP BY p.id
    ORDER BY p.date_created DESC
    """)
    
    projects = cursor.fetchall()
    conn.close()
    
    return jsonify(projects)

@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.json
    project_name = data.get('name', '').strip()
    client_name = data.get('client', '').strip()
    
    if not project_name:
        return jsonify({'error': 'Project name is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create a new project
    project_id = str(uuid.uuid4())
    notes = f"Created via GUI. Client: {client_name}" if client_name else "Created via GUI"
    
    cursor.execute("""
    INSERT INTO projects (id, name, client, date_created, notes)
    VALUES (?, ?, ?, ?, ?)
    """, (project_id, project_name, client_name, datetime.now().isoformat(), notes))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': project_id,
        'name': project_name,
        'client': client_name,
        'status': 'success'
    })

@app.route('/api/projects/<project_id>', methods=['GET'])
def get_project(project_id):
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT p.id, p.name, p.client, p.date_created as dateCreated, p.notes
    FROM projects p
    WHERE p.id = ?
    """, (project_id,))
    
    project = cursor.fetchone()
    
    if not project:
        conn.close()
        return jsonify({'error': 'Project not found'}), 404
    
    # Get files for this project
    cursor.execute("""
    SELECT f.id, f.filename, f.path, f.drive_id as driveId, f.size_bytes as sizeBytes,
           f.date_modified as dateModified, f.thumbnail_path as thumbnailPath,
           d.label as driveLabel, d.volume_name as volumeName
    FROM files f
    JOIN project_files pf ON f.id = pf.file_id
    JOIN drives d ON f.drive_id = d.id
    WHERE pf.project_id = ?
    ORDER BY f.date_modified DESC
    """, (project_id,))
    
    files = cursor.fetchall()
    
    # Add combined drive name
    for file in files:
        file['driveName'] = file.get('driveLabel') or file.get('volumeName')
        file.pop('driveLabel', None)
        file.pop('volumeName', None)
    
    project['files'] = files
    conn.close()
    
    return jsonify(project)

@app.route('/api/projects/<project_id>/export', methods=['GET'])
def export_project(project_id):
    """Generate a CSV export of a project's files"""
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Verify project exists
    cursor.execute("SELECT name FROM projects WHERE id = ?", (project_id,))
    project = cursor.fetchone()
    
    if not project:
        conn.close()
        return jsonify({'error': 'Project not found'}), 404
    
    # Get files for this project
    cursor.execute("""
    SELECT f.id, f.filename, f.path, f.drive_id, f.size_bytes,
           f.date_modified, f.mime_type, f.extension,
           d.label as drive_label, d.volume_name as drive_volume
    FROM files f
    JOIN project_files pf ON f.id = pf.file_id
    JOIN drives d ON f.drive_id = d.id
    WHERE pf.project_id = ?
    ORDER BY f.date_modified DESC
    """, (project_id,))
    
    files = cursor.fetchall()
    conn.close()
    
    # Generate CSV content
    import csv
    from io import StringIO
    
    csv_data = StringIO()
    csv_writer = csv.writer(csv_data)
    
    # Write header
    csv_writer.writerow(['ID', 'Filename', 'Path', 'Drive ID', 'Drive Name', 'Size (bytes)', 'Size (human)', 'Date Modified', 'MIME Type', 'Extension'])
    
    # Write data rows
    for file in files:
        size_human = format_file_size(file['size_bytes'])
        drive_name = file['drive_label'] or file['drive_volume'] or 'Unknown Drive'
        
        csv_writer.writerow([
            file['id'],
            file['filename'],
            file['path'],
            file['drive_id'],
            drive_name,
            file['size_bytes'],
            size_human,
            file['date_modified'],
            file['mime_type'],
            file['extension']
        ])
    
    # Create response with CSV attachment
    from flask import Response
    
    response = Response(
        csv_data.getvalue(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename=project_{project_id}.csv'
        }
    )
    
    return response

# Helper function to format file size
def format_file_size(bytes_size):
    if bytes_size < 1024:
        return f"{bytes_size} B"
    elif bytes_size < 1024 * 1024:
        return f"{bytes_size / 1024:.1f} KB"
    elif bytes_size < 1024 * 1024 * 1024:
        return f"{bytes_size / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes_size / (1024 * 1024 * 1024):.2f} GB"

# Reports and Analytics API
@app.route('/api/reports/storage', methods=['GET'])
def get_storage_report():
    """Get storage usage by drive"""
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT d.id, d.label, d.volume_name as volumeName, 
           d.size_bytes as sizeBytes, d.free_bytes as freeBytes,
           COUNT(f.id) as fileCount,
           SUM(f.size_bytes) as usedBytes
    FROM drives d
    LEFT JOIN files f ON d.id = f.drive_id
    GROUP BY d.id
    ORDER BY usedBytes DESC
    """)
    
    drives = cursor.fetchall()
    conn.close()
    
    return jsonify({'drives': drives})

@app.route('/api/reports/filetypes', methods=['GET'])
def get_filetypes_report():
    """Get file types distribution"""
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT extension, COUNT(*) as count, SUM(size_bytes) as totalBytes
    FROM files
    GROUP BY extension
    ORDER BY count DESC
    """)
    
    file_types = cursor.fetchall()
    conn.close()
    
    return jsonify({'fileTypes': file_types})

# Start the server
if __name__ == '__main__':
    app.run(debug=True, port=5000)
