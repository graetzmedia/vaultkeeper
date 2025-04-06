# VaultKeeper Web Interface

This document contains instructions for setting up and using the VaultKeeper web interface for querying the database, viewing thumbnails, and managing clients.

## Setup Instructions

### Prerequisites

- Python 3.6 or higher
- SQLite database (created by VaultKeeper's asset scanning tools)
- Thumbnails generated for media files

### Required Python Packages

```bash
pip install flask flask-cors pillow qrcode
```

### Running the Web Interface

1. Start the Flask server:

```bash
cd /path/to/vaultkeeper
python server.py
```

2. Open a web browser and navigate to:

```
http://localhost:5000
```

## Features

### Query Tool

- Search for files by filename, extension, or content
- Filter results by drive or client
- Option to include transcripts in search
- View results in thumbnail or list view
- Preview files with detailed information

### Client Management

- Add new clients to the database
- Assign files to clients for organization
- Filter search results by client
- Add new clients directly from any assignment dropdown
- Real-time UI updates after client changes

### Drives Management

- View all cataloged drives
- See storage information including size and free space
- Generate QR codes for drives
- Assign entire drives to clients with one click
- Browse folders within drives
- Assign individual folders to specific clients

### Projects Management

- Create and manage projects
- Assign files to projects
- Export project file lists to CSV
- Automatic UI refreshing after project creation

### Reports & Analytics

- View storage usage by drive
- See file type distribution across the repository

## Troubleshooting

### Thumbnail Display Issues

If thumbnails are not displaying:

1. Verify the thumbnail directory paths in `server.py` are correct
2. Check that the thumbnails have been generated
3. Check the browser console for any errors
4. The system will fall back to placeholders if actual thumbnails are not found

### Database Connection Issues

If the web interface cannot connect to the database:

1. Verify the database path in `server.py`
2. Check that the database file exists and is accessible
3. Ensure the database has the expected tables (drives, files, projects, project_files)

### Frontend-Backend Connection Issues

If the frontend cannot connect to the API:

1. Verify the API URL in app.js (default: http://localhost:5000)
2. Check that the Flask server is running
3. Check for CORS issues in the browser console

## Implementation Details

The web interface consists of:

1. **Frontend**: HTML, CSS, and JavaScript files in the `/web` directory
2. **Backend**: Flask API server in `server.py` that connects to the SQLite database

The frontend communicates with the backend via REST API endpoints that return JSON data.