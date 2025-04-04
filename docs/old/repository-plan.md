# Media Asset Tracker - Implementation Plan

This document outlines the implementation plan for the Media Asset Tracker system, following the GraetzMedia workflow guidelines. Use this as a reference when creating the repository with Claude Code.

## 1. Repository Setup

Initialize the repository following the standard workflow:

```bash
# Create local directory
mkdir -p /Users/dangraetz/Documents/Claude/Projects/tools/media-asset-tracker
cd /Users/dangraetz/Documents/Claude/Projects/tools/media-asset-tracker

# Initialize git repository
git init -b main

# Create basic structure
mkdir -p src tests docs scripts assets

# Create initial README
touch README.md

# Create GitHub repository
gh repo create graetzmedia/media-asset-tracker --private

# Push to GitHub
git add .
git commit -m "Initial commit with project structure"
git push --set-upstream origin main

# Create develop branch
git checkout -b develop
git push --set-upstream origin develop
```

## 2. Repository Structure

Follow this structure when implementing with Claude Code:

```
media-asset-tracker/
├── README.md                  # Project overview
├── src/                       # Source code
│   ├── __init__.py            # Make src a package
│   ├── cli.py                 # Command-line interface
│   ├── web.py                 # Web interface
│   ├── database.py            # Database operations
│   ├── scanner.py             # Drive scanning logic
│   ├── media_info.py          # Media metadata extraction
│   └── qr_generator.py        # QR code generation
├── tests/                     # Test files
│   ├── __init__.py            # Make tests a package
│   ├── test_cli.py            # CLI tests
│   ├── test_database.py       # Database tests
│   └── test_scanner.py        # Scanner tests
├── docs/                      # Documentation
│   ├── setup.md               # Setup guide
│   ├── usage.md               # Usage guide
│   └── api.md                 # API documentation
├── scripts/                   # Utility scripts
│   ├── install.sh             # Installation script
│   └── update.sh              # Update script
├── assets/                    # Media files, resources
│   └── label_template.png     # QR label template
├── requirements.txt           # Python dependencies
├── setup.py                   # Package setup
├── Dockerfile                 # Container definition
└── docker-compose.yml         # Service configuration
```

## 3. Core Components Implementation

### Database Module (src/database.py)

Key functionality:
- Database initialization
- Tables for drives, files, projects, and file-project associations
- CRUD operations for all entities

Example structure:

```python
"""Database operations for the Media Asset Tracker."""

import os
import sqlite3
import uuid
import datetime
from pathlib import Path

# Database constants
DB_PATH = os.path.expanduser("~/media-asset-tracker/asset-db.sqlite")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def init_db():
    """Initialize the SQLite database with proper schema."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create tables (drives, files, projects, project_files)
    # Create indexes
    
    conn.commit()
    conn.close()

def dict_factory(cursor, row):
    """Convert database row objects to dictionaries."""
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}

def get_db_connection():
    """Get a database connection with row factory set to dict_factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    return conn
    
# Drive operations
def add_drive(drive_info):
    """Add a drive to the database."""
    pass

def get_drive(drive_id):
    """Get drive information by ID."""
    pass

# File operations
def add_file(file_info):
    """Add a file to the database."""
    pass

def search_files(query, search_type="any"):
    """Search for files based on query and search type."""
    pass

# Project operations
def create_project(name, client=None, notes=None):
    """Create a new project."""
    pass

def add_files_to_project(project_id, file_ids):
    """Add files to a project."""
    pass
```

### Scanner Module (src/scanner.py)

Key functionality:
- Drive information retrieval
- File system traversal
- Metadata extraction
- Checksum calculation

Example structure:

```python
"""Drive and file scanning functionality."""

import os
import sys
import hashlib
import datetime
import mimetypes
import subprocess
import uuid
from pathlib import Path

def get_drive_info(mount_point):
    """Get drive information at the specified mount point."""
    # Platform-specific code to get volume name, format, size
    pass

def calculate_checksum(file_path, algorithm="md5", buffer_size=8192):
    """Calculate file checksum using specified algorithm."""
    pass

def get_media_info(file_path):
    """Extract media metadata using ffprobe if available."""
    pass

def scan_drive(mount_point, label=None):
    """Scan a drive and return drive and file information."""
    pass
```

### CLI Module (src/cli.py)

Key functionality:
- Command-line interface
- Argument parsing
- Commands for all operations

Example structure:

```python
#!/usr/bin/env python3
"""
Media Asset Tracker - CLI
-----------------------
Command-line interface for the Media Asset Tracking System.
"""

import os
import sys
import argparse
from . import database
from . import scanner
from . import qr_generator

def main():
    """Main function to handle command line arguments."""
    parser = argparse.ArgumentParser(
        description="Media Asset Tracking System - Catalog and track archived media files"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Add subparsers for: init, catalog, qr, search, drives, project, add-files
    
    args = parser.parse_args()
    
    # Execute command based on args.command
    
if __name__ == "__main__":
    main()
```

