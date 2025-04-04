#!/usr/bin/env node

/**
 * VaultKeeper Drive Scanner CLI
 * 
 * A command-line tool for scanning drives and cataloging media assets.
 * This tool can register drives, scan their contents, and store metadata
 * in the MongoDB database.
 * 
 * Usage:
 *   node scan-drive.js register /path/to/drive
 *   node scan-drive.js scan drive-id
 *   node scan-drive.js list
 *   node scan-drive.js info drive-id
 */

const mongoose = require('mongoose');
const { program } = require('commander');
const { 
  registerDrive, 
  scanDrive, 
  searchAssets,
  generateAssetReport 
} = require('../src/backend/controllers/drive-controller');
const { getDriveInformation } = require('./util-functions');

// Configure commander
program
  .version('1.0.0')
  .description('VaultKeeper Drive Scanner - A tool for cataloging media drives');

// Configure database connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/vaultkeeper', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// Register a new drive
program
  .command('register <drivePath>')
  .description('Register a new drive in the system')
  .option('-n, --name <name>', 'Drive name')
  .option('-d, --description <description>', 'Drive description')
  .option('-l, --location <location>', 'Physical location of the drive')
  .option('-p, --project <projectId>', 'Associate with a project')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action(async (drivePath, options) => {
    try {
      await connectDB();
      
      console.log(`Registering drive at path: ${drivePath}`);
      
      // Get drive information
      const driveInfo = await getDriveInformation(drivePath);
      console.log('Detected drive information:', driveInfo);
      
      // Prepare drive data
      const driveData = {
        path: drivePath,
        ...driveInfo,
        name: options.name,
        description: options.description,
        location: options.location,
        project: options.project,
        tags: options.tags ? options.tags.split(',') : []
      };
      
      // Register the drive
      const result = await registerDrive(driveData);
      
      if (result.success) {
        console.log('Drive registered successfully!');
        console.log('Drive ID:', result.drive.driveId);
        console.log('Name:', result.drive.name);
        console.log('QR Code:', result.drive.qrCode ? 'Generated' : 'Not generated');
      } else {
        console.error('Failed to register drive:', result.message);
      }
      
      process.exit(0);
    } catch (error) {
      console.error('Error registering drive:', error);
      process.exit(1);
    }
  });

// Scan a drive
program
  .command('scan <driveId>')
  .description('Scan a drive and catalog its contents')
  .option('-i, --include <types>', 'Only include these types (comma-separated)')
  .option('-e, --exclude <types>', 'Exclude these types (comma-separated)')
  .option('-t, --thumbnails', 'Generate thumbnails for media files', true)
  .option('-d, --thumbnail-dir <dir>', 'Directory to store thumbnails')
  .option('--health-check', 'Perform disk health check', true)
  .action(async (driveId, options) => {
    try {
      await connectDB();
      
      console.log(`Scanning drive with ID: ${driveId}`);
      
      // Prepare scan options
      const scanOptions = {};
      
      if (options.include) {
        scanOptions.includeTypes = options.include.split(',');
      }
      
      if (options.exclude) {
        scanOptions.excludeTypes = options.exclude.split(',');
      }
      
      // Configure thumbnail generation
      scanOptions.generateThumbnails = options.thumbnails !== false;
      
      if (options.thumbnailDir) {
        scanOptions.thumbnailsDir = options.thumbnailDir;
      }
      
      // Configure health check
      if (options.healthCheck === false) {
        console.log('Disk health check disabled');
      }
      
      // Scan the drive
      const result = await scanDrive(driveId, scanOptions);
      
      if (result.success) {
        console.log('Drive scan completed successfully!');
        console.log('Drive:', result.drive.name);
        console.log('Summary:');
        console.log(`- Total files: ${result.summary.totalFiles}`);
        console.log(`- Total size: ${formatSize(result.summary.totalSize)}`);
        console.log('File types:');
        
        result.summary.fileTypes.forEach(type => {
          console.log(`- ${type.type}: ${type.count} files (${formatSize(type.size)})`);
        });
        
        console.log('Asset results:');
        console.log(`- Created: ${result.assetResults.created}`);
        console.log(`- Updated: ${result.assetResults.updated}`);
        console.log(`- Failed: ${result.assetResults.failed}`);
      } else {
        console.error('Failed to scan drive:', result.message);
      }
      
      process.exit(0);
    } catch (error) {
      console.error('Error scanning drive:', error);
      process.exit(1);
    }
  });

