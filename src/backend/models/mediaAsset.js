/**
 * MediaAsset Model
 * 
 * This model represents a media asset (video, audio, image, document, etc.)
 * stored in the VaultKeeper system. It contains metadata about the file, its
 * location, and properties extracted from the file itself.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const mediaAssetSchema = new Schema({
  // Core asset identification
  assetId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // Media type classification
  type: {
    type: String,
    enum: ['video', 'audio', 'image', 'document', 'project', 'other'],
    required: true,
    index: true
  },
  
  // File information
  originalFilename: {
    type: String,
    required: true
  },
  originalPath: {
    type: String,
    required: true
  },
  fileExtension: {
    type: String,
    lowercase: true,
    index: true
  },
  fileSize: {
    type: Number,
    min: 0
  },
  
  // Storage location information
  driveId: {
    type: String,
    required: true,
    index: true
  },
  driveName: {
    type: String
  },
  
  // File identity and integrity
  hash: {
    type: String,
    index: true
  },
  
  // Dates
  dateCreated: {
    type: Date,
    default: null
  },
  dateModified: {
    type: Date,
    default: null
  },
  dateIngested: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  
  // Detailed media-specific metadata (varies by type)
  metadata: {
    type: Schema.Types.Mixed
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
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
    index: true
  },
  
  // Additional information
  notes: {
    type: String
  },
  catalogedBy: {
    type: String,
    default: 'system'
  },
  
  // Thumbnail information
  thumbnail: {
    path: String,
    generated: Date,
    width: Number,
    height: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create text index for full-text search
mediaAssetSchema.index({
  title: 'text',
  description: 'text',
  originalFilename: 'text',
  notes: 'text',
  'tags': 'text'
});

// Virtual for formatted file size
mediaAssetSchema.virtual('formattedSize').get(function() {
  if (!this.fileSize) return 'Unknown';
  
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let size = this.fileSize;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
});

// Virtual for file extension without the dot
mediaAssetSchema.virtual('extension').get(function() {
  if (!this.fileExtension) return '';
  return this.fileExtension.replace(/^\./, '');
});

// Virtual for thumbnail generation (placeholder)
mediaAssetSchema.virtual('thumbnailUrl').get(function() {
  if (this.type === 'image') {
    return `/api/assets/${this.assetId}/thumbnail`;
  } else if (this.type === 'video') {
    return `/api/assets/${this.assetId}/thumbnail`;
  } else {
    // Default icon based on type
    return `/icons/${this.type}.png`;
  }
});

// Pre-save hook to extract and set file extension if not already set
mediaAssetSchema.pre('save', function(next) {
  if (!this.fileExtension && this.originalFilename) {
    const match = this.originalFilename.match(/\.[0-9a-z]+$/i);
    if (match) {
      this.fileExtension = match[0].toLowerCase();
    }
  }
  next();
});

// Method to check if asset exists on drive
mediaAssetSchema.methods.verifyExists = async function() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    // Get the drive from the database
    const StorageDrive = mongoose.model('StorageDrive');
    const drive = await StorageDrive.findOne({ driveId: this.driveId });
    
    if (!drive || !drive.path) {
      return {
        exists: false,
        error: 'Drive not found or path not set'
      };
    }
    
    // Construct the full path
    const fullPath = path.join(drive.path, this.originalPath);
    
    // Check if file exists
    await fs.access(fullPath);
    
    // Update last seen date
    this.lastSeen = new Date();
    await this.save();
    
    return {
      exists: true,
      path: fullPath
    };
  } catch (error) {
    return {
      exists: false,
      error: error.message
    };
  }
};

// Method to update metadata from file
mediaAssetSchema.methods.refreshMetadata = async function() {
  try {
    const { extractMediaMetadata } = require('../util-functions');
    
    // First verify file exists
    const fileCheck = await this.verifyExists();
    
    if (!fileCheck.exists) {
      return {
        success: false,
        message: `File does not exist: ${fileCheck.error}`
      };
    }
    
    // Extract fresh metadata
    const fileInfo = {
      fullPath: fileCheck.path,
      mimeType: this.metadata.mimeType || `${this.type}/${this.extension}`
    };
    
    const updatedMetadata = await extractMediaMetadata(fileInfo);
    
    // Update the asset metadata
    this.metadata = {
      ...this.metadata,
      ...updatedMetadata
    };
    
    await this.save();
    
    return {
      success: true,
      message: 'Metadata updated successfully',
      metadata: this.metadata
    };
  } catch (error) {
    return {
      success: false,
      message: `Error updating metadata: ${error.message}`,
      error
    };
  }
};

// Method to generate a thumbnail for the asset
mediaAssetSchema.methods.generateThumbnail = async function(outputDir, options = {}) {
  try {
    const { generateThumbnail } = require('../util-functions');
    
    // First verify file exists
    const fileCheck = await this.verifyExists();
    
    if (!fileCheck.exists) {
      return {
        success: false,
        message: `File does not exist: ${fileCheck.error}`
      };
    }
    
    // Only generate thumbnails for media types that support it
    const thumbnailableTypes = ['image', 'video'];
    if (!thumbnailableTypes.includes(this.type)) {
      return {
        success: false,
        message: `Thumbnail generation not supported for type: ${this.type}`
      };
    }
    
    // Default thumbnail options
    const thumbOptions = {
      width: 320,
      height: 240,
      ...options
    };
    
    // Generate thumbnail
    const thumbnailPath = await generateThumbnail(
      fileCheck.path, 
      outputDir, 
      thumbOptions
    );
    
    if (!thumbnailPath) {
      return {
        success: false,
        message: 'Failed to generate thumbnail'
      };
    }
    
    // Update asset with thumbnail information
    this.thumbnail = {
      path: thumbnailPath,
      generated: new Date(),
      width: thumbOptions.width,
      height: thumbOptions.height
    };
    
    await this.save();
    
    return {
      success: true,
      message: 'Thumbnail generated successfully',
      thumbnailPath
    };
  } catch (error) {
    console.error(`Error generating thumbnail for ${this.assetId}:`, error);
    return {
      success: false,
      message: `Error generating thumbnail: ${error.message}`,
      error
    };
  }
};

const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);

module.exports = MediaAsset;