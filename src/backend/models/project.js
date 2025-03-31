/**
 * Project Model
 * 
 * This model represents a project in the VaultKeeper system.
 * Projects are used to organize media assets and storage drives.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const projectSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'archived'],
    default: 'active'
  },
  client: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true
  }],
  color: {
    type: String,
    default: '#3498db' // Default blue color
  },
  notes: {
    type: String
  },
  createdBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create text index for full-text search
projectSchema.index({
  name: 'text',
  description: 'text',
  client: 'text',
  notes: 'text',
  'tags': 'text'
});

// Virtual for associated assets count
projectSchema.virtual('assetCount').get(function() {
  const MediaAsset = mongoose.model('MediaAsset');
  return MediaAsset.countDocuments({ project: this._id });
});

// Virtual for associated drives count
projectSchema.virtual('driveCount').get(function() {
  const StorageDrive = mongoose.model('StorageDrive');
  return StorageDrive.countDocuments({ project: this._id });
});

// Method to get project statistics
projectSchema.methods.getStats = async function() {
  try {
    const MediaAsset = mongoose.model('MediaAsset');
    const StorageDrive = mongoose.model('StorageDrive');
    
    // Get associated drives
    const drives = await StorageDrive.find({ project: this._id }, 'driveId name totalSpace freeSpace');
    
    // Get asset count
    const assetCount = await MediaAsset.countDocuments({ project: this._id });
    
    // Get aggregation by type
    const typeAggregation = await MediaAsset.aggregate([
      { $match: { project: this._id } },
      { $group: { _id: '$type', count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get aggregation by drive
    const driveAggregation = await MediaAsset.aggregate([
      { $match: { project: this._id } },
      { $group: { _id: '$driveId', driveName: { $first: '$driveName' }, count: { $sum: 1 }, totalSize: { $sum: '$fileSize' } } },
      { $sort: { count: -1 } }
    ]);
    
    // Calculate total storage space
    const totalStorageSpace = drives.reduce((sum, drive) => sum + (drive.totalSpace || 0), 0);
    const totalUsedSpace = drives.reduce((sum, drive) => sum + ((drive.totalSpace || 0) - (drive.freeSpace || 0)), 0);
    
    // Calculate total asset size
    const totalAssetSize = typeAggregation.reduce((sum, type) => sum + type.totalSize, 0);
    
    return {
      success: true,
      stats: {
        assetCount,
        driveCount: drives.length,
        byType: typeAggregation,
        byDrive: driveAggregation,
        drives,
        totalStorageSpace,
        totalUsedSpace,
        totalAssetSize
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;