// List all drives
program
  .command('list')
  .description('List all registered drives')
  .action(async () => {
    try {
      await connectDB();
      
      const StorageDrive = require('../src/backend/models/storageDrive');
      const drives = await StorageDrive.find().sort({ name: 1 });
      
      console.log(`Found ${drives.length} registered drives:`);
      
      drives.forEach(drive => {
        console.log(`- [${drive.driveId}] ${drive.name}`);
        console.log(`  Path: ${drive.path}`);
        console.log(`  Status: ${drive.status}`);
        console.log(`  Location: ${drive.location}`);
        console.log(`  Last scanned: ${drive.lastScanned ? new Date(drive.lastScanned).toLocaleString() : 'Never'}`);
        console.log(`  Files: ${drive.fileCount || 'Unknown'}`);
        console.log('');
      });
      
      process.exit(0);
    } catch (error) {
      console.error('Error listing drives:', error);
      process.exit(1);
    }
  });

// Check disk health
program
  .command('health <driveId>')
  .description('Check the SMART health status of a drive')
  .action(async (driveId) => {
    try {
      await connectDB();
      
      const StorageDrive = require('../src/backend/models/storageDrive');
      const drive = await StorageDrive.findOne({ driveId });
      
      if (!drive) {
        console.error(`Drive with ID ${driveId} not found`);
        process.exit(1);
      }
      
      console.log(`Checking health of drive ${drive.name} (${drive.driveId})...`);
      
      // Call the checkDiskHealth method
      const healthResult = await drive.checkDiskHealth();
      
      if (healthResult.success) {
        console.log('Health check completed successfully');
        console.log('-'.repeat(50));
        console.log(`Health Status: ${drive.diskHealth.status}`);
        console.log(`Model: ${drive.diskHealth.model || 'Unknown'}`);
        console.log(`Serial: ${drive.diskHealth.serial || 'Unknown'}`);
        console.log(`Firmware: ${drive.diskHealth.firmware || 'Unknown'}`);
        console.log(`Temperature: ${drive.diskHealth.temperature ? `${drive.diskHealth.temperature}°C` : 'Unknown'}`);
        console.log(`Power-On Hours: ${drive.diskHealth.powerOnHours ? `${drive.diskHealth.powerOnHours} hours` : 'Unknown'}`);
        console.log(`Overall SMART Health: ${drive.diskHealth.overallHealth || 'Unknown'}`);
        
        // Display key SMART attributes
        if (drive.diskHealth.smartAttributes && drive.diskHealth.smartAttributes.length > 0) {
          console.log('\nKey SMART Attributes:');
          
          // Define critical attributes to display
          const criticalAttributes = [
            'Reallocated_Sector_Ct', 
            'Current_Pending_Sector', 
            'Offline_Uncorrectable', 
            'UDMA_CRC_Error_Count',
            'Spin_Retry_Count',
            'Reported_Uncorrect'
          ];
          
          // Find and display critical attributes
          criticalAttributes.forEach(attrName => {
            const attr = drive.diskHealth.smartAttributes.find(a => a.name === attrName);
            if (attr) {
              let status = 'OK';
              if (attr.value < attr.threshold) {
                status = 'FAILING';
              } else if (attr.value < 100) {
                status = 'WARNING';
              }
              console.log(`- ${attr.name}: Value=${attr.value}, Worst=${attr.worst}, Threshold=${attr.threshold}, Raw=${attr.raw} [${status}]`);
            }
          });
          
          // Show overall count of attributes
          console.log(`\nTotal attributes: ${drive.diskHealth.smartAttributes.length}`);
        }
        
        // Assessment
        let recommendation = '';
        if (drive.diskHealth.status === 'Healthy') {
          recommendation = 'Drive appears to be healthy';
        } else if (drive.diskHealth.status === 'Degraded') {
          recommendation = 'Drive is showing signs of wear. Consider backing up important data';
        } else if (drive.diskHealth.status === 'Failing') {
          recommendation = 'DRIVE IS FAILING. Back up all data immediately and replace the drive';
        } else {
          recommendation = 'Health status uncertain. Exercise caution';
        }
        
        console.log(`\nRecommendation: ${recommendation}`);
      } else {
        console.error('Failed to check disk health:', healthResult.message);
      }
      
      process.exit(0);
    } catch (error) {
      console.error('Error checking disk health:', error);
      process.exit(1);
    }
  });

