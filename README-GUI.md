This is a basic Flask API implementation to connect the GUI to the SQLite database.
Copy this to a server.py file in the root directory to make the GUI functional.

```python
#!/usr/bin/env python3

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import sqlite3
import json
import uuid
from datetime import datetime
import mimetypes

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Allow cross-origin requests

# Database configuration
DB_PATH = os.path.expanduser("~/media-asset-tracker/asset-db.sqlite")
THUMBNAILS_DIR = os.path.expanduser("~/media-asset-tracker/thumbnails")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')

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

# Serve thumbnail images
@app.route('/thumbnails/<path:path>')
def serve_thumbnail(path):
    return send_from_directory(THUMBNAILS_DIR, path)

# API routes
@app.route('/api/drives', methods=['GET'])
def get_drives():
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT id, label, volume_name as volumeName, size_bytes as sizeBytes, 
           free_bytes as freeBytes, format, mount_point as mountPoint, 
           date_cataloged as dateCataloged, last_verified as lastVerified
    FROM drives
    ORDER BY date_cataloged DESC
    """)
    
    drives = cursor.fetchall()
    conn.close()
    
    return jsonify(drives)

@app.route('/api/clients', methods=['GET'])
def get_clients():
    conn = get_db_connection()
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    
    # Get all unique clients from projects table
    cursor.execute("""
    SELECT DISTINCT id, client as name
    FROM projects
    WHERE client IS NOT NULL AND client != ''
    ORDER BY client
    """)
    
    clients = cursor.fetchall()
    conn.close()
    
    return jsonify(clients)

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

# Start the server
if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

To use this implementation:

1. Create a new file `/home/graetzy/Documents/Claude/Projects/hardware-infrastructure/vaultkeeper/server.py`
2. Copy the above code into the file
3. Install required packages: `pip install flask flask-cors`
4. Run the server: `python server.py`
5. Open a web browser and navigate to http://localhost:5000

The server will serve the GUI files from the web directory and provide API endpoints for
the front-end to interact with the SQLite database.