#!/usr/bin/env python3
"""
Media Asset Tracker - Web Interface
----------------------------------
A simple web interface for the Media Asset Tracking System
"""

import os
import sys
import sqlite3
import json
import datetime
from pathlib import Path
from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file

# Ensure media-asset-tracker directory exists
os.makedirs(os.path.expanduser("~/media-asset-tracker"), exist_ok=True)

# Database setup
DB_PATH = os.path.expanduser("~/media-asset-tracker/asset-db.sqlite")
QR_CODE_DIR = os.path.expanduser("~/media-asset-tracker/qr-codes")
os.makedirs(QR_CODE_DIR, exist_ok=True)

app = Flask(__name__)

def dict_factory(cursor, row):
    """Convert database row objects to dictionaries"""
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}

def get_db_connection():
    """Get a database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    return conn

def format_filesize(size_bytes):
    """Format file size in bytes to human-readable format"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024**2:
        return f"{size_bytes/1024:.2f} KB"
    elif size_bytes < 1024**3:
        return f"{size_bytes/(1024**2):.2f} MB"
    else:
        return f"{size_bytes/(1024**3):.2f} GB"

@app.template_filter('filesize')
def filesize_filter(size_bytes):
    """Template filter for formatting file sizes"""
    return format_filesize(size_bytes)

@app.route('/')
def index():
    """Home page with search and stats"""
    conn = get_db_connection()
    
    # Get basic stats
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as drive_count FROM drives")
    drive_count = cursor.fetchone()['drive_count']
    
    cursor.execute("SELECT COUNT(*) as file_count FROM files")
    file_count = cursor.fetchone()['file_count']
    
    cursor.execute("SELECT COUNT(*) as project_count FROM projects")
    project_count = cursor.fetchone()['project_count']
    
    cursor.execute("SELECT SUM(size_bytes) as total_size FROM drives")
    total_size = cursor.fetchone()['total_size'] or 0
    
    # Get recent drives
    cursor.execute("""
    SELECT id, label, volume_name, size_bytes, date_cataloged 
    FROM drives 
    ORDER BY date_cataloged DESC 
    LIMIT 5
    """)
    recent_drives = cursor.fetchall()
    
    # Get recent projects
    cursor.execute("""
    SELECT id, name, client, date_created 
    FROM projects 
    ORDER BY date_created DESC 
    LIMIT 5
    """)
    recent_projects = cursor.fetchall()
    
    conn.close()
    
    return render_template(
        'index.html', 
        drive_count=drive_count,
        file_count=file_count,
        project_count=project_count,
        total_size=format_filesize(total_size),
        recent_drives=recent_drives,
        recent_projects=recent_projects
    )

@app.route('/search', methods=['GET', 'POST'])
def search():
    """Search page"""
    query = request.args.get('query', '') or request.form.get('query', '')
    search_type = request.args.get('type', 'any') or request.form.get('type', 'any')
    
    results = []
    if query:
        conn = get_db_connection()
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
    
    return render_template('search.html', query=query, type=search_type, results=results)

@app.route('/drives')
def drives():
    """List all drives"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT id, label, volume_name, size_bytes, free_bytes, format, 
           date_cataloged, last_verified, qr_code_path, notes
    FROM drives
    ORDER BY date_cataloged DESC
    """)
    
    drives = cursor.fetchall()
    conn.close()
    
    return render_template('drives.html', drives=drives)