### Web Interface Module (src/web.py)

Key functionality:
- Flask web application
- Routes for all views
- Templates
- API endpoints

Example structure:

```python
#!/usr/bin/env python3
"""
Media Asset Tracker - Web Interface
----------------------------------
Web interface for the Media Asset Tracking System.
"""

import os
import sys
from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file
from . import database

app = Flask(__name__)

# Routes for: index, search, drives, drive_detail, file_detail, etc.

# API endpoints for: projects, add_to_project, etc.

# Template serving

if __name__ == "__main__":
    # Ensure database exists
    if not os.path.exists(database.DB_PATH):
        print("Database not found. Please run the 'media-asset-tracker init' command first.")
        sys.exit(1)
    
    app.run(debug=True, host="0.0.0.0", port=5000)
```

## 4. Testing Strategy

Use pytest for unit and integration tests:

```python
# tests/test_database.py
"""Tests for database operations."""

import os
import pytest
import tempfile
from src import database

@pytest.fixture
def test_db():
    """Create a temporary database for testing."""
    temp_dir = tempfile.TemporaryDirectory()
    old_db_path = database.DB_PATH
    database.DB_PATH = os.path.join(temp_dir.name, "test-db.sqlite")
    
    database.init_db()
    
    yield database
    
    # Cleanup
    temp_dir.cleanup()
    database.DB_PATH = old_db_path

def test_init_db(test_db):
    """Test database initialization."""
    # Verify tables exist
    conn = test_db.get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row["name"] for row in cursor.fetchall()]
    
    assert "drives" in tables
    assert "files" in tables
    assert "projects" in tables
    assert "project_files" in tables
    
    conn.close()

# Add more tests for drive operations, file operations, etc.
```

## 5. Docker Configuration

### Dockerfile

```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install ffmpeg for media info extraction
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY . .

# Create volume mount points
VOLUME ["/data", "/app/media-asset-tracker"]

# Set environment variables
ENV PYTHONPATH=/app

# Expose web interface port
EXPOSE 5000

# Entry point script
ENTRYPOINT ["python", "src/web.py"]
```

### docker-compose.yml

```yaml
version: '3'

services:
  media-asset-tracker:
    build: .
    ports:
      - "5000:5000"
    volumes:
      - ./data:/data
      - ./media-asset-tracker:/app/media-asset-tracker
    environment:
      - PYTHONPATH=/app
```

## 6. GitHub Actions CI/CD

Create a workflow file at `.github/workflows/ci.yml`:

```yaml
name: Media Asset Tracker CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.10'
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install pytest pytest-cov
        if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
    
    - name: Test with pytest
      run: |
        pytest --cov=src tests/
        
  docker:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: docker build -t media-asset-tracker .
      
    - name: Test Docker image
      run: |
        docker run --rm media-asset-tracker python -m pytest tests/
```

## 7. Package Setup

### requirements.txt

```
flask>=2.0.0
qrcode>=7.0
pillow>=9.0.0
pytest>=7.0.0
```

### setup.py

```python
from setuptools import setup, find_packages

setup(
    name="media-asset-tracker",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "flask>=2.0.0",
        "qrcode>=7.0",
        "pillow>=9.0.0",
    ],
    entry_points={
        "console_scripts": [
            "media-asset-tracker=src.cli:main",
            "media-asset-web=src.web:main",
        ],
    },
    python_requires=">=3.6",
    author="Dan Graetz",
    author_email="dan@graetzmedia.com",
    description="Media asset tracking system for archival drives",
)
```

## 8. Installation Script (scripts/install.sh)

```bash
#!/bin/bash

# Create virtual environment
python3 -m venv ~/.media-asset-tracker/venv

# Activate virtual environment
source ~/.media-asset-tracker/venv/bin/activate

# Install package
pip install -e .

# Create symlinks
mkdir -p ~/.local/bin
ln -sf ~/.media-asset-tracker/venv/bin/media-asset-tracker ~/.local/bin/
ln -sf ~/.media-asset-tracker/venv/bin/media-asset-web ~/.local/bin/

# Initialize database
media-asset-tracker init

echo "Media Asset Tracker installed successfully!"
echo "Run 'media-asset-tracker' or 'media-asset-web' to get started."
```

## 9. Next Steps

When implementing with Claude Code:

1. Start with the core modules: database.py, scanner.py, and qr_generator.py
2. Implement the CLI interface
3. Build the web interface
4. Add tests
5. Set up Docker and CI/CD

Claude Code can fill in the implementation details for each component while ensuring that the overall structure follows the provided workflow guidelines.
