# VaultKeeper

VaultKeeper is a comprehensive system for cataloging, organizing, and tracking media storage drives with an emphasis on data integrity and physical organization.

## Features

- **Drive Cataloging**: Scan and inventory entire drives, tracking all files and metadata
- **Media Asset Database**: Searchable database of all files with detailed metadata
- **Video Thumbnails**: Generate thumbnails from video files (supports MP4, MOV, MXF, R3D)
- **QR Code Labels**: Create and print custom QR code labels for drives using NIIMBOT printers
- **Drive Health Monitoring**: Comprehensive tests for drives that have been in storage
- **Location Management**: Track physical shelf locations and drive check-out/check-in
- **Native Interface**: CLI-focused design with optional GTK GUI for browsing

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
  - Optional: RED SDK (for R3D file support)

## Quick Start

```bash
# Install VaultKeeper
./scripts/install.sh

# Catalog a drive
vaultkeeper catalog /media/external/drive1

# Search for files
vaultkeeper search "interview 2023"

# Generate drive labels
vaultkeeper label generate drive 51fc9a3d

# Check drive health
vaultkeeper health quick /dev/sdb
```

## Documentation

See the [docs](docs/) directory for detailed documentation:

- [User Guide](docs/user-guide.md)
- [CLI Reference](docs/cli-reference.md)
- [Drive Health Checking](docs/drive-health.md)
- [Hardware Setup](docs/hardware-setup.md)

## License

This project is licensed under the MIT License - see the LICENSE file for details.