@app.route('/drive/<drive_id>')
def drive_detail(drive_id):
    """Drive detail page"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get drive info
    cursor.execute("""
    SELECT id, label, volume_name, size_bytes, free_bytes, format,
           mount_point, date_cataloged, last_verified, qr_code_path, notes
    FROM drives
    WHERE id = ?
    """, (drive_id,))
    
    drive = cursor.fetchone()
    
    if not drive:
        conn.close()
        return "Drive not found", 404
    
    # Get file stats
    cursor.execute("""
    SELECT 
        COUNT(*) as file_count,
        SUM(size_bytes) as total_size,
        COUNT(DISTINCT extension) as extension_count
    FROM files
    WHERE drive_id = ?
    """, (drive_id,))
    
    stats = cursor.fetchone()
    
    # Get top extensions
    cursor.execute("""
    SELECT extension, COUNT(*) as count
    FROM files
    WHERE drive_id = ? AND extension != ''
    GROUP BY extension
    ORDER BY count DESC
    LIMIT 10
    """, (drive_id,))
    
    extensions = cursor.fetchall()
    
    # Get sample files
    cursor.execute("""
    SELECT id, filename, path, size_bytes, date_modified, mime_type
    FROM files
    WHERE drive_id = ?
    ORDER BY date_modified DESC
    LIMIT 50
    """, (drive_id,))
    
    files = cursor.fetchall()
    
    conn.close()
    
    return render_template(
        'drive_detail.html', 
        drive=drive, 
        stats=stats,
        extensions=extensions,
        files=files
    )

@app.route('/projects')
def projects():
    """List all projects"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT p.id, p.name, p.client, p.date_created, p.notes,
           COUNT(pf.file_id) as file_count
    FROM projects p
    LEFT JOIN project_files pf ON p.id = pf.project_id
    GROUP BY p.id
    ORDER BY p.date_created DESC
    """)
    
    projects = cursor.fetchall()
    conn.close()
    
    return render_template('projects.html', projects=projects)

@app.route('/project/<project_id>')
def project_detail(project_id):
    """Project detail page"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get project info
    cursor.execute("""
    SELECT id, name, client, date_created, date_completed, notes
    FROM projects
    WHERE id = ?
    """, (project_id,))
    
    project = cursor.fetchone()
    
    if not project:
        conn.close()
        return "Project not found", 404
    
    # Get project files
    cursor.execute("""
    SELECT f.id, f.filename, f.path, f.size_bytes, f.date_modified,
           d.label, d.volume_name, d.id as drive_id
    FROM files f
    JOIN drives d ON f.drive_id = d.id
    JOIN project_files pf ON f.id = pf.file_id
    WHERE pf.project_id = ?
    ORDER BY f.date_modified DESC
    """, (project_id,))
    
    files = cursor.fetchall()
    
    conn.close()
    
    return render_template(
        'project_detail.html', 
        project=project, 
        files=files
    )

@app.route('/file/<file_id>')
def file_detail(file_id):
    """File detail page"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get file info
    cursor.execute("""
    SELECT f.*, d.label, d.volume_name, d.id as drive_id
    FROM files f
    JOIN drives d ON f.drive_id = d.id
    WHERE f.id = ?
    """, (file_id,))
    
    file = cursor.fetchone()
    
    if not file:
        conn.close()
        return "File not found", 404
    
    # Get projects this file belongs to
    cursor.execute("""
    SELECT p.id, p.name, p.client
    FROM projects p
    JOIN project_files pf ON p.id = pf.project_id
    WHERE pf.file_id = ?
    """, (file_id,))
    
    projects = cursor.fetchall()
    
    # Parse media info if available
    media_info = None
    if file['media_info']:
        try:
            media_info = json.loads(file['media_info'])
        except:
            pass
    
    conn.close()
    
    return render_template(
        'file_detail.html', 
        file=file, 
        projects=projects,
        media_info=media_info
    )

@app.route('/qr/<drive_id>')
def get_qr_code(drive_id):
    """Get QR code for a drive"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT qr_code_path FROM drives WHERE id = ?", 
        (drive_id,)
    )
    
    drive = cursor.fetchone()
    conn.close()
    
    if not drive or not drive['qr_code_path'] or not os.path.exists(drive['qr_code_path']):
        return "QR code not found", 404
    
    return send_file(drive['qr_code_path'])

@app.route('/add-project', methods=['GET', 'POST'])
def add_project():
    """Add a new project"""
    if request.method == 'POST':
        name = request.form.get('name')
        client = request.form.get('client')
        notes = request.form.get('notes')
        
        if not name:
            return render_template('add_project.html', error="Project name is required")
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        project_id = request.form.get('id') or None  # For updates
        
        if project_id:
            # Update existing project
            cursor.execute("""
            UPDATE projects
            SET name = ?, client = ?, notes = ?
            WHERE id = ?
            """, (name, client, notes, project_id))
            
            message = "Project updated successfully"
        else:
            # Create new project
            import uuid
            project_id = str(uuid.uuid4())
            
            cursor.execute("""
            INSERT INTO projects (id, name, client, date_created, notes)
            VALUES (?, ?, ?, ?, ?)
            """, (project_id, name, client, datetime.datetime.now().isoformat(), notes))
            
            message = "Project created successfully"
        
        conn.commit()
        conn.close()
        
        return redirect(url_for('project_detail', project_id=project_id))
    
    # GET request
    project_id = request.args.get('id')
    project = None
    
    if project_id:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        project = cursor.fetchone()
        conn.close()
    
    return render_template('add_project.html', project=project)

