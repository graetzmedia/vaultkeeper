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

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'VaultKeeper API' });
});

module.exports = router;