# Media Asset Tracking System - Setup Instructions

This document provides instructions for setting up and using your new media asset tracking system. This system allows you to catalog all your backup drives, generate QR code labels, and build a searchable database of all your media files.

## Overview

The system consists of:

1. **CLI Tool**: Command-line interface for cataloging drives and managing metadata
2. **Web Interface**: Browser-based interface for searching and exploring your media
3. **QR Code Labels**: Physical tracking of drives with your NIIMBOT label printer

## System Requirements

- Python 3.6+ (recommended: Python 3.10+)
- SQLite database (included with Python)
- Required Python packages:
  - Flask (web interface)
  - qrcode (QR code generation)
  - Pillow (image processing)
- Optional: ffmpeg/ffprobe (for extracting media metadata)

## Installation

### 1. Set Up the Environment

```bash
# Create a directory for the media asset tracker
mkdir -p ~/media-asset-tracker
cd ~/media-asset-tracker

# Create a Python virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# Or on Windows: venv\Scripts\activate

# Install required packages
pip install flask qrcode pillow
```

### 2. Save the Scripts

1. Save the CLI tool script as `~/media-asset-tracker/media-asset-tracker.py`
2. Save the web interface script as `~/media-asset-tracker/web-interface.py`
3. Make them executable:

```bash
chmod +x ~/media-asset-tracker/media-asset-tracker.py
chmod +x ~/media-asset-tracker/web-interface.py
```

4. Create symlinks for easier access:

```bash
# On macOS/Linux
sudo ln -s ~/media-asset-tracker/media-asset-tracker.py /usr/local/bin/media-asset-tracker
sudo ln -s ~/media-asset-tracker/web-interface.py /usr/local/bin/media-asset-web

# On Windows, create batch files or add to your PATH
```

### 3. Initialize the Database

```bash
# Initialize the database
media-asset-tracker init
```

## Usage

### 1. Cataloging a Drive

When you insert a drive into your SATA dock, you can catalog it with:

```bash
# Basic cataloging
media-asset-tracker catalog /path/to/mounted/drive

# Catalog with a custom label
media-asset-tracker catalog /path/to/mounted/drive -l "Client_ProjectName_2023"
```

This will:
- Scan all files on the drive
- Record metadata like filename, path, size, and dates
- Extract additional metadata for media files (if ffprobe is installed)
- Generate a QR code for the drive that you can print

### 2. Generating QR Codes for Printing

After cataloging a drive, a QR code image will be automatically generated at:
`~/media-asset-tracker/qr-codes/YourDriveLabel.png`

To print with your NIIMBOT label printer:
1. Transfer the QR code image to your phone or device connected to the printer
2. Open the NIIMBOT app and import the image
3. Print on a label and affix to the drive

The QR code contains:
- Drive ID in the system
- Volume name
- Size information
- Date cataloged

### 3. Creating Projects

You can organize files into projects:

```bash
# Create a new project
media-asset-tracker project "Client X - Commercial 2023" -c "Client X" -n "TV commercial project shot in April 2023"

# Add files to a project
media-asset-tracker add-files PROJECT_ID -p "commercial_final"
```

### 4. Searching for Files

Find files using the command line:

```bash
# Basic search
media-asset-tracker search "interview"

# Search by file extension
media-asset-tracker search "mov" -t extension

# Search by project
media-asset-tracker search "Client X" -t project
```

### 5. Using the Web Interface

Start the web interface with:

```bash
media-asset-web
```

Then open your browser to http://localhost:5000

The web interface provides:
- Dashboard with system statistics
- Searchable database of all files
- Browsable list of drives and projects
- Detailed file information
- Project management

### 6. Finding a File for a Client

When a client needs a file from an old project:

1. **Web Interface**: Search for the file by name, project, or content type
2. **Command Line**: Run a search command to find the file
3. **Locate Drive**: The system will tell you which drive contains the file 
4. **QR Scan**: Use your phone to scan the QR code on the drive for confirmation
5. **Connect Drive**: Insert the correct drive into your dock and access the file

## Recommended Workflow

1. **Label drives consistently**: Use a format like "ClientName_ProjectType_Date"
2. **Catalog immediately**: When archiving a project, catalog the drive right away
3. **Organize by project**: Create project entries for all major client work
4. **Use the web interface**: For everyday searching and browsing
5. **Run periodic verifications**: Re-scan drives occasionally to verify integrity

## Tips for Your Setup

Based on your hardware:

- **Run on Ubuntu**: For your 4090 rig or M1 Mac, the Ubuntu machine might be best
- **Network access**: Configure to be accessible on your 10gbE network
- **Automount drives**: Set up your system to automount drives when inserted
- **Video-specific metadata**: The system extracts video metadata from RED files and other formats

## Expanding the System

Future enhancements you could consider:

1. **Content-based search**: Add AI-powered image/video tagging
2. **Preview generation**: Create thumbnails for visual browsing
3. **Automated backup verification**: Periodically check drive integrity
4. **Integration with LTO**: If you decide to use LTO tapes again in the future
