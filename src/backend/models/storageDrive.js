/**
 * StorageDrive Model
 * 
 * This model represents a physical storage drive registered in the VaultKeeper system.
 * It contains information about the drive, its location, and properties.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const storageDriveSchema = new Schema({
  // Drive identification
  driveId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // Physical drive information
  path: {
    type: String,
    required: true
  },
  devicePath: {
    type: String,
    sparse: true
  },
  volumeSerialNumber: {
    type: String,
    sparse: true
  },
  uuid: {
    type: String,
    sparse: true
  },
  filesystem: {
    type: String
  },
  totalSpace: {
    type: Number,
    min: 0
  },
  freeSpace: {
    type: Number,
    min: 0
  },
  // SMART health information
  diskHealth: {
    lastChecked: Date,
    status: {
      type: String,
      enum: ['Healthy', 'Degraded', 'Failing', 'Unknown', 'Error'],
      default: 'Unknown'
    },
    temperature: Number,
    powerOnHours: Number,
    model: String,
    serial: String,
    firmware: String,
    smartAttributes: Schema.Types.Mixed,
    overallHealth: String,
    smartRawData: String
  },
  
  // Physical location and management
  location: {
    type: String,
    default: 'Unknown',
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'offline', 'archived', 'damaged'],
    default: 'active',
    index: true
  },
  lastScanned: {
    type: Date,
    default: null
  },
  fileCount: {
    type: Number,
    default: 0
  },
  
  // QR code and physical labeling
  qrCode: {
    type: String // Data URL of the QR code
  },
  physicalLabel: {
    type: Boolean,
    default: false
  },
  
  // Organizational properties
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  // Additional information
  notes: {
    type: String
  },
  registeredBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create text index for full-text search
storageDriveSchema.index({
  name: 'text',
  description: 'text',
  location: 'text',
  notes: 'text',
  'tags': 'text'
});

// Virtual for formatted size
storageDriveSchema.virtual('formattedTotalSpace').get(function() {
  if (!this.totalSpace) return 'Unknown';
  
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let size = this.totalSpace;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
});

// Virtual for formatted free space
storageDriveSchema.virtual('formattedFreeSpace').get(function() {
  if (!this.freeSpace) return 'Unknown';
  
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let size = this.freeSpace;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
});

// Virtual for usage percentage
storageDriveSchema.virtual('usagePercentage').get(function() {
  if (!this.totalSpace || !this.freeSpace) return null;
  
  const used = this.totalSpace - this.freeSpace;
  return Math.round((used / this.totalSpace) * 100);
});

// Method to check if drive is mounted and accessible
storageDriveSchema.methods.checkAvailability = async function() {
  try {
    const fs = require('fs').promises;
    
    // Check if path exists and is accessible
    await fs.access(this.path);
    
    // Get updated drive information
    const { getDriveInformation } = require('../util-functions');
    const driveInfo = await getDriveInformation(this.path);
    
    // Update space information
    if (driveInfo.size) this.totalSpace = driveInfo.size;
    if (driveInfo.available) this.freeSpace = driveInfo.available;
    
    await this.save();
    
    return {
      available: true,
      driveInfo
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
};

// Method to regenerate QR code
storageDriveSchema.methods.regenerateQRCode = async function() {
  try {
    const { generateQRCode } = require('../util-functions');
    
    // Generate QR code data
    const qrCodeData = JSON.stringify({
      type: 'storage-drive',
      id: this.driveId,
      name: this.name,
      registeredAt: this.createdAt.toISOString()
    });
    
    // Generate QR code
    this.qrCode = await generateQRCode(qrCodeData);
    await this.save();
    
    return {
      success: true,
      qrCode: this.qrCode
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// Method to check disk health
storageDriveSchema.methods.checkDiskHealth = async function() {
  try {
    const { getDiskHealthInfo, getDeviceFromMountPath } = require('../util-functions');
    
    // Get device path if not already set
    let devicePath = this.devicePath;
    if (!devicePath) {
      try {
        devicePath = await getDeviceFromMountPath(this.path);
        this.devicePath = devicePath;
      } catch (error) {
        return {
          success: false,
          message: `Could not determine device path: ${error.message}`,
          error
        };
      }
    }
    
    // Get disk health info
    const healthResult = await getDiskHealthInfo(devicePath);
    
    if (!healthResult.success) {
      return {
        success: false,
        message: `Failed to get disk health info: ${healthResult.error}`,
        error: healthResult.error
      };
    }
    
    // Update disk health information
    const health = healthResult.health;
    this.diskHealth = {
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
    
    await this.save();
    
    return {
      success: true,
      message: `Disk health check completed: ${health.healthStatus}`,
      health: this.diskHealth
    };
  } catch (error) {
    console.error(`Error checking disk health for ${this.name}:`, error);
    return {
      success: false,
      message: `Error checking disk health: ${error.message}`,
      error
    };
  }
};

// Method to get drive usage statistics
storageDriveSchema.methods.getUsageStats = async function() {
  try {
    const MediaAsset = mongoose.model('MediaAsset');
    
    // Get total asset count
    const assetCount = await MediaAsset.countDocuments({ driveId: this.driveId });
    
    // Get aggregation by type
    const typeAggregation = await MediaAsset.aggregate([
      { $match: { driveId: this.driveId } },
      { $group: { _id: '$type', count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } },
      { $sort: { count: -1 } }
    ]);
    
    // Calculate space used by tracked assets
    const trackedSize = typeAggregation.reduce((sum, type) => sum + type.totalSize, 0);
    
    // Calculate used space from drive information
    const usedSpace = this.totalSpace - this.freeSpace;
    
    return {
      success: true,
      stats: {
        assetCount,
        byType: typeAggregation,
        trackedSize,
        usedSpace,
        untrackedSize: usedSpace - trackedSize,
        totalSpace: this.totalSpace,
        freeSpace: this.freeSpace,
        usagePercentage: this.usagePercentage
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const StorageDrive = mongoose.model('StorageDrive', storageDriveSchema);

module.exports = StorageDrive;