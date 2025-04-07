# VaultKeeper Physical Storage System

This document outlines the physical organization and labeling system for the VaultKeeper media asset tracking system, focused on creating a flexible but trackable storage system.

## Location Identification System

### Bay-Shelf-Position Format

VaultKeeper uses a consistent `Bay-Shelf-Position` format for all physical locations:

```
B{bay}-S{shelf}-P{position}
```

Example: `B2-S3-P5` refers to Bay 2, Shelf 3, Position 5

### Components

1. **Bay**: A physical storage unit or rack (numbered sequentially)
2. **Shelf**: A horizontal level within a bay (numbered top-to-bottom)
3. **Position**: A specific spot on a shelf (numbered left-to-right)

## Flexible Organization Strategy

The VaultKeeper system supports a flexible organization approach where drives can be placed anywhere within the physical storage system. This approach has several advantages:

### Benefits of Flexible Storage

1. **QR-Driven Organization**: The system relies on QR codes rather than fixed physical arrangements
2. **Database-Backed Tracking**: Every drive's location is stored in the database for easy lookup
3. **Efficient Space Usage**: Drives can be placed where they physically fit best
4. **Adaptable to Changing Needs**: No need to reorganize existing drives when adding new ones

### Semi-Structured Approach (Optional)

While fully flexible organization is supported, you may wish to implement some structure:

1. **Client/Project Grouping**: Dedicate specific bays or shelves to particular clients/projects
2. **Chronological Organization**: Arrange drives by date within a project section
3. **Reserve Spaces**: Keep empty slots near related drives for future expansion

## Physical Setup Instructions

### Bay Setup

1. Assign each storage unit (shelving unit, rack, cabinet) a unique bay number
2. Label each bay clearly with a large, visible number
3. Consider using color-coded labels for different clients or projects

### Shelf Numbering

1. Number shelves from top to bottom within each bay
2. Ensure shelves are evenly spaced to accommodate your typical drive storage cases
3. Add small labels to each shelf with the bay and shelf numbers

### Position Markings

1. Mark positions from left to right on each shelf
2. Position spacing should match your drive case dimensions
3. Consider using small adhesive markers or engraved lines to indicate positions

## QR Code System

### Drive QR Codes

Each drive has a unique QR code containing:

- Drive ID
- Serial number or UUID
- Drive name
- Registration date

### Location QR Codes

Each location (or shelf section) has a QR code containing:

- Location ID (Bay-Shelf-Position format)
- Status (Empty/Reserved/Occupied)
- Section or area name (if applicable)

### QR Code Usage

1. **Scanning Drive QR**: Shows drive details, contents, and current location
2. **Scanning Location QR**: Shows what drive is stored there (if any) and location details
3. **Check-in/Check-out**: Scan both drive and location QRs when moving drives

## Label Printing with NIIMBOT

The system generates two types of labels for NIIMBOT D101 thermal printers:

### Drive Labels (20mm × 70mm)

Each drive label includes:
- QR code (left side)
- Root folder names (largest text) - Displays the top-level client/project folders
- Drive name (medium text) 
- Drive ID (smaller text)
- Media type statistics - Count of each file type (R3D, ProRes, RAW, etc.)
- Registration date

Drive label template:
```
|---------------------------------------------------------------------------|
|  +-------+                                                                |
|  |       |   CLIENT A - PROJECT X                                         |
|  |  QR   |   CLIENT B - COMMERCIAL                                        |
|  | CODE  |   CLIENT C - DOCUMENTARY                                       |
|  |       |                                                                |
|  |       |   DRIVE NAME                                                   |
|  +-------+   ID: DRIVE-001                                                |
|              R3D Video: 145  ProRes: 53                                   |
|              RAW Photos: 1289  Audio: 76                                  |
|                                                                           |
|              Added: 04/07/2025                                            |
|---------------------------------------------------------------------------|
```

### Location Labels (20mm × 50mm)

Each location label includes:
- QR code (left side)
- Location ID (Bay-Shelf-Position) in large text
- Status (Empty/Occupied/Reserved)
- Optional section or client name

Location label template:
```
|------------------------------------------------------|
|  +-------+                                           |
|  |       |                                           |
|  |  QR   |   B2-S3-P5                                |
|  | CODE  |   Status: EMPTY                           |
|  |       |                                           |
|  +-------+                                           |
|------------------------------------------------------|
```

## Implementation Tips

1. **Start with Full Scanning**: When implementing, scan and register every drive and location
2. **Regular Audits**: Periodically scan all drives to verify locations
3. **Reservation System**: Use the "Reserved" status to hold spots for temporarily removed drives
4. **Consistent Labeling**: Ensure all new drives receive QR labels before storage
5. **Backup Plans**: Print and store a digital backup of all QR codes

## Workflows

### Adding a New Drive

1. Register drive in VaultKeeper system
2. Print QR label using NIIMBOT printer
3. Attach label to drive case
4. Scan an empty location where you'll store it
5. Place drive in location
6. System automatically updates drive's location in database

### Retrieving a Drive

1. Search system for drive by name, project, or content
2. System shows drive's location (Bay-Shelf-Position)
3. Retrieve drive from location
4. Scan drive and mark as "checked out" (optional)
5. Location is marked "Reserved" to hold the spot

### Returning a Drive

1. Take drive to its reserved spot (or any available spot)
2. Scan location QR code
3. Scan drive QR code
4. System updates drive's location in database
5. Place drive in the location

## Label Generation Tools

VaultKeeper provides several tools for working with the physical location system:

### Command-Line Tools

1. **Generate Test Labels** - Creates sample labels for testing
   ```
   node scripts/generate-test-labels.js
   ```

2. **Create Shelf Locations** - Batch creates locations and labels for a bay/shelf
   ```
   node scripts/create-shelf-locations.js
   ```
   This interactive script lets you create multiple shelf positions at once.

3. **Assign Drive Location** - Places a drive at a specific shelf location
   ```
   node scripts/assign-drive-location.js
   ```
   This interactive script lets you assign a drive to a location and generates labels for both.

### API Endpoints

The system also provides API endpoints for label management:

1. **Generate Drive Label**: `POST /api/drives/{id}/print-label`
   - Generates a label for a drive
   - Optionally prints directly to a NIIMBOT printer if available

2. **Assign Drive to Location**: `POST /api/drives/{id}/assign-location`
   - Assigns a drive to a specific bay-shelf-position
   - Creates the location if it doesn't exist
   - Generates labels for both the drive and location

3. **Manage Locations**: `GET/POST /api/locations`
   - Create, update, and query physical locations
   - Generate labels for locations

## Printing Options

The system supports three methods for printing labels:

1. **Direct Printing**: When a compatible NIIMBOT printer is connected directly to the server, the system can print labels automatically.

2. **PNG Export**: All labels are saved as PNG files in the `public/labels` directory, which can be transferred to a mobile device and printed using the NIIMBOT mobile app.

3. **CSV/Excel Export**: Generate CSV files that can be imported directly into the NIIMBOT app, which handles the formatting and layout for optimal printing quality:
   ```
   node scripts/generate-label-spreadsheets.js
   ```
   This interactive script allows you to:
   - Generate drive labels, location labels, or both
   - Use real data from the database or test data
   - Create labels for a range of shelf locations
   - Include QR codes, drive contents, and metadata

   The generated CSV files can be transferred to your mobile device and imported directly into the NIIMBOT app's label creation interface.

By following this system, you'll maintain full tracking capabilities while allowing for flexible physical organization that can adapt to your changing storage needs.