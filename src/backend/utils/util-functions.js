/**
 * VaultKeeper Utility Functions
 * 
 * This file contains utility functions for the VaultKeeper application,
 * focusing on drive scanning, file metadata extraction, media cataloging,
 * and hardware health checks.
 */

const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const crypto = require('crypto');
const mime = require('mime-types');
const ffprobe = promisify(require('fluent-ffmpeg').ffprobe);
const ExifParser = require('exif-parser');
const QRCode = require('qrcode');
const sharp = require('sharp');  // For thumbnail generation

/**
 * Recursively scan a directory and collect file information
 * @param {string} dirPath - Path to the directory to scan
 * @param {array} results - Array to store the file information (passed by reference)
 * @param {string} relativePath - Relative path from the root directory
 * @returns {Promise<Array>} - Array of file objects with metadata
 */
async function scanDirectory(dirPath, results = [], relativePath = '') {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip hidden directories
        if (entry.name.startsWith('.')) continue;
        
        // Recursively scan subdirectories
        await scanDirectory(fullPath, results, entryRelativePath);
      } else {
        // Skip hidden files
        if (entry.name.startsWith('.')) continue;
        
        // Get basic file information
        const stats = await fs.stat(fullPath);
        
        const fileInfo = {
          filename: entry.name,
          path: entryRelativePath,
          fullPath: fullPath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          extension: path.extname(entry.name).toLowerCase(),
          mimeType: mime.lookup(entry.name) || 'application/octet-stream',
          hash: await calculateFileHash(fullPath, 'md5')
        };
        
        results.push(fileInfo);
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error);
    throw error;
  }
}

/**
 * Calculate hash for a file
 * @param {string} filePath - Path to the file
 * @param {string} algorithm - Hash algorithm to use (default: md5)
 * @returns {Promise<string>} - File hash
 */
