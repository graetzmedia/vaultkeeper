# VaultKeeper

VaultKeeper is a comprehensive system for cataloging, organizing, and tracking media storage drives with an emphasis on data integrity and physical organization.

## Features

- **Drive Cataloging**: Scan and inventory entire drives, tracking all files and metadata
- **Media Asset Database**: Searchable database of all files with detailed metadata
- **Video Thumbnails**: Generate thumbnails from video files (supports MP4, MOV, MXF, R3D)
- **QR Code Labels**: Create and print custom QR code labels for drives using NIIMBOT printers
- **Drive Health Monitoring**: Comprehensive tests for drives that have been in storage
- **Location Management**: Track physical shelf locations and drive check-out/check-in
- **Batch Processing**: Catalog and health-check multiple drives in sequence
- **Interactive CLI Menu**: User-friendly text-based menu interface

## Hardware Support

- **Storage**: Compatible with the Orico 5-bay SATA dock and standard USB drives
- **Printing**: Support for NIIMBOT B1 (20-50mm) and D101 (10-25mm) label printers
- **Scanning**: Integration with Eyoyo 2D/1D wireless barcode/QR scanner

## Requirements

- **Operating System**: Ubuntu/Linux
- **Dependencies**:
  - Python 3.8+
  - SQLite 3
  - ffmpeg (for video thumbnail generation)
  - smartmontools, hdparm, bc (for drive health checking)
  - Optional: RED SDK (for R3D file support)
  - qrcode, PIL (Python libraries)

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
# Initialize the database
./vaultkeeper-menu.sh
# Select option 1) Initialize Database

# Start the interactive menu
./vaultkeeper-menu.sh

# Catalog and check all mounted drives
# Select option 10) Full Process: Catalog + Health Check All Drives
```

## Using the Menu Interface

VaultKeeper provides an interactive menu interface with the following options:

1. **Initialize Database**: First-time setup
2. **Catalog a Drive**: Scan a single drive
3. **Batch Catalog All Mounted Drives**: Process all connected drives
4. **List All Drives**: Show all cataloged drives
5. **Search Files**: Find files in the database
6. **Create New Project**: Organize files into projects
7. **Add Files to Project**: Associate files with projects
8. **Generate QR Code for Drive**: Create printable drive labels
9. **Run Shelf Drive Health Check**: Test drive health
10. **Full Process: Catalog + Health Check All Drives**: Complete workflow
11. **Exit**: Quit the program

## Drive Health Checking

The health check functionality is designed specifically for drives that have been sitting on shelves for extended periods. It tests for:

- Spin-up time and stiction issues
- Rotational stability
- Surface issues across the entire drive
- Random read testing for bad sectors
- Multiple spin-up cycles
- Sustained performance testing
- Temperature monitoring

## Documentation

See the [docs](docs/) directory for detailed documentation:

- [System Overview](docs/system-overview.md)
- [Old Implementation Plans](docs/old/)

## License

This project is licensed under the MIT License - see the LICENSE file for details.