// Get drive info
program
  .command('info <driveId>')
  .description('Get detailed information about a drive')
  .action(async (driveId) => {
    try {
      await connectDB();
      
      const StorageDrive = require('../src/backend/models/storageDrive');
      const drive = await StorageDrive.findOne({ driveId });
      
      if (!drive) {
        console.error(`Drive with ID ${driveId} not found`);
        process.exit(1);
      }
      
      console.log(`Drive Information: ${drive.name} (${drive.driveId})`);
      console.log('-'.repeat(50));
      console.log(`Description: ${drive.description || 'None'}`);
      console.log(`Path: ${drive.path}`);
      console.log(`Volume ID: ${drive.volumeSerialNumber || drive.uuid || 'Unknown'}`);
      console.log(`Filesystem: ${drive.filesystem || 'Unknown'}`);
      console.log(`Total Space: ${formatSize(drive.totalSpace)}`);
      console.log(`Free Space: ${formatSize(drive.freeSpace)}`);
      console.log(`Physical Location: ${drive.location}`);
      console.log(`Status: ${drive.status}`);
      console.log(`Last Scanned: ${drive.lastScanned ? new Date(drive.lastScanned).toLocaleString() : 'Never'}`);
      console.log(`File Count: ${drive.fileCount || 'Unknown'}`);
      console.log(`Physical Label: ${drive.physicalLabel ? 'Yes' : 'No'}`);
      console.log(`Project: ${drive.project || 'None'}`);
      console.log(`Tags: ${drive.tags.length > 0 ? drive.tags.join(', ') : 'None'}`);
      console.log(`Notes: ${drive.notes || 'None'}`);
      console.log(`Registered By: ${drive.registeredBy}`);
      console.log(`Registered At: ${new Date(drive.createdAt).toLocaleString()}`);
      
      // Get file count by type
      const MediaAsset = require('../src/backend/models/mediaAsset');
      const assetCount = await MediaAsset.countDocuments({ driveId });
      
      if (assetCount > 0) {
        console.log(`\nMedia Assets: ${assetCount} cataloged files`);
        
        const typesAggregation = await MediaAsset.aggregate([
          { $match: { driveId } },
          { $group: { _id: '$type', count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } },
          { $sort: { count: -1 } }
        ]);
        
        console.log('File types:');
        typesAggregation.forEach(type => {
          console.log(`- ${type._id}: ${type.count} files (${formatSize(type.totalSize)})`);
        });
      } else {
        console.log('\nNo media assets cataloged yet. Use the "scan" command to catalog files.');
      }
      
      process.exit(0);
    } catch (error) {
      console.error('Error getting drive info:', error);
      process.exit(1);
    }
  });

// Batch scan drives
program
  .command('batch-scan')
  .description('Scan multiple drives in sequence')
  .option('-l, --location <location>', 'Only scan drives in this location')
  .option('-s, --status <status>', 'Only scan drives with this status')
  .option('-t, --thumbnails', 'Generate thumbnails for media files', true)
  .option('-d, --thumbnail-dir <dir>', 'Directory to store thumbnails')
  .option('--health-check', 'Perform disk health check', true)
  .option('--max <number>', 'Maximum number of drives to scan', '10')
  .action(async (options) => {
    try {
      await connectDB();
      
      console.log('Starting batch scan of drives...');
      
      // Build query for drives
      const query = { status: 'active' };
      
      if (options.location) {
        query.location = options.location;
      }
      
      if (options.status) {
        query.status = options.status;
      }
      
      // Get drives
      const StorageDrive = require('../src/backend/models/storageDrive');
      const drives = await StorageDrive.find(query)
        .sort({ lastScanned: 1 }) // Scan oldest first
        .limit(parseInt(options.max));
      
      if (drives.length === 0) {
        console.log('No drives found matching criteria');
        process.exit(0);
      }
      
      console.log(`Found ${drives.length} drives to scan`);
      
      // Scan each drive in sequence
      const results = {
        success: 0,
        failed: 0,
        filesCreated: 0,
        filesUpdated: 0
      };
      
      for (const drive of drives) {
        console.log(`\nScanning drive: ${drive.name} (${drive.driveId})`);
        console.log(`Location: ${drive.location}`);
        console.log(`Path: ${drive.path}`);
        
        // Prepare scan options
        const scanOptions = {};
        
        // Configure thumbnail generation
        scanOptions.generateThumbnails = options.thumbnails !== false;
        
        if (options.thumbnailDir) {
          scanOptions.thumbnailsDir = `${options.thumbnailDir}/${drive.driveId}`;
        } else {
          scanOptions.thumbnailsDir = `./thumbnails/${drive.driveId}`;
        }
        
        // Scan the drive
        try {
          const result = await scanDrive(drive.driveId, scanOptions);
          
          if (result.success) {
            console.log(`Scan completed successfully`);
            console.log(`Created: ${result.assetResults.created}, Updated: ${result.assetResults.updated}`);
            
            results.success++;
            results.filesCreated += result.assetResults.created;
            results.filesUpdated += result.assetResults.updated;
          } else {
            console.error(`Failed to scan drive: ${result.message}`);
            results.failed++;
          }
        } catch (error) {
          console.error(`Error scanning drive ${drive.driveId}:`, error);
          results.failed++;
        }
      }
      
      console.log('\nBatch scan completed');
      console.log('-'.repeat(50));
      console.log(`Successful scans: ${results.success}/${drives.length}`);
      console.log(`Failed scans: ${results.failed}`);
      console.log(`Total files created: ${results.filesCreated}`);
      console.log(`Total files updated: ${results.filesUpdated}`);
      
      process.exit(0);
    } catch (error) {
      console.error('Error in batch scan:', error);
      process.exit(1);
    }
  });

