/**
 * VaultKeeper Drive Routes
 * 
 * This file contains API routes for drive and media asset management
 * operations, including drive registration, scanning, and media search.
 */

const express = require('express');
const router = express.Router();
const { 
  registerDrive, 
  scanDrive, 
  searchAssets,
  generateAssetReport
} = require('./drive-controller');

/**
 * @route   POST /api/drives
 * @desc    Register a new storage drive
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const result = await registerDrive(req.body);
    
    if (result.success) {
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error registering drive:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/drives
 * @desc    Get all registered drives
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const StorageDrive = require('../src/backend/models/storageDrive');
    const drives = await StorageDrive.find().sort({ name: 1 });
    
    res.json({
      success: true,
      count: drives.length,
      drives
    });
  } catch (error) {
    console.error('Error fetching drives:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/drives/:driveId
 * @desc    Get a specific drive by ID
 * @access  Private
 */
router.get('/:driveId', async (req, res) => {
  try {
    const StorageDrive = require('../src/backend/models/storageDrive');
    const drive = await StorageDrive.findOne({ driveId: req.params.driveId });
    
    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Drive not found'
      });
    }
    
    res.json({
      success: true,
      drive
    });
  } catch (error) {
    console.error(`Error fetching drive ${req.params.driveId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   POST /api/drives/:driveId/scan
 * @desc    Scan a drive and catalog its contents
 * @access  Private
 */
router.post('/:driveId/scan', async (req, res) => {
  try {
    const options = req.body || {};
    const result = await scanDrive(req.params.driveId, options);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error(`Error scanning drive ${req.params.driveId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   PATCH /api/drives/:driveId
 * @desc    Update drive information
 * @access  Private
 */
router.patch('/:driveId', async (req, res) => {
  try {
    const StorageDrive = require('../src/backend/models/storageDrive');
    const drive = await StorageDrive.findOne({ driveId: req.params.driveId });
    
    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Drive not found'
      });
    }
    
    // Fields that can be updated
    const allowedUpdates = [
      'name', 
      'description', 
      'path', 
      'location',
      'status',
      'physicalLabel',
      'project',
      'tags',
      'notes'
    ];
    
    // Apply updates
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        drive[field] = req.body[field];
      }
    });
    
    await drive.save();
    
    res.json({
      success: true,
      message: 'Drive updated successfully',
      drive
    });
  } catch (error) {
    console.error(`Error updating drive ${req.params.driveId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   DELETE /api/drives/:driveId
 * @desc    Remove a drive from the system
 * @access  Private
 */
router.delete('/:driveId', async (req, res) => {
  try {
    const StorageDrive = require('../src/backend/models/storageDrive');
    const drive = await StorageDrive.findOne({ driveId: req.params.driveId });
    
    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Drive not found'
      });
    }
    
    // Check if the drive contains files
    const MediaAsset = require('../src/backend/models/mediaAsset');
    const assetCount = await MediaAsset.countDocuments({ driveId: req.params.driveId });
    
    if (assetCount > 0 && !req.query.force) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete drive that contains ${assetCount} media assets. Use ?force=true to override.`,
        assetCount
      });
    }
    
    // Delete all assets from this drive if force is true
    if (req.query.force === 'true' && assetCount > 0) {
      await MediaAsset.deleteMany({ driveId: req.params.driveId });
    }
    
    // Delete the drive
    await drive.remove();
    
    res.json({
      success: true,
      message: 'Drive removed successfully',
      deletedAssets: req.query.force === 'true' ? assetCount : 0
    });
  } catch (error) {
    console.error(`Error deleting drive ${req.params.driveId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/drives/:driveId/assets
 * @desc    Get all assets on a specific drive
 * @access  Private
 */
router.get('/:driveId/assets', async (req, res) => {
  try {
    const criteria = { driveId: req.params.driveId };
    
    // Add any query filters
    if (req.query.type) {
      criteria.type = req.query.type;
    }
    
    if (req.query.search) {
      criteria.search = req.query.search;
    }
    
    // Handle pagination
    const options = {
      limit: parseInt(req.query.limit) || 100,
      skip: parseInt(req.query.skip) || 0,
      sort: { dateCreated: -1 }
    };
    
    // Custom sort order if specified
    if (req.query.sort) {
      const sortField = req.query.sort.startsWith('-') 
        ? req.query.sort.substring(1) 
        : req.query.sort;
      
      const sortDirection = req.query.sort.startsWith('-') ? -1 : 1;
      options.sort = { [sortField]: sortDirection };
    }
    
    const result = await searchAssets(criteria, options);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error(`Error fetching assets for drive ${req.params.driveId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/assets
 * @desc    Search for media assets
 * @access  Private
 */
router.get('/assets/search', async (req, res) => {
  try {
    // Build search criteria from query parameters
    const criteria = {};
    
    if (req.query.type) {
      criteria.type = req.query.type.split(',');
    }
    
    if (req.query.filename) {
      criteria.filename = req.query.filename;
    }
    
    if (req.query.driveId) {
      criteria.driveId = req.query.driveId;
    }
    
    if (req.query.project) {
      criteria.project = req.query.project;
    }
    
    if (req.query.tags) {
      criteria.tags = req.query.tags.split(',');
    }
    
    if (req.query.dateFrom) {
      criteria.dateFrom = req.query.dateFrom;
    }
    
    if (req.query.dateTo) {
      criteria.dateTo = req.query.dateTo;
    }
    
    if (req.query.minSize) {
      criteria.minSize = parseInt(req.query.minSize);
    }
    
    if (req.query.maxSize) {
      criteria.maxSize = parseInt(req.query.maxSize);
    }
    
    if (req.query.search) {
      criteria.search = req.query.search;
    }
    
    // Handle pagination and sorting
    const options = {
      limit: parseInt(req.query.limit) || 100,
      skip: parseInt(req.query.skip) || 0,
      sort: { dateCreated: -1 }
    };
    
    // Custom sort order if specified
    if (req.query.sort) {
      const sortField = req.query.sort.startsWith('-') 
        ? req.query.sort.substring(1) 
        : req.query.sort;
      
      const sortDirection = req.query.sort.startsWith('-') ? -1 : 1;
      options.sort = { [sortField]: sortDirection };
    }
    
    const result = await searchAssets(criteria, options);
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error searching assets:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/assets/report
 * @desc    Generate a report on media assets
 * @access  Private
 */
router.get('/assets/report', async (req, res) => {
  try {
    const result = await generateAssetReport();
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error generating asset report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/assets/:assetId
 * @desc    Get a specific media asset by ID
 * @access  Private
 */
router.get('/assets/:assetId', async (req, res) => {
  try {
    const MediaAsset = require('../src/backend/models/mediaAsset');
    const asset = await MediaAsset.findOne({ assetId: req.params.assetId })
      .populate('project', 'name');
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    res.json({
      success: true,
      asset
    });
  } catch (error) {
    console.error(`Error fetching asset ${req.params.assetId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

/**
 * @route   PATCH /api/assets/:assetId
 * @desc    Update a media asset
 * @access  Private
 */
router.patch('/assets/:assetId', async (req, res) => {
  try {
    const MediaAsset = require('../src/backend/models/mediaAsset');
    const asset = await MediaAsset.findOne({ assetId: req.params.assetId });
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    // Fields that can be updated
    const allowedUpdates = [
      'title', 
      'description', 
      'project',
      'status',
      'tags',
      'notes'
    ];
    
    // Apply updates
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        asset[field] = req.body[field];
      }
    });
    
    await asset.save();
    
    res.json({
      success: true,
      message: 'Asset updated successfully',
      asset
    });
  } catch (error) {
    console.error(`Error updating asset ${req.params.assetId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

module.exports = router;