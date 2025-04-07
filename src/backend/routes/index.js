/**
 * VaultKeeper API Routes
 * This file consolidates all routes for the VaultKeeper system
 */

const express = require('express');
const router = express.Router();

// Import route modules
// const mediaRoutes = require('./mediaRoutes');
const driveRoutes = require('./driveRoutes');
// const archiveRoutes = require('./archiveRoutes');
// const projectRoutes = require('./projectRoutes');
// const searchRoutes = require('./searchRoutes');

// Media asset routes
// router.use('/media', mediaRoutes);

// Storage drive routes
router.use('/drives', driveRoutes);

// Archive management routes
// router.use('/archives', archiveRoutes);

// Project routes
// router.use('/projects', projectRoutes);

// Search routes
// router.use('/search', searchRoutes);

// Define location routes
const PhysicalLocation = require('../models/physicalLocation');

// GET all locations
router.get('/locations', async (req, res) => {
  try {
    // Support filtering by bay, shelf, status
    const { bay, shelf, status } = req.query;
    const query = {};
    
    if (bay) query.bay = parseInt(bay);
    if (shelf) query.shelf = parseInt(shelf);
    if (status) query.status = status;
    
    const locations = await PhysicalLocation.find(query)
      .sort({ bay: 1, shelf: 1, position: 1 });
    
    res.json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET summary of all bays and shelves - must be before /:id routes
router.get('/locations/summary', async (req, res) => {
  try {
    const locations = await PhysicalLocation.find();
    
    // Create summary by bay and shelf
    const summary = {};
    
    locations.forEach(location => {
      const bayKey = `Bay ${location.bay}`;
      const shelfKey = `Shelf ${location.shelf}`;
      
      // Initialize bay if not exists
      if (!summary[bayKey]) {
        summary[bayKey] = {
          totalLocations: 0,
          occupied: 0,
          empty: 0,
          shelves: {}
        };
      }
      
      // Initialize shelf if not exists
      if (!summary[bayKey].shelves[shelfKey]) {
        summary[bayKey].shelves[shelfKey] = {
          totalLocations: 0,
          occupied: 0,
          empty: 0
        };
      }
      
      // Increment counters
      summary[bayKey].totalLocations++;
      summary[bayKey].shelves[shelfKey].totalLocations++;
      
      if (location.status === 'OCCUPIED') {
        summary[bayKey].occupied++;
        summary[bayKey].shelves[shelfKey].occupied++;
      } else {
        summary[bayKey].empty++;
        summary[bayKey].shelves[shelfKey].empty++;
      }
    });
    
    res.json(summary);
  } catch (error) {
    console.error('Error generating locations summary:', error);
    res.status(500).json({ error: 'Failed to generate locations summary' });
  }
});

// GET export all locations from a bay or shelf as CSV - must be before /:id routes
router.get('/locations/export-batch', async (req, res) => {
  try {
    const { bay, shelf } = req.query;
    
    if (!bay) {
      return res.status(400).json({ error: 'Bay parameter is required' });
    }
    
    // Build query
    const query = { bay: parseInt(bay) };
    if (shelf) {
      query.shelf = parseInt(shelf);
    }
    
    // Find matching locations
    const locations = await PhysicalLocation.find(query).sort({ bay: 1, shelf: 1, position: 1 });
    
    if (locations.length === 0) {
      return res.status(404).json({ error: 'No locations found matching the criteria' });
    }
    
    // Create CSV header
    const csvHeader = 'Location_ID,Bay,Shelf,Position,Status,Section,QR_Code_Data,Label_Text\n';
    let csvContent = csvHeader;
    
    // Add a row for each location
    for (const location of locations) {
      // Generate QR code data
      const qrData = JSON.stringify({
        type: 'location',
        id: location._id.toString(),
        bay: location.bay,
        shelf: location.shelf,
        position: location.position
      });
      
      // Generate location ID
      const locationId = `B${location.bay}-S${location.shelf}-P${location.position}`;
      
      // Format section info
      const section = location.section || '';
      
      // Create a single formatted text field for the label
      const labelText = `${locationId}\\n` +
                      `${location.status || 'EMPTY'}\\n` +
                      `${section}`;
      
      // Add row to CSV
      const csvRow = `"${locationId}",` +
                    `"${location.bay}",` +
                    `"${location.shelf}",` +
                    `"${location.position}",` +
                    `"${location.status || 'EMPTY'}",` +
                    `"${section}",` +
                    `"${qrData}",` +
                    `"${labelText}"\n`;
      
      csvContent += csvRow;
    }
    
    // Set headers for download
    const filename = shelf ? 
      `locations_B${bay}_S${shelf}.csv` : 
      `locations_B${bay}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Send CSV response
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error exporting location labels CSV:', error);
    res.status(500).json({ error: 'Failed to export location labels' });
  }
});

// POST create new location
router.post('/locations', async (req, res) => {
  try {
    const { bay, shelf, position, status, section, notes, tags } = req.body;
    
    // Validate required fields
    if (!bay || !shelf || !position) {
      return res.status(400).json({ error: 'Bay, shelf, and position are required' });
    }
    
    // Check if location already exists
    const existingLocation = await PhysicalLocation.findOne({
      bay: parseInt(bay),
      shelf: parseInt(shelf),
      position: parseInt(position)
    });
    
    if (existingLocation) {
      return res.status(400).json({ error: 'Location already exists' });
    }
    
    // Create new location
    const newLocation = new PhysicalLocation({
      bay: parseInt(bay),
      shelf: parseInt(shelf),
      position: parseInt(position),
      status: status || 'EMPTY',
      section,
      notes,
      tags: tags || []
    });
    
    // Generate QR code
    await newLocation.regenerateQRCode();
    
    // Save location
    const savedLocation = await newLocation.save();
    res.status(201).json(savedLocation);
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// POST create batch locations
router.post('/locations/batch', async (req, res) => {
  try {
    const { locations } = req.body;
    
    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Locations array is required' });
    }
    
    const result = await PhysicalLocation.createBatch(locations);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error creating batch locations:', error);
    res.status(500).json({ error: 'Failed to create batch locations' });
  }
});

// GET location by ID
router.get('/locations/:id', async (req, res) => {
  try {
    const location = await PhysicalLocation.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(location);
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({ error: 'Failed to fetch location' });
  }
});

// PUT update location
router.put('/locations/:id', async (req, res) => {
  try {
    const { status, section, notes, tags, occupiedBy } = req.body;
    
    const location = await PhysicalLocation.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    // Update fields
    if (status !== undefined) location.status = status;
    if (section !== undefined) location.section = section;
    if (notes !== undefined) location.notes = notes;
    if (tags !== undefined) location.tags = tags;
    if (occupiedBy !== undefined) location.occupiedBy = occupiedBy;
    
    // Save updated location
    const updatedLocation = await location.save();
    res.json(updatedLocation);
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// DELETE location
router.delete('/locations/:id', async (req, res) => {
  try {
    const location = await PhysicalLocation.findByIdAndDelete(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// GET export location label CSV
router.get('/locations/:id/export-label', async (req, res) => {
  try {
    const location = await PhysicalLocation.findById(req.params.id);
    
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    // Generate QR code data
    const qrData = JSON.stringify({
      type: 'location',
      id: location._id.toString(),
      bay: location.bay,
      shelf: location.shelf,
      position: location.position
    });
    
    // Generate location ID
    const locationId = `B${location.bay}-S${location.shelf}-P${location.position}`;
    
    // Format section info
    const section = location.section || '';
    
    // Create a single formatted text field for the label
    const labelText = `${locationId}\\n` +
                     `${location.status || 'EMPTY'}\\n` +
                     `${section}`;
    
    // Create CSV header and content
    const csvHeader = 'Location_ID,Bay,Shelf,Position,Status,Section,QR_Code_Data,Label_Text\n';
    const csvRow = `"${locationId}",` +
                  `"${location.bay}",` +
                  `"${location.shelf}",` +
                  `"${location.position}",` +
                  `"${location.status || 'EMPTY'}",` +
                  `"${section}",` +
                  `"${qrData}",` +
                  `"${labelText}"\n`;
    
    const csvContent = csvHeader + csvRow;
    
    // Set headers for download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="location_label_${locationId}.csv"`);
    
    // Send CSV response
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error exporting location label CSV:', error);
    res.status(500).json({ error: 'Failed to export location label' });
  }
});

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'VaultKeeper API' });
});

module.exports = router;