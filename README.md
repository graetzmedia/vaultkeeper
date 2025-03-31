# VaultKeeper

## Overview
VaultKeeper is a comprehensive media asset tracking solution designed for video production archives. It helps media professionals track, catalog, and manage production files once they're archived off active servers and production drives.

## Purpose
When video production projects are completed, valuable media assets often get archived to offline storage, making them difficult to locate and access later. VaultKeeper solves this problem by providing a complete system for cataloging, tracking, and quickly retrieving archived media assets.

## Key Features

### Media Asset Cataloging
- **Comprehensive Metadata**: Track detailed information about each media asset
- **Content Tagging**: Organize assets with customizable tags and categories
- **Project Association**: Link assets to specific productions and clients
- **Automated Scanning**: Extract metadata from media files when possible

### Storage Tracking
- **Drive Management**: Track which assets are stored on which physical drives
- **Location Tracking**: Know exactly where each physical drive is stored
- **QR Code System**: Generate and print QR codes for drives with NIIMBOT printer
- **Quick Scanning**: Find any drive or asset instantly with a quick scan

### Archive Management
- **Archive Planning**: Create structured archive plans for projects
- **Retrieval System**: Simplified process for finding and restoring archived content
- **Chain of Custody**: Track who checks out and returns physical media
- **Storage Statistics**: Monitor capacity and usage across all storage media

### Search and Retrieval
- **Advanced Search**: Find assets based on any combination of metadata
- **Preview Generation**: View thumbnails or proxies of archived content
- **Export Functionality**: Generate reports of archived assets by project or drive
- **Batch Operations**: Perform actions on multiple assets simultaneously

## Technical Architecture

### Backend
- Node.js/Express API
- MongoDB database
- Media processing modules for metadata extraction

### Frontend
- React with Material UI components
- Mobile-responsive design for warehouse/storage use

## Documentation

Detailed documentation is available in the docs directory:
- [System Overview](docs/system-overview.md) (Coming soon)
- [Implementation Guide](docs/implementation-guide.md) (Coming soon)

## Setup

### Prerequisites
- Node.js (v14+)
- MongoDB
- NIIMBOT label printer (optional, for QR codes)

### Installation
1. Clone this repository
2. Install dependencies with `npm install` 
3. Configure MongoDB connection in `config.js`
4. Start the server with `npm start`
5. The application will be available at http://localhost:5001

## License
All rights reserved.