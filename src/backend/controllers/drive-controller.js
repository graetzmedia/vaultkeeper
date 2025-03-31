/**
 * VaultKeeper Drive Controller
 * 
 * This controller handles operations related to storage drives,
 * including scanning, cataloging, and tracking of media assets.
 */

const mongoose = require('mongoose');
const { 
  scanDriveContents, 
  getDriveInformation,
  generateQRCode,
  generateUniqueId,
  getDeviceFromMountPath,
  getDiskHealthInfo,
  generateThumbnail
} = require('./util-functions');

// Import the models (assuming these exist in the project structure)
const StorageDrive = require('../src/backend/models/storageDrive');
const MediaAsset = require('../src/backend/models/mediaAsset');
const Project = require('../src/backend/models/project');

/**
 * Register a new storage drive
 * @param {Object} driveData - Basic information about the drive
 * @returns {Promise<Object>} - The created storage drive document
 */
async function registerDrive(driveData) {
  try {
    // Validate required fields
    if (!driveData.path) {
      throw new Error('Drive path is required');
    }
    
    // Check if drive is already registered
    const existingDrive = await StorageDrive.findOne({ 
      $or: [
        { path: driveData.path },
        { volumeSerialNumber: driveData.volumeSerialNumber },
        { uuid: driveData.uuid }
      ]
    });
    
    if (existingDrive) {
      return { 
        success: false, 
        message: 'Drive is already registered', 
        drive: existingDrive 
      };
    }
    
    // Get drive information if not provided
    let driveInfo = driveData;
    
    if (!driveData.volumeName && !driveData.label) {
      const detectedInfo = await getDriveInformation(driveData.path);
      driveInfo = { ...driveInfo, ...detectedInfo };
    }
    
    // Generate a drive ID if not provided
    if (!driveInfo.driveId) {
      driveInfo.driveId = generateUniqueId(driveInfo);
    }
    
    // Generate a QR code for the drive
    const qrCodeData = JSON.stringify({
      type: 'storage-drive',
      id: driveInfo.driveId,
      name: driveInfo.volumeName || driveInfo.label || 'Unnamed Drive',
      registeredAt: new Date().toISOString()
    });
    
    const qrCode = await generateQRCode(qrCodeData);
    
    // Create the new drive document
    const newDrive = new StorageDrive({
      driveId: driveInfo.driveId,
      name: driveInfo.volumeName || driveInfo.label || 'Unnamed Drive',
      description: driveInfo.description || '',
      path: driveInfo.path,
      volumeSerialNumber: driveInfo.volumeSerialNumber || driveInfo.uuid || null,
      filesystem: driveInfo.fileSystem || driveInfo.filesystem || null,
      totalSpace: driveInfo.size || null,
      freeSpace: driveInfo.available || null,
      location: driveInfo.location || 'Unknown',
      status: 'active',
      lastScanned: null,
      qrCode: qrCode,
      physicalLabel: false,
      project: driveInfo.project || null,
      tags: driveInfo.tags || [],
      notes: driveInfo.notes || '',
      registeredBy: driveInfo.registeredBy || 'system',
      // Initialize disk health with unknown status
      diskHealth: {
        status: 'Unknown',
        lastChecked: null
      }
    });
    
    await newDrive.save();
    
    // Try to get device path and check disk health
    try {
      // Get device path from mount path
      const devicePath = await getDeviceFromMountPath(driveInfo.path);
      newDrive.devicePath = devicePath;
      
      // Check disk health
      const healthResult = await getDiskHealthInfo(devicePath);
      
      if (healthResult.success) {
        const health = healthResult.health;
        
        // Update disk health information
        newDrive.diskHealth = {
          lastChecked: new Date(),
          status: health.healthStatus,
          temperature: health.temperature,
          powerOnHours: health.powerOnHours,
          model: health.model,
          serial: health.serial,
          firmware: health.firmware,
          smartAttributes: health.attributes,
          overallHealth: health.overallHealth,
          smartRawData: health.rawData
        };
        
        await newDrive.save();
      }
    } catch (error) {
      console.log(`Could not get disk health information: ${error.message}`);
      // Continue without health info - this is not a critical error
    }
    
    return { 
      success: true, 
      message: 'Drive registered successfully', 
      drive: newDrive 
    };
  } catch (error) {
    console.error('Error registering drive:', error);
    return { 
      success: false, 
      message: `Error registering drive: ${error.message}`,
      error 
    };
  }
}

/**
 * Scan a drive and catalog all media assets
 * @param {string} driveId - ID of the drive to scan
 * @param {Object} options - Scan options (includeTypes, excludeTypes, etc.)
 * @returns {Promise<Object>} - Scan results
 */
