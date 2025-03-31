/**
 * Archive Job Model
 * Schema for tracking archive processes in the VaultKeeper system
 */

const mongoose = require('mongoose');

// Archive Job schema
const archiveJobSchema = new mongoose.Schema({
  // Basic job information
  name: { type: String, required: true },
  description: String,
  
  // Relationships
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  targetDrives: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageDrive' }],
  sourceDrives: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorageDrive' }],
  
  // Job details
  type: { 
    type: String, 
    enum: ['full-archive', 'selective-archive', 'proxy-generation', 'verification', 'restore'],
    required: true 
  },
  assets: [{
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' },
    status: { 
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'failed', 'skipped'],
      default: 'pending'
    },
    targetPath: String,
    notes: String
  }],
  
  // Time tracking
  scheduledDate: Date,
  startDate: Date,
  endDate: Date,
  estimatedDuration: Number, // in minutes
  actualDuration: Number, // in minutes
  
  // Status
  status: { 
    type: String, 
    enum: ['planned', 'in-progress', 'completed', 'failed', 'cancelled'],
    default: 'planned'
  },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  
  // Data information
  totalSize: Number, // in gigabytes
  transferredSize: Number, // in gigabytes
  fileCount: Number,
  
  // Verification
  verificationMethod: {
    type: String,
    enum: ['checksum', 'bit-by-bit', 'visual', 'none'],
    default: 'checksum'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'in-progress', 'passed', 'failed', 'skipped'],
    default: 'pending'
  },
  verificationDetails: String,
  
  // Assignment
  assignedTo: String,
  
  // Logs and tracking
  logs: [{
    timestamp: { type: Date, default: Date.now },
    message: String,
    level: { 
      type: String, 
      enum: ['info', 'warning', 'error', 'success'],
      default: 'info'
    }
  }],
  
  // Metadata
  notes: String,
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now },
  createdBy: String
});

// Virtuals for calculations
archiveJobSchema.virtual('assetCount').get(function() {
  return this.assets ? this.assets.length : 0;
});

archiveJobSchema.virtual('completedAssetCount').get(function() {
  if (!this.assets) return 0;
  return this.assets.filter(asset => asset.status === 'completed').length;
});

archiveJobSchema.virtual('failedAssetCount').get(function() {
  if (!this.assets) return 0;
  return this.assets.filter(asset => asset.status === 'failed').length;
});

archiveJobSchema.virtual('transferRate').get(function() {
  if (!this.transferredSize || !this.actualDuration || this.actualDuration === 0) return 0;
  return this.transferredSize / (this.actualDuration / 60); // GB per hour
});

// Indexes for faster querying
archiveJobSchema.index({ project: 1 });
archiveJobSchema.index({ status: 1 });
archiveJobSchema.index({ scheduledDate: 1 });
archiveJobSchema.index({ assignedTo: 1 });
archiveJobSchema.index({ 'assets.asset': 1 });
archiveJobSchema.index({ 'assets.status': 1 });

// Create model
const ArchiveJob = mongoose.model('ArchiveJob', archiveJobSchema);

module.exports = ArchiveJob;