@app.route('/api/add-to-project', methods=['POST'])
def api_add_to_project():
    """API to add files to a project"""
    data = request.json
    
    if not data or not data.get('project_id') or not data.get('file_ids'):
        return jsonify({'success': False, 'error': 'Missing required fields'}), 400
    
    project_id = data['project_id']
    file_ids = data['file_ids']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify project exists
    cursor.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'Project not found'}), 404
    
    added = 0
    for file_id in file_ids:
        try:
            cursor.execute(
                "INSERT OR IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)",
                (project_id, file_id)
            )
            if cursor.rowcount > 0:
                added += 1
        except:
            pass
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True, 
        'added': added,
        'message': f"Added {added} files to project"
    })

# Templates directory
@app.route('/templates/<path:path>')
def serve_template(path):
    """Serve basic HTML templates for the pages"""
    templates = {
        'index.html': """
<!DOCTYPE html>
<html>
<head>
    <title>Media Asset Tracker</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container">
            <a class="navbar-brand" href="/">Media Asset Tracker</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav">
                    <li class="nav-item">
                        <a class="nav-link" href="/drives">Drives</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/projects">Projects</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/search">Search</a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>
    
    <div class="container mt-4">
        <h1>Media Asset Tracker</h1>
        
        <div class="row">
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-header">
                        <h5 class="card-title">Quick Search</h5>
                    </div>
                    <div class="card-body">
                        <form action="/search" method="get">
                            <div class="input-group mb-3">
                                <input type="text" class="form-control" name="query" placeholder="Search files...">
                                <button class="btn btn-primary" type="submit">Search</button>
                            </div>
                        </form>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h5 class="card-title">System Stats</h5>
                    </div>
                    <div class="card-body">
                        <p><strong>Total Drives:</strong> {{ drive_count }}</p>
                        <p><strong>Total Files:</strong> {{ file_count }}</p>
                        <p><strong>Total Projects:</strong> {{ project_count }}</p>
                        <p><strong>Total Storage:</strong> {{ total_size }}</p>
                    </div>
                </div>
            </div>
            
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="card-title mb-0">Recent Drives</h5>
                        <a href="/drives" class="btn btn-sm btn-outline-primary">View All</a>
                    </div>
                    <div class="card-body">
                        {% if recent_drives %}
                            <ul class="list-group list-group-flush">
                                {% for drive in recent_drives %}
                                    <li class="list-group-item d-flex justify-content-between align-items-center">
                                        <a href="/drive/{{ drive.id }}">
                                            {{ drive.label or drive.volume_name }}
                                        </a>
                                        <span class="badge bg-secondary">{{ drive.size_bytes|filesize }}</span>
                                    </li>
                                {% endfor %}
                            </ul>
                        {% else %}
                            <p class="text-muted">No drives cataloged yet</p>
                        {% endif %}
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="card-title mb-0">Recent Projects</h5>
                        <a href="/projects" class="btn btn-sm btn-outline-primary">View All</a>
                    </div>
                    <div class="card-body">
                        {% if recent_projects %}
                            <ul class="list-group list-group-flush">
                                {% for project in recent_projects %}
                                    <li class="list-group-item">
                                        <a href="/project/{{ project.id }}">
                                            {{ project.name }}
                                        </a>
                                        {% if project.client %}
                                            <span class="text-muted">- {{ project.client }}</span>
                                        {% endif %}
                                    </li>
                                {% endfor %}
                            </ul>
                        {% else %}
                            <p class="text-muted">No projects created yet</p>
                        {% endif %}
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
        """,
        'search.html': """
<!DOCTYPE html>
<html>
<head>
    <title>Search - Media Asset Tracker</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container">
            <a class="navbar-brand" href="/">Media Asset Tracker</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav">
                    <li class="nav-item">
                        <a class="nav-link" href="/drives">Drives</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/projects">Projects</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link active" href="/search">Search</a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>
    
    <div class="container mt-4">
        <h1>Search Files</h1>
        
        <div class="card mb-4">
            <div class="card-body">
                <form action="/search" method="get">
                    <div class="row">
                        <div class="col-md-8">
                            <input type="text" class="form-control" name="query" value="{{ query }}" placeholder="Search term...">
                        </div>
                        <div class="col-md-2">
                            <select class="form-select" name="type">
                                <option value="any" {% if type == 'any' %}selected{% endif %}>All</option>
                                <option value="filename" {% if type == 'filename' %}selected{% endif %}>Filename</option>
                                <option value="extension" {% if type == 'extension' %}selected{% endif %}>Extension</option>
                                <option value="project" {% if type == 'project' %}selected{% endif %}>Project</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <button class="btn btn-primary w-100" type="submit">Search</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
        
        {% if query %}
            <h2>Results for "{{ query }}"</h2>
            
            {% if results %}
                <p>Found {{ results|length }} results</p>
                
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Filename</th>
                                <th>Path</th>
                                <th>Size</th>
                                <th>Drive</th>
                                <th>Modified</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {% for file in results %}
                                <tr>
                                    <td>
                                        <a href="/file/{{ file.id }}">{{ file.filename }}</a>
                                    </td>
                                    <td>{{ file.path }}</td>
                                    <td>{{ file.size_bytes|filesize }}</td>
                                    <td>
                                        <a href="/drive/{{ file.drive_id }}">
                                            {{ file.label or file.volume_name }}
                                        </a>
                                    </td>
                                    <td>{{ file.date_modified }}</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-primary add-to-project"
                                                data-file-id="{{ file.id }}"
                                                data-filename="{{ file.filename }}">
                                            Add to Project
                                        </button>
                                    </td>
                                </tr>
                            {% endfor %}
                        </tbody>
                    </table>
                </div>
                
                <!-- Add to Project Modal -->
                <div class="modal fade" id="addToProjectModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Add to Project</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <p>Add <span id="selectedFileName"></span> to project:</p>
                                <select class="form-select" id="projectSelect">
                                    <option value="">Loading projects...</option>
                                </select>
                                <div class="mt-3">
                                    <a href="/add-project" class="btn btn-sm btn-link">Create New Project</a>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" id="confirmAddToProject">Add</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <script>
                    // Load projects for the modal
                    function loadProjects() {
                        fetch('/api/projects')
                            .then(response => response.json())
                            .then(data => {
                                const select = document.getElementById('projectSelect');
                                select.innerHTML = '';
                                
                                if (data.length === 0) {
                                    const option = document.createElement('option');
                                    option.value = '';
                                    option.textContent = 'No projects found';
                                    select.appendChild(option);
                                    return;
                                }
                                
                                data.forEach(project => {
                                    const option = document.createElement('option');
                                    option.value = project.id;
                                    option.textContent = project.name;
                                    select.appendChild(option);
                                });
                            });
                    }
                    
                    // Add to project buttons
                    document.querySelectorAll('.add-to-project').forEach(button => {
                        button.addEventListener('click', function() {
                            const fileId = this.dataset.fileId;
                            const filename = this.dataset.filename;
                            
                            document.getElementById('selectedFileName').textContent = filename;
                            document.getElementById('confirmAddToProject').dataset.fileId = fileId;
                            
                            loadProjects();
                            
                            const modal = new bootstrap.Modal(document.getElementById('addToProjectModal'));
                            modal.show();
                        });
                    });
                    
                    // Confirm add to project
                    document.getElementById('confirmAddToProject').addEventListener('click', function() {
                        const fileId = this.dataset.fileId;
                        const projectId = document.getElementById('projectSelect').value;
                        
                        if (!projectId) return;
                        
                        fetch('/api/add-to-project', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                project_id: projectId,
                                file_ids: [fileId]
                            })
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                const modal = bootstrap.Modal.getInstance(document.getElementById('addToProjectModal'));
                                modal.hide();
                                alert('File added to project successfully');
                            } else {
                                alert('Error: ' + data.error);
                            }
                        });
                    });
                </script>
            {% else %}
                <div class="alert alert-info">
                    No results found for "{{ query }}"
                </div>
            {% endif %}
        {% endif %}
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
        """
    }
    
    if path in templates:
        return templates[path]
    else:
        return "Template not found", 404

@app.route('/api/projects')
def api_projects():
    """API to get projects list"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name FROM projects ORDER BY name")
    projects = cursor.fetchall()
    
    conn.close()
    
    return jsonify(projects)

if __name__ == '__main__':
    # Create database if it doesn't exist
    if not os.path.exists(DB_PATH):
        print("Database not found. Please run the 'media-asset-tracker init' command first.")
        sys.exit(1)
    
    print(f"Starting web interface at http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)}%",))
        
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
            SELECT f.*, d.label, d.volume_name, p.name as project_name, p.id as project_id
            FROM files f
            JOIN drives d ON f.drive_id = d.id
            JOIN project_files pf ON f.id = pf.file_id
            JOIN projects p ON pf.project_id = p.id
            WHERE p.name LIKE ? OR p.client LIKE ?
            ORDER BY f.date_modified DESC
            LIMIT 100
            """
            cursor.execute(sql, (f"%{query