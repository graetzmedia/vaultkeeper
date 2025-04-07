# R3D Thumbnail Processing in VaultKeeper

This document explains how VaultKeeper handles RED R3D video files for thumbnail generation.

## Overview

VaultKeeper includes specialized support for generating thumbnails from RED R3D video files, which are used by RED digital cinema cameras. This document outlines the methods used to extract thumbnails and how to process R3D files that have already been cataloged.

## Implementation Details

### 1. R3D File Detection

The system identifies R3D files using two methods:
- File extension check (.r3d)
- Special handling for RDC folder structures (RED's typical organization)

### 2. Thumbnail Generation Methods

VaultKeeper employs a multi-tiered approach for generating thumbnails from R3D files:

#### Primary Method: REDline

We use RED's official command-line tool (REDline) to extract a single frame from the middle of the clip:

```
REDline --i <r3d_file> --format 3 --start 50% --frameCount 1 --resizeX 640 --resizeY 480 --o <output_file>
```

Key parameters:
- `--format 3`: Specifies JPEG output format
- `--start 50%`: Selects the middle of the clip 
- `--frameCount 1`: Extracts only one frame
- `--resizeX/Y`: Resizes to 640x480 (default thumbnail dimensions)

#### Fallback Methods: ffmpeg

If REDline fails, the system falls back to ffmpeg with special parameters for R3D compatibility:

```
ffmpeg -y -vsync 0 -probesize 100M -analyzeduration 100M -i <r3d_file> -vframes 1 -q:v 2 -vf "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2" <output_file>
```

Additional fallback methods include:
- Using ffmpeg with the redcode1_codec option
- Using a simpler ffmpeg command

## Processing Tools

### 1. Integrated Cataloging

During normal drive cataloging, R3D thumbnails are automatically generated and stored in the database.

### 2. Post-Processing Tools

For drives that have already been cataloged, we provide special tools to generate thumbnails:

#### `redline_single_frame.py`

This utility processes already-cataloged R3D files that don't have thumbnails yet:

```bash
./redline_single_frame.py --drive <drive_name_or_id>
```

Key features:
- Finds R3D files in the database without thumbnails
- Extracts a single frame from the middle of each clip
- Updates the database with thumbnail paths
- Monitors REDline's output to capture the first successful frame

Options:
- `--drive`: Filter by drive name or ID
- `--frame`: Specify a frame number (defaults to middle frame)
- `--width/--height`: Set thumbnail dimensions (default: 640x480)
- `--limit`: Process only a specific number of files
- `--timeout`: Set maximum processing time per clip in seconds

### 3. Usage in VaultKeeper Menu System

The REDline-based thumbnail generation is automatically integrated into the main VaultKeeper system. When cataloging drives through the menu system (`vaultkeeper-menu.sh`), R3D thumbnail generation will be performed using the methods described above.

For existing drives that were cataloged before this feature was implemented, use the standalone utility:

```bash
./redline_single_frame.py --drive <drive_name_or_id>
```

## Special Considerations

1. **RDC Folder Structure**: For R3D files in an RDC folder structure, thumbnails are generated per-clip rather than per-file to avoid duplicates:
   - The system detects RDC folders (RED Digital Cinema's standard folder structure)
   - It identifies clip prefixes (e.g., A001_C001) in filenames
   - Only one representative file (typically a middle frame) is processed for each unique RDC+clip combination
   - The same thumbnail is applied to all files in the same clip/RDC group
   - This avoids generating unnecessary thumbnails for "chunked" recordings split across multiple files

2. **Large Files**: Files over 1GB may be skipped by default to avoid excessive processing time.

3. **Timeouts**: REDline processing can be slow, especially on the first run when compiling OpenCL kernels. We implement timeouts to prevent indefinite hanging.

4. **Metadata**: The system doesn't currently extract comprehensive metadata from R3D files.

5. **Batch Processing**: When multiple files belong to the same RDC folder group, database updates are handled in batches to improve performance and avoid query parameter limits.

## Installation Requirements

To use the R3D thumbnail generation features:

1. Install the REDline command-line tool from RED:
   - Download the REDline installer (e.g., REDline_Build_60.52530_Installer.sh)
   - Make it executable: `chmod +x REDline_Build_60.52530_Installer.sh`
   - Run the installer: `./REDline_Build_60.52530_Installer.sh`

2. REDline will be installed to `/usr/local/bin/REDline` by default

## Future Improvements

1. Extract and store more comprehensive R3D metadata
2. Implement GPU acceleration when available
3. Add support for HDR thumbnails
4. Improve error handling and reporting