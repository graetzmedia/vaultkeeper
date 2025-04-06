# VaultKeeper

VaultKeeper is a comprehensive system for cataloging, organizing, and tracking media storage drives with an emphasis on data integrity and physical organization.

## Features

- **Drive Cataloging**: Scan and inventory entire drives, tracking all files and metadata
- **Media Asset Database**: Searchable database of all files with detailed metadata
- **Video Thumbnails**: Generate thumbnails from video files (supports MP4, MOV, MXF, R3D)
- **Audio Transcription**: Automatically transcribe audio tracks from video files using Whisper AI
- **QR Code Labels**: Create and print custom QR code labels for drives using NIIMBOT printers
- **Drive Health Monitoring**: Comprehensive tests for drives that have been in storage
- **Location Management**: Track physical shelf locations and drive check-out/check-in
- **Batch Processing**: Catalog and health-check multiple drives in sequence
- **Interactive CLI Menu**: User-friendly text-based menu interface
- **Web-based GUI**: Search, browse thumbnails, and manage media assets through a web interface
- **Transcription Search**: Find files by spoken content in audio tracks
- **Client Management**: Assign drives, folders, or individual files to clients
- **Flexible Storage Organization**: Place drives anywhere with QR-based tracking and location IDs
- **NIIMBOT D101/B1 Support**: Direct or manual printing to NIIMBOT thermal label printers
- **Location/Shelf QR Codes**: Generate location labels with matching QR codes

## Hardware Support

- **Storage**: Compatible with the Orico 5-bay SATA dock and standard USB drives
- **Printing**: Support for NIIMBOT B1 (20-50mm) and D101 (10-25mm) label printers
- **Scanning**: Integration with Eyoyo 2D/1D wireless barcode/QR scanner

## Requirements

- **Operating System**: Ubuntu/Linux
- **Dependencies**:
  - Python 3.8+
  - SQLite 3
  - ffmpeg (for video thumbnail generation and audio extraction)
  - smartmontools, hdparm, bc (for drive health checking)
  - Optional: RED SDK (for R3D file support)
  - Python libraries:
    - openai-whisper (for audio transcription)
    - qrcode, PIL (for QR code generation)
    - torch (installed with whisper)

## Project Structure

```
vaultkeeper/
├── docs/                # Documentation
│   ├── system-overview.md  # System architecture and overview
│   └── old/             # Archive of planning documents
├── R3DSDKv8_6_0/        # RED SDK for R3D file support
├── scripts/             # Installation and utility scripts
│   ├── utils/           # Core utility scripts
│   │   ├── asset-tracker.py   # Main cataloging engine
│   │   └── web-interface.py   # Optional web UI
│   ├── vaultkeeper-setup.sh   # Setup script
│   ├── scan-drive.js    # Drive scanning implementation
│   └── shelf-drive-check.sh   # Drive health check tool
├── vaultkeeper-menu.sh  # Interactive menu interface
└── vaultkeeper.sh       # CLI command wrapper
```

## Quick Start

```bash
# Create a Python virtual environment (first time setup)
python -m venv .venv
source .venv/bin/activate
pip install openai-whisper qrcode pillow flask flask-cors

# Or just run the menu script which will check and activate the venv
./vaultkeeper-menu.sh

# Initialize the database
# Select option 1) Initialize Database

# Catalog and check all mounted drives
# Select option 10) Full Process: Catalog + Health Check All Drives

# Process transcriptions of audio/video files
# Select option 11) Process Transcriptions

# Start the web interface (optional)
# Run the Flask server from the project root
python web/server.py
# Then open http://localhost:5000 in your browser
# See README-GUI.md for detailed web interface documentation
```

## Using the Menu Interface

VaultKeeper provides an interactive menu interface with the following options:

1. **Initialize Database**: First-time setup
2. **Catalog a Drive**: Scan a single drive (with option for transcription)
3. **Batch Catalog All Mounted Drives**: Process all connected drives
4. **List All Drives**: Show all cataloged drives
5. **Search Files**: Find files in the database
6. **Search Transcriptions**: Find files by spoken content
7. **Create New Project**: Organize files into projects
8. **Add Files to Project**: Associate files with projects
9. **Generate QR Code for Drive**: Create printable drive labels
10. **Run Shelf Drive Health Check**: Test drive health
11. **Process Transcriptions**: Transcribe audio from pending media files
12. **Full Process: Catalog + Health Check All Drives**: Complete workflow
13. **Clean Up Duplicate Drive Entries**: Fix duplicate database entries
14. **View Transcription for File**: Display full transcript with timestamps
15. **Exit**: Quit the program

> Note: The menu options may be updated in newer versions. Always refer to the numbered options shown in the interactive menu.

## Drive Health Checking

The health check functionality is designed specifically for drives that have been sitting on shelves for extended periods. It tests for:

- Spin-up time and stiction issues
- Rotational stability
- Surface issues across the entire drive
- Random read testing for bad sectors
- Multiple spin-up cycles
- Sustained performance testing
- Temperature monitoring

## Audio Transcription

VaultKeeper includes built-in audio transcription using OpenAI's Whisper:

- Automatic detection and marking of audio/video files for transcription during cataloging
- Process transcriptions in the background with configurable worker count
- Support for different Whisper model sizes (tiny, base, small, medium, large)
- Specialized handling for separate WAV files commonly found with RED camera footage
- Full transcription text indexing for content search
- Display of transcript snippets in search results with highlighted search terms
- Transcription metadata including language detection and timestamp segments
- CPU fallback for systems without compatible CUDA GPU

### Using the CLI for Transcription

```bash
# Method 1: Using the menu interface (recommended)
./vaultkeeper-menu.sh
# Then select options for cataloging, processing or searching transcriptions

# Method 2: Using the direct CLI commands
# Catalog a drive and transcribe audio/video files immediately
./vaultkeeper.sh catalog /path/to/drive -t

# Process pending transcriptions later
./vaultkeeper.sh transcribe -w 2 -m base

# Search for content within transcriptions
./vaultkeeper.sh search "specific phrase" -t transcription

# View complete transcription for a file
./vaultkeeper.sh show-transcription FILE_ID
```

## Documentation

See the [docs](docs/) directory for detailed documentation:

- [System Overview](docs/system-overview.md)
- [Physical Storage System](docs/location-system/shelf-organization.md)
- [NIIMBOT Printer Guide](docs/location-system/niimbot-instructions.md)
- [Old Implementation Plans](docs/old/)

## License

This project is licensed under the MIT License - see the LICENSE file for details.