// Generate report
program
  .command('report')
  .description('Generate a report on all media assets')
  .action(async () => {
    try {
      await connectDB();
      
      console.log('Generating media asset report...');
      
      const result = await generateAssetReport();
      
      if (result.success) {
        const report = result.report;
        
        console.log('Media Asset Report');
        console.log('-'.repeat(50));
        console.log(`Total Assets: ${report.totalAssets}`);
        console.log(`Total Size: ${formatSize(report.totalSize)}`);
        
        console.log('\nAssets by Type:');
        report.byType.forEach(type => {
          console.log(`- ${type._id}: ${type.count} files (${formatSize(type.totalSize)})`);
        });
        
        console.log('\nAssets by Project:');
        report.byProject.forEach(project => {
          console.log(`- ${project.projectName}: ${project.count} files (${formatSize(project.totalSize)})`);
        });
        
        console.log('\nAssets by Drive:');
        report.byDrive.forEach(drive => {
          console.log(`- ${drive.name}: ${drive.count} files (${formatSize(drive.totalSize)})`);
        });
      } else {
        console.error('Failed to generate report:', result.message);
      }
      
      process.exit(0);
    } catch (error) {
      console.error('Error generating report:', error);
      process.exit(1);
    }
  });

// Search for assets
program
  .command('search')
  .description('Search for media assets')
  .option('-t, --type <types>', 'Filter by types (comma-separated)')
  .option('-q, --query <text>', 'Search in title and description')
  .option('-d, --drive <driveId>', 'Filter by drive ID')
  .option('-p, --project <projectId>', 'Filter by project ID')
  .option('-l, --limit <number>', 'Limit results', '20')
  .action(async (options) => {
    try {
      await connectDB();
      
      console.log('Searching for media assets...');
      
      // Build search criteria
      const criteria = {};
      
      if (options.type) {
        criteria.type = options.type.split(',');
      }
      
      if (options.query) {
        criteria.search = options.query;
      }
      
      if (options.drive) {
        criteria.driveId = options.drive;
      }
      
      if (options.project) {
        criteria.project = options.project;
      }
      
      // Set search options
      const searchOptions = {
        limit: parseInt(options.limit),
        sort: { dateCreated: -1 }
      };
      
      // Execute search
      const result = await searchAssets(criteria, searchOptions);
      
      if (result.success) {
        console.log(`Found ${result.total} matching assets (showing ${result.assets.length}):`);
        
        if (result.assets.length === 0) {
          console.log('No assets match the search criteria.');
        } else {
          result.assets.forEach((asset, index) => {
            console.log(`${index + 1}. ${asset.title}`);
            console.log(`   Type: ${asset.type}`);
            console.log(`   Size: ${formatSize(asset.fileSize)}`);
            console.log(`   Drive: ${asset.driveName}`);
            console.log(`   Path: ${asset.originalPath}`);
            console.log(`   Created: ${new Date(asset.dateCreated).toLocaleString()}`);
            console.log(`   ID: ${asset.assetId}`);
            console.log('');
          });
        }
      } else {
        console.error('Failed to search assets:', result.message);
      }
      
      process.exit(0);
    } catch (error) {
      console.error('Error searching assets:', error);
      process.exit(1);
    }
  });

// Helper function to format file sizes
function formatSize(bytes) {
  if (bytes === undefined || bytes === null) return 'Unknown';
  
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Parse command line arguments
program.parse(process.argv);

// If no arguments provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}