async function scanDrive(driveId, options = {}) {
  try {
    // Find the drive in the database
    const drive = await StorageDrive.findOne({ driveId });
    
    if (!drive) {
      return {
        success: false,
        message: `Drive with ID ${driveId} not found`
      };
    }
    
    // Check if drive is accessible
    if (!drive.path) {
      return {
        success: false,
        message: 'Drive path is not set'
      };
    }
    
    // Perform the drive scan
    console.log(`Starting scan of drive ${drive.name} (${drive.driveId}) at path ${drive.path}`);
    const scanResults = await scanDriveContents(drive.path, {
      volumeName: drive.name,
      volumeSerialNumber: drive.volumeSerialNumber
    });
    
    // Filter files based on options if specified
    let filesToCatalog = scanResults.files;
    
    if (options.includeTypes && options.includeTypes.length > 0) {
      filesToCatalog = filesToCatalog.filter(file => 
        options.includeTypes.includes(file.mediaType)
      );
    }
    
    if (options.excludeTypes && options.excludeTypes.length > 0) {
      filesToCatalog = filesToCatalog.filter(file => 
        !options.excludeTypes.includes(file.mediaType)
      );
    }
    
    // Update the drive with scan information
    drive.lastScanned = new Date();
    drive.totalSpace = scanResults.driveInfo.size || drive.totalSpace;
    drive.freeSpace = scanResults.driveInfo.available || drive.freeSpace;
    drive.fileCount = scanResults.summary.totalFiles;
    
    // Try to check disk health
    try {
      await drive.checkDiskHealth();
    } catch (error) {
      console.log(`Could not check disk health: ${error.message}`);
      // Continue without health check - this is not a critical error
    }
    
    await drive.save();
    
    // Setup thumbnails directory
    const thumbnailsDir = options.thumbnailsDir || `./thumbnails/${drive.driveId}`;
    const fs = require('fs').promises;
    try {
      await fs.mkdir(thumbnailsDir, { recursive: true });
    } catch (error) {
      console.log(`Could not create thumbnails directory: ${error.message}`);
    }
    
    // Create media asset records for each file
    const assetResults = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      thumbnailsGenerated: 0
    };
    
    for (const file of filesToCatalog) {
      try {
        // Generate a unique asset ID based on file path and hash
        const assetId = generateUniqueId({
          driveId: drive.driveId,
          path: file.path,
          hash: file.hash
        });
        
        // Check if asset already exists
        const existingAsset = await MediaAsset.findOne({
          $or: [
            { assetId },
            { 
              driveId: drive.driveId,
              originalPath: file.path,
              hash: file.hash
            }
          ]
        });
        
        if (existingAsset) {
          // Update the existing asset
          existingAsset.lastSeen = new Date();
          existingAsset.fileSize = file.size;
          existingAsset.metadata = {
            ...existingAsset.metadata,
            ...file
          };
          
          await existingAsset.save();
          assetResults.updated++;
        } else {
          // Create a new asset record
          const newAsset = new MediaAsset({
            assetId,
            title: file.filename,
            description: '',
            type: file.mediaType || 'other',
            originalFilename: file.filename,
            originalPath: file.path,
            fileExtension: file.extension,
            fileSize: file.size,
            driveId: drive.driveId,
            driveName: drive.name,
            hash: file.hash,
            dateCreated: file.created,
            dateModified: file.modified,
            lastSeen: new Date(),
            metadata: file,
            project: drive.project,
            status: 'active',
            tags: [],
            notes: '',
            catalogedBy: 'system'
          });
          
          await newAsset.save();
          assetResults.created++;
          
          // Generate thumbnail for supported media types
          if (options.generateThumbnails !== false && ['image', 'video'].includes(file.mediaType)) {
            try {
              // Use small subset of large files for thumbnails
              const shouldGenerateThumbnail = 
                file.mediaType === 'image' || 
                (file.mediaType === 'video' && assetResults.thumbnailsGenerated < 100);
                
              if (shouldGenerateThumbnail) {
                const thumbResult = await generateThumbnail(
                  file.fullPath,
                  thumbnailsDir,
                  { width: 320, height: 240 }
                );
                
                if (thumbResult) {
                  newAsset.thumbnail = {
                    path: thumbResult,
                    generated: new Date(),
                    width: 320,
                    height: 240
                  };
                  
                  await newAsset.save();
                  assetResults.thumbnailsGenerated++;
                }
              }
            } catch (thumbError) {
              console.log(`Error generating thumbnail for ${file.filename}: ${thumbError.message}`);
              // Continue without thumbnail - this is not a critical error
            }
          }
        }
      } catch (error) {
        console.error(`Error cataloging file ${file.fullPath}:`, error);
        assetResults.failed++;
      }
    }
    
    return {
      success: true,
      message: `Drive scan completed successfully. Created: ${assetResults.created}, Updated: ${assetResults.updated}, Failed: ${assetResults.failed}`,
      drive,
      summary: scanResults.summary,
      assetResults
    };
  } catch (error) {
    console.error(`Error scanning drive ${driveId}:`, error);
    return {
      success: false,
      message: `Error scanning drive: ${error.message}`,
      error
    };
  }
}

