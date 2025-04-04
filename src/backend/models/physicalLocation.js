/**
 * Physical Location Model
 * 
 * This model represents a physical storage location in the VaultKeeper system.
 * Each location has a bay, shelf, and position to identify its exact place
 * in the storage system.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const physicalLocationSchema = new Schema({
  // Location identifiers
  bay: {
    type: Number,
    required: true,
    min: 1
  },
  shelf: {
    type: Number,
    required: true,
    min: 1
  },
  position: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Location status
  status: {
    type: String,
    enum: ['EMPTY', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'],
    default: 'EMPTY'
  },
  
  // Reference to the drive currently in this location
  occupiedBy: {
    type: String,
    ref: 'StorageDrive',
    sparse: true
  },
  
  // Additional metadata
  label: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  qrCode: {
    type: String // Data URL of the QR code
  },
  labelPrinted: {
    type: Boolean,
    default: false
  },
  
  // For organizing locations
  section: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create a compound index for Bay-Shelf-Position to ensure uniqueness
physicalLocationSchema.index({ bay: 1, shelf: 1, position: 1 }, { unique: true });

// Create text indexes for searching
physicalLocationSchema.index({
  label: 'text',
  notes: 'text',
  section: 'text',
  'tags': 'text'
});

// Virtual for full location ID
physicalLocationSchema.virtual('locationId').get(function() {
  return `B${this.bay}-S${this.shelf}-P${this.position}`;
});

// Method to regenerate QR code
physicalLocationSchema.methods.regenerateQRCode = async function() {
  try {
    const { generateQRCode } = require('../utils/util-functions');
    
    // Generate QR code data
    const qrCodeData = JSON.stringify({
      type: 'location',
      id: this._id.toString(),
      bay: this.bay,
      shelf: this.shelf,
      position: this.position,
      locationId: this.locationId
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

// Method to check if location is available
physicalLocationSchema.methods.isAvailable = function() {
  return this.status === 'EMPTY' || this.status === 'RESERVED';
};

// Method to get drive in this location
physicalLocationSchema.methods.getOccupyingDrive = async function() {
  if (!this.occupiedBy) {
    return null;
  }
  
  try {
    const StorageDrive = mongoose.model('StorageDrive');
    return await StorageDrive.findOne({ driveId: this.occupiedBy });
  } catch (error) {
    console.error(`Error getting occupying drive for location ${this.locationId}:`, error);
    return null;
  }
};

// Static method to create locations in bulk
physicalLocationSchema.statics.createBatch = async function(locations) {
  try {
    const results = {
      success: true,
      created: [],
      failed: [],
      total: locations.length
    };
    
    for (const location of locations) {
      try {
        const newLocation = new this(location);
        await newLocation.save();
        results.created.push({
          id: newLocation._id,
          locationId: newLocation.locationId
        });
      } catch (error) {
        results.failed.push({
          location,
          error: error.message
        });
      }
    }
    
    if (results.failed.length > 0 && results.created.length === 0) {
      results.success = false;
    }
    
    return results;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      total: locations.length,
      created: [],
      failed: locations.map(loc => ({ location: loc, error: error.message }))
    };
  }
};

// Generate a location label using the label-generator module
physicalLocationSchema.methods.generateLabel = async function(saveToFile = true) {
  try {
    const labelGenerator = require('../utils/label-generator');
    
    // Generate label
    const result = await labelGenerator.generateLocationLabel(this, saveToFile, {
      outputDir: 'public/labels'
    });
    
    // Mark as having a label printed
    if (result.success) {
      this.labelPrinted = true;
      await this.save();
    }
    
    return result;
  } catch (error) {
    console.error(`Error generating label for location ${this.locationId}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

const PhysicalLocation = mongoose.model('PhysicalLocation', physicalLocationSchema);

module.exports = PhysicalLocation;