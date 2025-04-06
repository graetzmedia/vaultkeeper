# VaultKeeper System Overview

VaultKeeper is a sophisticated media asset tracking solution designed for video production facilities to manage archived content. This document provides an overview of the system's architecture, components, and workflows.

## System Purpose

Video production generates massive amounts of valuable assets that often get archived to offline storage media like hard drives, SSDs, or tape. Once archived, these assets can become difficult to track, locate, and utilize in future productions. VaultKeeper solves this by:

1. Tracking detailed metadata about each media asset
2. Managing the physical storage drives where assets are archived
3. Creating a searchable index of all archived content
4. Providing QR-code based physical tracking of drives
5. Facilitating restoration of archived content when needed

## System Components

VaultKeeper consists of four primary modules:

### 1. Media Asset Management

The core of the system, managing information about individual media files:

- **Comprehensive Metadata**: Track file details, technical specs, and production information
- **Project Association**: Link assets to specific productions and clients
- **Preview Generation**: View thumbnails or low-res proxies without accessing the physical drive
- **Content Categorization**: Organize assets with tags, ratings, and categories
- **Audio Transcription**: Automatically transcribe speech in video and audio files for searchable content

### 2. Storage Drive Tracking

Manages physical storage media:

- **Drive Inventory**: Track all storage drives with detailed specifications
- **QR Code Labels**: Generate and print labels for physical drives using NIIMBOT printer
- **Space Utilization**: Monitor capacity, usage, and efficiency of storage media
- **Location Management**: Track exactly where each drive is physically stored
- **Drive Health**: Monitor drive status, issues, and maintenance needs

### 3. Project Management

Organizes assets by production:

- **Project Tracking**: Associate assets with specific productions
- **Client Management**: Track client information and project details
- **Archive Planning**: Create structured archive plans for each project
- **Retention Policies**: Manage how long different types of content should be retained

### 4. Archive Workflow

Handles the process of archiving and retrieving content:

- **Archive Jobs**: Create, track, and manage archive operations
- **Verification**: Ensure archived content is properly transferred and verified
- **Restoration Workflows**: Streamlined process for finding and restoring archived content
- **Chain of Custody**: Track who checks out and returns physical media

## Technical Architecture

VaultKeeper is built on a flexible architecture:

### Backend
- **Python Core**: Robust core utilities for media processing and database operations
- **SQLite**: Lightweight, embedded database for excellent performance and portability
- **Flask API**: Optional web server for accessing the database via a RESTful API
- **Media Processing**: ffmpeg-based metadata extraction and preview generation
- **Audio Transcription**: Whisper AI integration for speech-to-text conversion

### Frontend
- **CLI Interface**: Feature-rich command-line interface for direct system access
- **Web GUI**: Browser-based responsive interface for searching and managing assets
- **Thumbnail Browser**: Visual tools for browsing media assets and previews
- **Responsive Design**: Works on desktop and mobile devices through the web interface
- **Client Management**: Assign drives, folders, and files to specific clients
- **Project Organization**: Group files by project with customizable metadata
- **Dynamic UI Updates**: Automatic refreshing after client and project changes
- **Inline Client Creation**: Add new clients directly from any assignment dropdown

### Hardware Integration
- **NIIMBOT Printer**: Bluetooth label printer for QR codes
- **QR Scanner**: For rapid drive identification and lookups

## Key Workflows

### 1. Archive Process

1. Create an Archive Job for a completed project
2. Select which assets to archive
3. Assign to specific storage drives
4. Generate QR codes and print labels for drives
5. Execute the archive process with verification
6. Store the drives in designated locations
7. The system maintains a searchable index of all content

### 2. Storage Management

1. Add new drives to the system with specifications
2. Assign drives to projects or content categories
3. Track drive locations and movement
4. Monitor drive usage, health, and performance
5. Plan capacity needs based on usage trends

### 3. Content Retrieval

1. Search for specific assets by metadata, project, or spoken content (via transcription)
2. Use the web interface to browse assets visually through thumbnails
3. View thumbnails or proxies to confirm the right content
4. Review audio transcriptions to find relevant dialogue or interview segments
5. Assign drives, folders, or individual files to clients or projects
6. View folder-level organization within drives to better locate content
7. Locate the physical drive using location information
8. Check out the drive if needed or restore directly
9. Return and check in drives after use

### 4. Retention Management

1. Set retention policies for different content types
2. Receive notifications when content is approaching retention limits
3. Review content for deletion or extended retention
4. Document disposition decisions for compliance

## System Benefits

- **Time Savings**: Quickly locate any archived asset without hunting through drives
- **Content Discovery**: Find footage by searching transcribed speech content
- **Error Prevention**: Avoid loss of valuable media assets due to poor documentation
- **Space Optimization**: Maximize efficient use of storage media
- **Better Decision Making**: Make informed decisions about archive strategies
- **Resource Planning**: Plan storage needs based on accurate usage data
- **Standardization**: Consistent archiving procedures across projects and team members
- **Interview Indexing**: Instantly find specific moments in interview footage using speech search

## Integration Points

VaultKeeper can integrate with:

- **Editorial Systems**: Connect with post-production workflows (Final Cut, Premiere, Avid)
- **MAM Systems**: Exchange data with Media Asset Management systems for active content
- **Storage Systems**: Interact with NAS, SAN, or cloud storage solutions
- **Project Management**: Link with production tracking tools