/**
 * Search for media assets based on various criteria
 * @param {Object} criteria - Search criteria (type, name, tags, etc.)
 * @param {Object} options - Search options (limit, sort, etc.)
 * @returns {Promise<Array>} - Matching media assets
 */
async function searchAssets(criteria = {}, options = {}) {
  try {
    // Build the query
    const query = {};
    
    // Filter by media type
    if (criteria.type) {
      query.type = Array.isArray(criteria.type) ? { $in: criteria.type } : criteria.type;
    }
    
    // Filter by filename
    if (criteria.filename) {
      query.originalFilename = { $regex: criteria.filename, $options: 'i' };
    }
    
    // Filter by drive
    if (criteria.driveId) {
      query.driveId = criteria.driveId;
    }
    
    // Filter by project
    if (criteria.project) {
      query.project = criteria.project;
    }
    
    // Filter by tags
    if (criteria.tags && criteria.tags.length > 0) {
      query.tags = { $all: criteria.tags };
    }
    
    // Filter by date range
    if (criteria.dateFrom || criteria.dateTo) {
      query.dateCreated = {};
      
      if (criteria.dateFrom) {
        query.dateCreated.$gte = new Date(criteria.dateFrom);
      }
      
      if (criteria.dateTo) {
        query.dateCreated.$lte = new Date(criteria.dateTo);
      }
    }
    
    // Filter by file size
    if (criteria.minSize || criteria.maxSize) {
      query.fileSize = {};
      
      if (criteria.minSize) {
        query.fileSize.$gte = criteria.minSize;
      }
      
      if (criteria.maxSize) {
        query.fileSize.$lte = criteria.maxSize;
      }
    }
    
    // Full-text search by title or description
    if (criteria.search) {
      query.$or = [
        { title: { $regex: criteria.search, $options: 'i' } },
        { description: { $regex: criteria.search, $options: 'i' } },
        { notes: { $regex: criteria.search, $options: 'i' } }
      ];
    }
    
    // Default options
    const defaultOptions = {
      limit: 100,
      skip: 0,
      sort: { dateCreated: -1 }
    };
    
    const searchOptions = { ...defaultOptions, ...options };
    
    // Execute the query
    const assets = await MediaAsset.find(query)
      .sort(searchOptions.sort)
      .skip(searchOptions.skip)
      .limit(searchOptions.limit)
      .populate('project', 'name');
    
    // Get the total count
    const total = await MediaAsset.countDocuments(query);
    
    return {
      success: true,
      message: `Found ${assets.length} media assets`,
      assets,
      total,
      query,
      options: searchOptions
    };
  } catch (error) {
    console.error('Error searching for assets:', error);
    return {
      success: false,
      message: `Error searching for assets: ${error.message}`,
      error
    };
  }
}

/**
 * Generate report on media assets by type and project
 * @returns {Promise<Object>} - Report data
 */
async function generateAssetReport() {
  try {
    // Get total count of all assets
    const totalAssets = await MediaAsset.countDocuments();
    
    // Get count by media type
    const typeAggregation = await MediaAsset.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get count by project
    const projectAggregation = await MediaAsset.aggregate([
      { $group: { _id: '$project', count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get projects info to include their names
    const projects = await Project.find();
    const projectsMap = {};
    
    projects.forEach(project => {
      projectsMap[project._id.toString()] = project.name;
    });
    
    // Format the project results
    const projectResults = projectAggregation.map(item => ({
      projectId: item._id,
      projectName: item._id ? projectsMap[item._id.toString()] || 'Unknown' : 'Unassigned',
      count: item.count,
      totalSize: item.totalSize
    }));
    
    // Get count by drive
    const driveAggregation = await MediaAsset.aggregate([
      { $group: { _id: '$driveId', name: { $first: '$driveName' }, count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get all storage drives for any that might not have assets
    const allDrives = await StorageDrive.find({}, 'driveId name');
    
    // Calculate total storage space
    const totalSize = typeAggregation.reduce((sum, type) => sum + type.totalSize, 0);
    
    return {
      success: true,
      report: {
        totalAssets,
        totalSize,
        byType: typeAggregation,
        byProject: projectResults,
        byDrive: driveAggregation,
        allDrives
      }
    };
  } catch (error) {
    console.error('Error generating asset report:', error);
    return {
      success: false,
      message: `Error generating asset report: ${error.message}`,
      error
    };
  }
}

module.exports = {
  registerDrive,
  scanDrive,
  searchAssets,
  generateAssetReport
};