async function calculateFileHash(filePath, algorithm = 'md5') {
  try {
    const fileHandle = await fs.open(filePath, 'r');
    const fileStream = fileHandle.createReadStream();
    
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      
      fileStream.on('data', data => hash.update(data));
      fileStream.on('end', () => {
        fileHandle.close();
        resolve(hash.digest('hex'));
      });
      fileStream.on('error', (err) => {
        fileHandle.close();
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Error calculating hash for ${filePath}:`, error);
    return null;
  }
}

/**
 * Extract specific metadata for media files based on their type
 * @param {Object} fileInfo - Basic file information
 * @returns {Promise<Object>} - Enhanced file information with media metadata
 */
async function extractMediaMetadata(fileInfo) {
  try {
    const { mimeType, fullPath } = fileInfo;
    let mediaMetadata = {};
    
    // Video files
    if (mimeType.startsWith('video/')) {
      const metadata = await ffprobe(fullPath);
      
      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
      
      mediaMetadata = {
        mediaType: 'video',
        duration: metadata.format.duration,
        bitrate: metadata.format.bit_rate,
        resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
        codec: videoStream ? videoStream.codec_name : null,
        frameRate: videoStream ? videoStream.r_frame_rate : null,
        audioCodec: audioStream ? audioStream.codec_name : null,
        audioChannels: audioStream ? audioStream.channels : null,
        audioSampleRate: audioStream ? audioStream.sample_rate : null
      };
    }
    
    // Audio files
    else if (mimeType.startsWith('audio/')) {
      const metadata = await ffprobe(fullPath);
      
      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
      
      mediaMetadata = {
        mediaType: 'audio',
        duration: metadata.format.duration,
        bitrate: metadata.format.bit_rate,
        codec: audioStream ? audioStream.codec_name : null,
        channels: audioStream ? audioStream.channels : null,
        sampleRate: audioStream ? audioStream.sample_rate : null
      };
    }
    
    // Image files
    else if (mimeType.startsWith('image/')) {
      try {
        const buffer = await fs.readFile(fullPath);
        const parser = ExifParser.create(buffer);
        const result = parser.parse();
        
        mediaMetadata = {
          mediaType: 'image',
          dimensions: result.imageSize ? `${result.imageSize.width}x${result.imageSize.height}` : null,
          orientation: result.tags ? result.tags.Orientation : null,
          make: result.tags ? result.tags.Make : null,
          model: result.tags ? result.tags.Model : null,
          exposureTime: result.tags ? result.tags.ExposureTime : null,
          fNumber: result.tags ? result.tags.FNumber : null,
          iso: result.tags ? result.tags.ISO : null,
          dateTaken: result.tags ? new Date(result.tags.DateTimeOriginal * 1000) : null
        };
      } catch (err) {
        // Some images may not have EXIF data
        mediaMetadata = {
          mediaType: 'image',
          note: 'No EXIF data available or unsupported image format'
        };
      }
    }
    
    // Document or other file types
    else {
      mediaMetadata = {
        mediaType: 'document',
        note: 'No media-specific metadata available for this file type'
      };
    }
    
    return { ...fileInfo, ...mediaMetadata };
  } catch (error) {
    console.error(`Error extracting metadata for ${fileInfo.fullPath}:`, error);
    return { ...fileInfo, mediaType: 'unknown', error: error.message };
  }
}

/**
 * Scan a drive and extract complete metadata for all files
 * @param {string} drivePath - Path to the mounted drive
 * @param {Object} driveInfo - Information about the drive (label, serial, etc.)
 * @returns {Promise<Object>} - Complete scan results with drive and file information
 */
async function scanDriveContents(drivePath, driveInfo) {
  try {
    // Basic validation
    if (!drivePath) {
      throw new Error('Drive path is required');
    }
    
    // Check if drive path exists and is accessible
    try {
      await fs.access(drivePath);
    } catch (error) {
      throw new Error(`Drive path ${drivePath} is not accessible: ${error.message}`);
    }
    
    // Get drive information if not provided
    const driveDetails = driveInfo || await getDriveInformation(drivePath);
    
    // Scan all files on the drive
    const allFiles = await scanDirectory(drivePath);
    
    // Sort files by size (largest first) to prioritize important media
    allFiles.sort((a, b) => b.size - a.size);
    
    // Process the first 1000 files (to avoid overwhelming the system)
    // In a real application, you would process all files, possibly with a queue
    const filesToProcess = allFiles.slice(0, 1000);
    
    // Extract media metadata for all files
    const filesWithMetadata = await Promise.all(
      filesToProcess.map(fileInfo => extractMediaMetadata(fileInfo))
    );
    
    // Organize files by type
    const filesByType = filesWithMetadata.reduce((acc, file) => {
      const mediaType = file.mediaType || 'other';
      acc[mediaType] = acc[mediaType] || [];
      acc[mediaType].push(file);
      return acc;
    }, {});
    
    // Calculate total size by type
    const sizeByType = Object.entries(filesByType).reduce((acc, [type, files]) => {
      acc[type] = files.reduce((sum, file) => sum + file.size, 0);
      return acc;
    }, {});
    
    // Create summary information
    const summary = {
      totalFiles: allFiles.length,
      processedFiles: filesWithMetadata.length,
      totalSize: allFiles.reduce((sum, file) => sum + file.size, 0),
      fileTypes: Object.keys(filesByType).map(type => ({
        type,
        count: filesByType[type].length,
        size: sizeByType[type]
      }))
    };
    
    // Return complete scan results
    return {
      driveInfo: driveDetails,
      summary,
      files: filesWithMetadata,
      scanDate: new Date()
    };
  } catch (error) {
    console.error(`Error scanning drive ${drivePath}:`, error);
    throw error;
  }
}

/**
 * Get information about a drive or volume
 * @param {string} drivePath - Path to the mounted drive
 * @returns {Promise<Object>} - Drive information
 */
async function getDriveInformation(drivePath) {
  try {
    // Different commands for different operating systems
    let command;
    
    if (process.platform === 'win32') {
      // Windows
      command = `wmic logicaldisk get DeviceID,VolumeName,FileSystem,Size,VolumeSerialNumber /format:csv | findstr "${drivePath.charAt(0)}:"`;
    } else if (process.platform === 'darwin') {
      // macOS
      command = `diskutil info $(df "${drivePath}" | awk 'NR==2 {print $1}') | grep -E 'Volume Name|File System|Disk Size|Volume UUID'`;
    } else {
      // Linux
      command = `df -T "${drivePath}" | tail -n 1 && lsblk -o NAME,LABEL,UUID,FSTYPE,SIZE -J | grep -i "$(df "${drivePath}" | awk 'NR==2 {print $1}' | sed 's/.*\\///')"`;
    }
    
    const { stdout } = await exec(command);
    
    // Parse the output based on the platform
    let driveInfo = {
      path: drivePath,
      platform: process.platform
    };
    
    if (process.platform === 'win32') {
      // Parse Windows WMI output
      const lines = stdout.trim().split('\n');
      if (lines.length > 1) {
        const headers = lines[0].split(',');
        const values = lines[1].split(',');
        
        headers.forEach((header, index) => {
          driveInfo[header.trim()] = values[index] ? values[index].trim() : null;
        });
      }
    } else if (process.platform === 'darwin') {
      // Parse macOS diskutil output
      const volumeName = stdout.match(/Volume Name:\\s+(.+)/);
      const fileSystem = stdout.match(/File System Personality:\\s+(.+)/);
      const size = stdout.match(/Disk Size:\\s+(.+)/);
      const uuid = stdout.match(/Volume UUID:\\s+(.+)/);
      
      driveInfo.volumeName = volumeName ? volumeName[1].trim() : null;
      driveInfo.fileSystem = fileSystem ? fileSystem[1].trim() : null;
      driveInfo.size = size ? size[1].trim() : null;
      driveInfo.uuid = uuid ? uuid[1].trim() : null;
    } else {
      // Parse Linux output
      // Parse df output
      const dfLine = stdout.trim().split('\n')[0];
      const dfParts = dfLine.split(/\\s+/);
      
      driveInfo.device = dfParts[0];
      driveInfo.fileSystem = dfParts[1];
      driveInfo.size = dfParts[2];
      driveInfo.used = dfParts[3];
      driveInfo.available = dfParts[4];
      driveInfo.usedPercentage = dfParts[5];
      
      // Try to parse lsblk JSON output if available
      try {
        const lsblkMatch = stdout.match(/{.*}/);
        if (lsblkMatch) {
          const lsblkData = JSON.parse(lsblkMatch[0]);
          
          if (lsblkData.blockdevices && lsblkData.blockdevices.length > 0) {
            const device = lsblkData.blockdevices[0];
            driveInfo.label = device.LABEL;
            driveInfo.uuid = device.UUID;
            driveInfo.name = device.NAME;
          }
        }
      } catch (e) {
        console.error('Error parsing lsblk output:', e);
      }
    }
    
    return driveInfo;
  } catch (error) {
    console.error(`Error getting drive information for ${drivePath}:`, error);
    return { path: drivePath, error: error.message };
  }
}

/**
 * Generate a QR code for a drive or media asset
 * @param {string} data - Data to encode in the QR code
 * @param {Object} options - QR code generation options
 * @returns {Promise<string>} - Data URL of the generated QR code
 */
async function generateQRCode(data, options = {}) {
  try {
    const qrOptions = {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 1,
      scale: 4,
      ...options
    };
    
    return await QRCode.toDataURL(data, qrOptions);
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

/**
 * Generate a unique identifier for a drive or media asset
 * @param {Object} data - Data to use for ID generation
 * @returns {string} - Generated ID
 */
function generateUniqueId(data) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(data));
  // Return a shortened version (first 16 characters)
  return hash.digest('hex').substring(0, 16);
}

/**
 * Generate a thumbnail for an image or video file
 * @param {string} filePath - Path to the file
 * @param {string} outputDir - Directory to save the thumbnail
 * @param {Object} options - Thumbnail options (width, height, etc.)
 * @returns {Promise<string>} - Path to the generated thumbnail
 */
async function generateThumbnail(filePath, outputDir, options = {}) {
  try {
    const fileExt = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath, fileExt);
    const thumbnailPath = path.join(outputDir, `${fileName}_thumb.jpg`);
    
    // Create output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });
    
    // Default options
    const thumbOptions = {
      width: 320,
      height: 240,
      fit: 'inside',
      ...options
    };
    
    // Generate thumbnail based on file type
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff'].includes(fileExt)) {
      // For images
      await sharp(filePath)
        .resize(thumbOptions.width, thumbOptions.height, { fit: thumbOptions.fit })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);
        
      return thumbnailPath;
    } else if (['.mp4', '.mov', '.avi', '.mkv', '.wmv'].includes(fileExt)) {
      // For videos - use ffmpeg to extract a frame
      const ffmpeg = require('fluent-ffmpeg');
      const outputPath = thumbnailPath;
      
      return new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .screenshots({
            count: 1,
            folder: outputDir,
            filename: `${fileName}_thumb.jpg`,
            size: `${thumbOptions.width}x${thumbOptions.height}`
          })
          .on('end', () => {
            resolve(outputPath);
          })
          .on('error', (err) => {
            reject(err);
          });
      });
    } else {
      // For other file types, return a default icon path or generate a type-based icon
      return null;
    }
  } catch (error) {
    console.error(`Error generating thumbnail for ${filePath}:`, error);
    return null;
  }
}

/**
 * Get SMART disk health information
 * @param {string} devicePath - Path to the physical disk device (e.g., /dev/sda, /dev/disk0)
 * @returns {Promise<Object>} - SMART disk health information
 */
async function getDiskHealthInfo(devicePath) {
  try {
    // Determine platform
    const platform = process.platform;
    let command;
    
    if (!devicePath) {
      throw new Error('Device path is required');
    }
    
    // Format command based on platform
    if (platform === 'darwin') {
      // On macOS, get disk identifier
      const { stdout: diskUtil } = await exec(`diskutil info "${devicePath}" | grep "Device Identifier:"`);
      const diskId = diskUtil.match(/Device Identifier:\s+(disk\d+)/);
      
      if (!diskId || !diskId[1]) {
        throw new Error(`Could not determine disk identifier for ${devicePath}`);
      }
      
      command = `smartctl -a /dev/${diskId[1]}`;
    } else if (platform === 'linux') {
      // Linux - direct device path
      command = `smartctl -a ${devicePath}`;
    } else if (platform === 'win32') {
      // Windows - use physical drive number
      const driveNumber = devicePath.match(/\d+/);
      if (!driveNumber) {
        throw new Error(`Invalid device path format for Windows: ${devicePath}`);
      }
      command = `smartctl -a /dev/pd${driveNumber[0]}`;
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    
    // Execute smartctl command
    const { stdout } = await exec(command);
    
    // Parse the output
    const healthInfo = parseSmartOutput(stdout);
    
    return {
      success: true,
      devicePath,
      health: healthInfo
    };
  } catch (error) {
    console.error(`Error getting disk health info for ${devicePath}:`, error);
    return {
      success: false,
      devicePath,
      error: error.message
    };
  }
}

/**
 * Parse SMART output into structured health information
 * @param {string} smartOutput - Output from smartctl -a command
 * @returns {Object} - Structured health information
 */
function parseSmartOutput(smartOutput) {
  try {
    const lines = smartOutput.split('\n');
    const healthInfo = {
      model: '',
      serial: '',
      firmware: '',
      capacity: '',
      temperature: null,
      powerOnHours: null,
      healthStatus: 'Unknown',
      overallHealth: 'Unknown',
      attributes: [],
      rawData: smartOutput
    };
    
    // Extract basic information
    for (const line of lines) {
      // Model
      if (line.match(/Model Family|Device Model|Product:/i)) {
        healthInfo.model = line.split(':')[1]?.trim() || '';
      }
      
      // Serial number
      if (line.match(/Serial Number|Serial:/i)) {
        healthInfo.serial = line.split(':')[1]?.trim() || '';
      }
      
      // Firmware
      if (line.match(/Firmware Version|Revision:/i)) {
        healthInfo.firmware = line.split(':')[1]?.trim() || '';
      }
      
      // Capacity
      if (line.match(/User Capacity:/i)) {
        healthInfo.capacity = line.split(':')[1]?.trim() || '';
      }
      
      // Power-on hours
      if (line.match(/Power_On_Hours/i)) {
        const match = line.match(/\d+\s+\w+\s+\w+\s+\w+\s+\w+\s+(\d+)/);
        if (match && match[1]) {
          healthInfo.powerOnHours = parseInt(match[1]);
        }
      }
      
      // Temperature
      if (line.match(/Temperature|temp/i)) {
        const match = line.match(/\d+\s+\w+\s+\w+\s+\w+\s+\w+\s+(\d+)/);
        if (match && match[1]) {
          healthInfo.temperature = parseInt(match[1]);
        }
      }
      
      // Overall health
      if (line.match(/SMART overall-health self-assessment/i)) {
        const match = line.match(/self-assessment.*: (.+)$/i);
        if (match && match[1]) {
          healthInfo.overallHealth = match[1].trim();
          // Determine health status
          if (match[1].includes('PASS')) {
            healthInfo.healthStatus = 'Healthy';
          } else if (match[1].includes('FAIL')) {
            healthInfo.healthStatus = 'Failing';
          }
        }
      }
    }
    
    // Extract SMART attributes
    let attributesStarted = false;
    for (const line of lines) {
      // Detect the start of attributes section
      if (line.match(/ID# ATTRIBUTE_NAME/i)) {
        attributesStarted = true;
        continue;
      }
      
      // Process attribute lines
      if (attributesStarted && line.trim() !== '') {
        // Parse only lines that have attribute IDs (typically starts with a number)
        if (line.match(/^\s*\d+\s/)) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 10) {
            const attribute = {
              id: parseInt(parts[0]),
              name: parts[1],
              value: parseInt(parts[3]),
              worst: parseInt(parts[4]),
              threshold: parseInt(parts[5]),
              raw: parts[9]
            };
            
            healthInfo.attributes.push(attribute);
            
            // Check for reallocated sectors - a key indicator of disk health
            if (attribute.name === 'Reallocated_Sector_Ct' && attribute.value < 100) {
              healthInfo.healthStatus = 'Degraded';
            }
            
            // Check for pending sectors - another indicator of issues
            if (attribute.name === 'Current_Pending_Sector' && parseInt(attribute.raw) > 0) {
              healthInfo.healthStatus = 'Degraded';
            }
          }
        } else if (line.trim() === '') {
          // Empty line might indicate the end of attributes section
          attributesStarted = false;
        }
      }
    }
    
    // Determine health status if not already set
    if (healthInfo.healthStatus === 'Unknown' && healthInfo.overallHealth.includes('PASS')) {
      healthInfo.healthStatus = 'Healthy';
    }
    
    return healthInfo;
  } catch (error) {
    console.error('Error parsing SMART output:', error);
    return {
      healthStatus: 'Error',
      error: error.message,
      rawData: smartOutput
    };
  }
}

/**
 * Get the physical disk device path from a mounted volume
 * @param {string} mountPath - Path to the mounted volume
 * @returns {Promise<string>} - Physical disk device path
 */
async function getDeviceFromMountPath(mountPath) {
  try {
    const platform = process.platform;
    let command;
    let devicePath = null;
    
    if (platform === 'darwin') {
      // macOS - use diskutil
      command = `diskutil info "${mountPath}" | grep "Device Node:"`;
      const { stdout } = await exec(command);
      const match = stdout.match(/Device Node:\s+(.+)$/);
      if (match && match[1]) {
        devicePath = match[1].trim();
      }
    } else if (platform === 'linux') {
      // Linux - use df and find the device
      command = `df -P "${mountPath}" | tail -n 1 | awk '{print $1}'`;
      const { stdout } = await exec(command);
      devicePath = stdout.trim();
    } else if (platform === 'win32') {
      // Windows - more complex, use wmic
      // Get the drive letter from the mount path
      const driveLetter = mountPath.charAt(0);
      command = `wmic volume where DriveLetter="${driveLetter}:" get DeviceID | findstr /r /v "^$" | findstr /v "DeviceID"`;
      const { stdout } = await exec(command);
      // Extract device ID from output
      const volumeId = stdout.trim();
      if (volumeId) {
        // Get physical device from volume ID
        const { stdout: diskOutput } = await exec(`wmic diskdrive where "DeviceID like '%${volumeId}%'" get Index`);
        const diskIndex = diskOutput.trim().replace(/\D/g, '');
        if (diskIndex) {
          devicePath = `\\\\.\\PhysicalDrive${diskIndex}`;
        }
      }
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    
    if (!devicePath) {
      throw new Error(`Could not determine device path for mount ${mountPath}`);
    }
    
    return devicePath;
  } catch (error) {
    console.error(`Error getting device path for ${mountPath}:`, error);
    throw error;
  }
}

module.exports = {
  scanDirectory,
  calculateFileHash,
  extractMediaMetadata,
  scanDriveContents,
  getDriveInformation,
  generateQRCode,
  generateUniqueId,
  generateThumbnail,
  getDiskHealthInfo,
  getDeviceFromMountPath
};