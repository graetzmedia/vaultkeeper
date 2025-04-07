/**
 * Storage Drive Routes
 * API endpoints for managing storage drives in the VaultKeeper system
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const StorageDrive = require('../models/storageDrive');
const MediaAsset = require('../models/mediaAsset');

// Configure multer for file uploads (drive images)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/drives/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// GET all storage drives
router.get('/', async (req, res) => {
  try {
    const { 
      search, type, status, location, 
      sortBy = 'name', sortDir = 'asc',
      page = 1, limit = 20 
    } = req.query;
    
    // Build query
    const query = {};
    
    // Add filters
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { serialNumber: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (type) query.type = type;
    if (status) query.status = status;
    if (location) query['location.facility'] = location;
    
    // Count total results for pagination
    const total = await StorageDrive.countDocuments(query);
    
    // Get drives with pagination and sorting
    const sortDirection = sortDir === 'desc' ? -1 : 1;
    const sortOptions = { [sortBy]: sortDirection };
    
    const drives = await StorageDrive.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('projects', 'title');
    
    // Return results with pagination info
    res.json({
      drives,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching drives:', error);
    res.status(500).json({ error: 'Failed to fetch drives' });
  }
});

// GET a single drive by ID
router.get('/:id', async (req, res) => {
  try {
    const drive = await StorageDrive.findById(req.params.id)
      .populate('projects', 'title status')
      .populate('assets', 'title type path');
    
    if (!drive) {
      return res.status(404).json({ error: 'Drive not found' });
    }
    
    res.json(drive);
  } catch (error) {
    console.error('Error fetching drive:', error);
    res.status(500).json({ error: 'Failed to fetch drive' });
  }
});

// POST create a new drive
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const {
      name,
      serialNumber,
      type,
      manufacturer,
      model,
      capacity,
      interface,
      formFactor,
      location,
      status,
      health,
      tags,
      color,
      purchaseDate,
      warrantyExpiration,
      purchasePrice,
      notes
    } = req.body;
    
    // Check for required fields
    if (!name || !serialNumber || !type) {
      return res.status(400).json({ 
        error: 'Name, serial number, and type are required' 
      });
    }
    
    // Check for drive with same serial number
    const existingDrive = await StorageDrive.findOne({ serialNumber });
    if (existingDrive) {
      return res.status(400).json({ 
        error: 'A drive with this serial number already exists' 
      });
    }
    
    // Generate QR code
    const driveId = uuidv4();
    const qrData = JSON.stringify({
      id: driveId,
      serialNumber,
      name,
      type
    });
    
    const qrCodeFilename = `drive-qr-${driveId}.png`;
    const qrCodePath = path.join(
      __dirname, '..', '..', '..', 'public', 'qrcodes', qrCodeFilename
    );
    
    // Ensure directory exists
    const qrDir = path.dirname(qrCodePath);
    if (!fs.existsSync(qrDir)) {
      fs.mkdirSync(qrDir, { recursive: true });
    }
    
    await qrcode.toFile(qrCodePath, qrData);
    
    // Create new drive
    const parsedTags = tags ? JSON.parse(tags) : [];
    const parsedLocation = location ? JSON.parse(location) : {};
    
    const drive = new StorageDrive({
      name,
      serialNumber,
      type,
      manufacturer: manufacturer || '',
      model: model || '',
      capacity: capacity ? Number(capacity) : 0,
      interface: interface || 'Other',
      formFactor: formFactor || 'Other',
      location: parsedLocation,
      status: status || 'active',
      health: health || 'unknown',
      qrCode: `/qrcodes/${qrCodeFilename}`,
      labelPrinted: false,
      tags: parsedTags,
      color: color || '',
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      warrantyExpiration: warrantyExpiration ? new Date(warrantyExpiration) : null,
      purchasePrice: purchasePrice ? Number(purchasePrice) : null,
      notes: notes || '',
      usedSpace: 0,
      fileCount: 0
    });
    
    // If image was uploaded, add it
    if (req.file) {
      drive.image = `/uploads/drives/${req.file.filename}`;
    }
    
    // Save the drive
    await drive.save();
    
    res.status(201).json(drive);
  } catch (error) {
    console.error('Error creating drive:', error);
    res.status(500).json({ error: 'Failed to create drive' });
  }
});

// PUT update a drive
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const {
      name,
      type,
      manufacturer,
      model,
      capacity,
      interface,
      formFactor,
      location,
      status,
      health,
      tags,
      color,
      purchaseDate,
      warrantyExpiration,
      purchasePrice,
      notes
    } = req.body;
    
    // Find the drive
    const drive = await StorageDrive.findById(req.params.id);
    if (!drive) {
      return res.status(404).json({ error: 'Drive not found' });
    }
    
    // Update fields
    if (name) drive.name = name;
    if (type) drive.type = type;
    if (manufacturer) drive.manufacturer = manufacturer;
    if (model) drive.model = model;
    if (capacity) drive.capacity = Number(capacity);
    if (interface) drive.interface = interface;
    if (formFactor) drive.formFactor = formFactor;
    if (location) drive.location = JSON.parse(location);
    if (status) drive.status = status;
    if (health) drive.health = health;
    if (tags) drive.tags = JSON.parse(tags);
    if (color) drive.color = color;
    if (purchaseDate) drive.purchaseDate = new Date(purchaseDate);
    if (warrantyExpiration) drive.warrantyExpiration = new Date(warrantyExpiration);
    if (purchasePrice) drive.purchasePrice = Number(purchasePrice);
    if (notes) drive.notes = notes;
    
    // If image was uploaded, update it
    if (req.file) {
      // Remove old image if exists
      if (drive.image) {
        const oldImagePath = path.join(
          __dirname, '..', '..', '..', drive.image
        );
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      
      drive.image = `/uploads/drives/${req.file.filename}`;
    }
    
    // Update timestamp
    drive.updated = new Date();
    
    // Save the updated drive
    await drive.save();
    
    res.json(drive);
  } catch (error) {
    console.error('Error updating drive:', error);
    res.status(500).json({ error: 'Failed to update drive' });
  }
});

// DELETE a drive
router.delete('/:id', async (req, res) => {
  try {
    const drive = await StorageDrive.findById(req.params.id);
    
    if (!drive) {
      return res.status(404).json({ error: 'Drive not found' });
    }
    
    // Check if drive has assets
    const assetCount = await MediaAsset.countDocuments({ drive: req.params.id });
    if (assetCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete drive with ${assetCount} assets. Reassign or delete the assets first.`
      });
    }
    
    // Remove QR code if exists
    if (drive.qrCode) {
      const qrCodePath = path.join(
        __dirname, '..', '..', '..', 'public', drive.qrCode
      );
      if (fs.existsSync(qrCodePath)) {
        fs.unlinkSync(qrCodePath);
      }
    }
    
    // Remove image if exists
    if (drive.image) {
      const imagePath = path.join(
        __dirname, '..', '..', '..', drive.image
      );
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Delete the drive
    await StorageDrive.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Drive deleted successfully' });
  } catch (error) {
    console.error('Error deleting drive:', error);
    res.status(500).json({ error: 'Failed to delete drive' });
  }
});

// POST generate and print drive label
router.post('/:id/print-label', async (req, res) => {
  try {
    const drive = await StorageDrive.findById(req.params.id);
    
    if (!drive) {
      return res.status(404).json({ error: 'Drive not found' });
    }
    
    // Generate drive label
    const labelResult = await drive.generateLabel(true);
    
    if (!labelResult.success) {
      return res.status(500).json({ 
        error: 'Failed to generate drive label', 
        details: labelResult.error 
      });
    }
    
    // Check if we should print directly
    const { printDirectly } = req.body;
    
    if (printDirectly) {
      // Use Niimbot printer integration
      const NiimbotPrinter = require('../utils/niimbot-printer');
      
      try {
        // Create printer instance
        const printer = await NiimbotPrinter.createPrinter({
          model: 'D101'
        });
        
        // Discover printers
        const printers = await printer.discoverPrinters();
        
        if (printers.length === 0) {
          return res.json({
            success: true,
            printed: false,
            labelUrl: labelResult.filePath,
            dataUrl: labelResult.dataUrl,
            message: 'Label generated but no Niimbot printers found for direct printing',
            manualInstructions: NiimbotPrinter.getManualPrintingInstructions()
          });
        }
        
        // Connect to first discovered printer
        await printer.connect(printers[0].id);
        
        // Print the label
        await printer.printLabel(labelResult.labelBuffer);
        
        // Disconnect
        await printer.disconnect();
        
        return res.json({
          success: true,
          printed: true,
          labelUrl: labelResult.filePath,
          dataUrl: labelResult.dataUrl,
          message: `Label printed successfully on ${printers[0].name}`
        });
      } catch (printerError) {
        console.error('Error printing with Niimbot:', printerError);
        
        // Return success but with manual instructions
        return res.json({
          success: true,
          printed: false,
          labelUrl: labelResult.filePath,
          dataUrl: labelResult.dataUrl,
          message: 'Label generated but printer error occurred',
          error: printerError.message,
          manualInstructions: NiimbotPrinter.getManualPrintingInstructions()
        });
      }
    }
    
    // Return success with label info but no direct printing
    res.json({
      success: true,
      printed: false,
      labelUrl: labelResult.filePath,
      dataUrl: labelResult.dataUrl,
      message: 'Drive label generated successfully - use browser or Niimbot app to print'
    });
  } catch (error) {
    console.error('Error generating/printing drive label:', error);
    res.status(500).json({ error: 'Failed to generate or print drive label' });
  }
});

// POST assign drive to location and generate labels for both
router.post('/:id/assign-location', async (req, res) => {
  try {
    const { bay, shelf, position, generateLabels = true, printLabels = false } = req.body;
    
    if (!bay || !shelf || !position) {
      return res.status(400).json({ error: 'Bay, shelf, and position are required' });
    }
    
    // Find drive
    const drive = await StorageDrive.findById(req.params.id);
    if (!drive) {
      return res.status(404).json({ error: 'Drive not found' });
    }
    
    // Find or create location
    const PhysicalLocation = require('../models/physicalLocation');
    
    let location = await PhysicalLocation.findOne({
      bay: parseInt(bay),
      shelf: parseInt(shelf),
      position: parseInt(position)
    });
    
    if (!location) {
      // Create new location
      location = new PhysicalLocation({
        bay: parseInt(bay),
        shelf: parseInt(shelf),
        position: parseInt(position),
        status: 'EMPTY'
      });
      await location.save();
    } else if (location.status === 'OCCUPIED' && location.occupiedBy !== drive.driveId) {
      return res.status(400).json({
        error: `Location ${location.locationId} is already occupied by drive ${location.occupiedBy}`,
        currentOccupant: location.occupiedBy
      });
    }
    
    // Update location
    location.status = 'OCCUPIED';
    location.occupiedBy = drive.driveId;
    await location.save();
    
    // Update drive
    drive.location = location.locationId;
    await drive.save();
    
    // Generate labels if requested
    const labels = {};
    
    if (generateLabels) {
      // Generate drive label
      const driveLabel = await drive.generateLabel(true);
      if (driveLabel.success) {
        labels.drive = {
          success: true,
          url: driveLabel.filePath,
          dataUrl: driveLabel.dataUrl
        };
      }
      
      // Generate location label
      const locationLabel = await location.generateLabel(true);
      if (locationLabel.success) {
        labels.location = {
          success: true,
          url: locationLabel.filePath,
          dataUrl: locationLabel.dataUrl
        };
      }
      
      // Print labels if requested
      if (printLabels && (labels.drive?.success || labels.location?.success)) {
        const NiimbotPrinter = require('../utils/niimbot-printer');
        
        try {
          // Create printer instance
          const printer = await NiimbotPrinter.createPrinter({
            model: 'D101'
          });
          
          // Discover printers
          const printers = await printer.discoverPrinters();
          
          if (printers.length > 0) {
            // Connect to first discovered printer
            await printer.connect(printers[0].id);
            
            // Print labels
            const labelsToPrint = [];
            if (labels.drive?.success) labelsToPrint.push(labels.drive.url);
            if (labels.location?.success) labelsToPrint.push(labels.location.url);
            
            const printResult = await printer.printBatch(labelsToPrint);
            
            // Disconnect
            await printer.disconnect();
            
            labels.printed = {
              success: printResult.success > 0,
              count: printResult.success,
              total: printResult.total,
              printer: printers[0].name
            };
          } else {
            labels.printed = {
              success: false,
              message: 'No Niimbot printers found for direct printing',
              manualInstructions: NiimbotPrinter.getManualPrintingInstructions()
            };
          }
        } catch (printerError) {
          console.error('Error printing with Niimbot:', printerError);
          labels.printed = {
            success: false,
            error: printerError.message,
            manualInstructions: NiimbotPrinter.getManualPrintingInstructions()
          };
        }
      }
    }
    
    res.json({
      success: true,
      drive: {
        id: drive.driveId,
        name: drive.name
      },
      location: {
        id: location.locationId,
        bay: location.bay,
        shelf: location.shelf,
        position: location.position
      },
      labels
    });
  } catch (error) {
    console.error('Error assigning drive to location:', error);
    res.status(500).json({ error: 'Failed to assign drive to location' });
  }
});

// GET drive stats and analytics
router.get('/stats/overview', async (req, res) => {
  try {
    // Total drives count
    const totalDrives = await StorageDrive.countDocuments();
    
    // Count by type
    const typeStats = await StorageDrive.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Count by status
    const statusStats = await StorageDrive.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Total and used capacity
    const capacityStats = await StorageDrive.aggregate([
      { 
        $group: { 
          _id: null, 
          totalCapacity: { $sum: '$capacity' },
          usedCapacity: { $sum: '$usedSpace' },
          driveCount: { $sum: 1 }
        } 
      }
    ]);
    
    // Recently added drives
    const recentDrives = await StorageDrive.find()
      .sort({ created: -1 })
      .limit(5)
      .select('name type capacity status created');
    
    res.json({
      totalDrives,
      typeStats,
      statusStats,
      capacityStats: capacityStats[0] || { totalCapacity: 0, usedCapacity: 0, driveCount: 0 },
      recentDrives,
      utilization: capacityStats[0] ? 
        (capacityStats[0].usedCapacity / capacityStats[0].totalCapacity) * 100 : 0
    });
  } catch (error) {
    console.error('Error fetching drive stats:', error);
    res.status(500).json({ error: 'Failed to fetch drive statistics' });
  }
});

module.exports = router;