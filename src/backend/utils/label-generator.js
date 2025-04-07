/**
 * VaultKeeper Label Generator
 * 
 * This module handles label generation for drives and physical locations,
 * optimized for NIIMBOT label printers (specifically the D101 model).
 */

const fs = require('fs').promises;
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const QRCode = require('qrcode');
const sharp = require('sharp');

// Define constants for label dimensions
const LABEL_DIMENSIONS = {
  standard: {
    widthMm: 70,   // Width of the label
    heightMm: 20,  // Height of the label (D101 printer)
    dpi: 300,      // NIIMBOT D101 printer DPI
    get widthPx() { return Math.round(this.widthMm * this.dpi / 25.4); },
    get heightPx() { return Math.round(this.heightMm * this.dpi / 25.4); }
  },
  shelf: {
    widthMm: 50,   // Width of the label (shorter than standard)
    heightMm: 20,  // Height of the label (D101 printer)
    dpi: 300,      // NIIMBOT D101 printer DPI
    get widthPx() { return Math.round(this.widthMm * this.dpi / 25.4); },
    get heightPx() { return Math.round(this.heightMm * this.dpi / 25.4); }
  }
};

/**
 * Generate a QR code as an image buffer
 * @param {Object} data - Data to encode in the QR code
 * @param {number} size - Size in pixels for the QR code
 * @returns {Promise<Buffer>} - QR code image as buffer
 */
async function generateQRImage(data, size = 236) {
  const qrOptions = {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  };

  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  const qrCodeUrl = await QRCode.toDataURL(dataString, qrOptions);
  const qrImageData = qrCodeUrl.split(',')[1];
  return Buffer.from(qrImageData, 'base64');
}

/**
 * Create a drive label
 * @param {Object} driveInfo - Information about the drive
 * @param {Object} options - Label options
 * @returns {Promise<Buffer>} - Label image as buffer
 */
async function createDriveLabel(driveInfo, options = {}) {
  // Use standard dimensions unless specified
  const labelType = options.labelType || 'standard';
  const dimensions = LABEL_DIMENSIONS[labelType];
  
  // Create canvas for the label
  const canvas = createCanvas(dimensions.widthPx, dimensions.heightPx);
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, dimensions.widthPx, dimensions.heightPx);
  
  // Generate QR code data
  const qrData = {
    type: 'drive',
    id: driveInfo.driveId,
    uuid: driveInfo.uuid || '',
    name: driveInfo.name,
    date: new Date().toISOString()
  };
  
  // QR code size - making it approximately 1/3 of label width
  const qrSize = Math.round(dimensions.widthPx * 0.3);
  const qrBuffer = await generateQRImage(qrData, qrSize);
  const qrImage = await loadImage(qrBuffer);
  
  // Draw QR code on the left side
  const qrXPosition = 5;
  const qrYPosition = (dimensions.heightPx - qrSize) / 2; // Center vertically
  ctx.drawImage(qrImage, qrXPosition, qrYPosition, qrSize, qrSize);
  
  // Set up text rendering
  ctx.fillStyle = '#000000';
  
  // Define the right section starting position
  const textXPosition = qrXPosition + qrSize + 5;
  const textWidth = dimensions.widthPx - textXPosition - 5;
  
  // Get root folder information
  const rootFolders = driveInfo.rootFolders || ['No folders found'];
  
  // Position for content in the middle section
  let yPos = 10;
  
  // Draw root folders with largest text (in top section of middle column)
  ctx.font = 'bold 12px Arial';
  const rootFolderLimit = 5; // Limit to prevent text overflow
  
  for (let i = 0; i < Math.min(rootFolders.length, rootFolderLimit); i++) {
    const folder = rootFolders[i];
    const folderName = folder.length > 20 ? folder.substring(0, 20) + '...' : folder;
    
    ctx.fillText(folderName, textXPosition, yPos);
    yPos += 14;
  }
  
  // Draw drive name with medium-sized text
  yPos += 10; // Add some spacing
  ctx.font = 'bold 11px Arial';
  const driveName = driveInfo.name || 'Unnamed Drive';
  ctx.fillText(driveName, textXPosition, yPos);
  yPos += 15;
  
  // Draw drive ID with smaller text
  ctx.font = '9px Arial';
  ctx.fillText(`ID: ${driveInfo.driveId}`, textXPosition, yPos);
  yPos += 12;
  
  // Draw file stats with smallest text
  ctx.font = '8px Arial';
  
  // Add media type counts if available
  if (driveInfo.mediaStats) {
    const stats = driveInfo.mediaStats;
    for (const [type, count] of Object.entries(stats)) {
      ctx.fillText(`${type}: ${count}`, textXPosition, yPos);
      yPos += 10;
    }
  }
  
  // Draw date in smallest text at the bottom
  const date = new Date(driveInfo.createdAt || new Date()).toLocaleDateString();
  ctx.fillText(`Added: ${date}`, textXPosition, dimensions.heightPx - 5);
  
  // Convert canvas to buffer
  const buffer = canvas.toBuffer('image/png');
  
  return buffer;
}

/**
 * Create a shelf location label
 * @param {Object} locationInfo - Information about the shelf location
 * @param {Object} options - Label options
 * @returns {Promise<Buffer>} - Label image as buffer
 */
async function createLocationLabel(locationInfo, options = {}) {
  // Use shelf dimensions by default for location labels
  const labelType = options.labelType || 'shelf';
  const dimensions = LABEL_DIMENSIONS[labelType];
  
  // Create canvas for the label
  const canvas = createCanvas(dimensions.widthPx, dimensions.heightPx);
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, dimensions.widthPx, dimensions.heightPx);
  
  // Generate QR code data
  const qrData = {
    type: 'location',
    id: locationInfo.id,
    bay: locationInfo.bay,
    shelf: locationInfo.shelf,
    position: locationInfo.position
  };
  
  // QR code size - making it approximately 1/3 of label width
  const qrSize = Math.round(dimensions.widthPx * 0.3);
  const qrBuffer = await generateQRImage(qrData, qrSize);
  const qrImage = await loadImage(qrBuffer);
  
  // Draw QR code on the left side
  const qrXPosition = 5;
  const qrYPosition = (dimensions.heightPx - qrSize) / 2; // Center vertically
  ctx.drawImage(qrImage, qrXPosition, qrYPosition, qrSize, qrSize);
  
  // Set up text rendering
  ctx.fillStyle = '#000000';
  
  // Define the right section starting position
  const textXPosition = qrXPosition + qrSize + 5;
  
  // Draw location ID in largest text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 18px Arial';
  const locationText = `B${locationInfo.bay}-S${locationInfo.shelf}-P${locationInfo.position}`;
  // Center the text vertically
  ctx.fillText(locationText, textXPosition, dimensions.heightPx / 2 + 6);
  
  // Add status if available
  if (locationInfo.status) {
    ctx.font = '10px Arial';
    ctx.fillText(`Status: ${locationInfo.status}`, textXPosition, dimensions.heightPx / 2 + 20);
  }
  
  // Add section label if available
  if (locationInfo.section) {
    ctx.font = '10px Arial';
    ctx.fillText(`Section: ${locationInfo.section}`, textXPosition, dimensions.heightPx / 2 - 10);
  }
  
  return canvas.toBuffer('image/png');
}

/**
 * Save a label image to file
 * @param {Buffer} imageBuffer - The label image buffer
 * @param {string} fileName - Base file name
 * @param {string} outputDir - Directory to save the image
 * @returns {Promise<string>} - Path to the saved file
 */
async function saveLabelImage(imageBuffer, fileName, outputDir = 'public/labels') {
  try {
    // Create output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });
    
    // Generate file path
    const filePath = path.join(outputDir, `${fileName}.png`);
    
    // Save the buffer to file
    await fs.writeFile(filePath, imageBuffer);
    
    return filePath;
  } catch (error) {
    console.error('Error saving label image:', error);
    throw error;
  }
}

/**
 * Generate a drive label and save it
 * @param {Object} driveInfo - Information about the drive
 * @param {boolean} saveToFile - Whether to save the label to file
 * @param {Object} options - Label options
 * @returns {Promise<Object>} - Result with label data and file path
 */
async function generateDriveLabel(driveInfo, saveToFile = true, options = {}) {
  try {
    const labelBuffer = await createDriveLabel(driveInfo, options);
    
    let filePath = null;
    if (saveToFile) {
      const fileName = `drive-${driveInfo.driveId}`;
      filePath = await saveLabelImage(labelBuffer, fileName, options.outputDir);
    }
    
    return {
      success: true,
      labelBuffer,
      filePath,
      dataUrl: `data:image/png;base64,${labelBuffer.toString('base64')}`
    };
  } catch (error) {
    console.error('Error generating drive label:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate a location label and save it
 * @param {Object} locationInfo - Information about the location
 * @param {boolean} saveToFile - Whether to save the label to file
 * @param {Object} options - Label options
 * @returns {Promise<Object>} - Result with label data and file path
 */
async function generateLocationLabel(locationInfo, saveToFile = true, options = {}) {
  try {
    const labelBuffer = await createLocationLabel(locationInfo, options);
    
    let filePath = null;
    if (saveToFile) {
      const fileName = `location-${locationInfo.id}`;
      filePath = await saveLabelImage(labelBuffer, fileName, options.outputDir);
    }
    
    return {
      success: true,
      labelBuffer,
      filePath,
      dataUrl: `data:image/png;base64,${labelBuffer.toString('base64')}`
    };
  } catch (error) {
    console.error('Error generating location label:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate a batch of labels
 * @param {Array} items - Array of items to generate labels for
 * @param {Object} options - Options for label generation
 * @returns {Promise<Object>} - Result with generated labels
 */
async function generateLabelBatch(items, options = {}) {
  const results = {
    success: true,
    labels: [],
    errors: []
  };
  
  for (const item of items) {
    try {
      let result;
      
      if (item.type === 'drive') {
        result = await generateDriveLabel(item.data, true, options);
      } else if (item.type === 'location') {
        result = await generateLocationLabel(item.data, true, options);
      } else {
        throw new Error(`Unknown item type: ${item.type}`);
      }
      
      if (result.success) {
        results.labels.push({
          id: item.data.id || item.data.driveId || item.data.location_id,
          type: item.type,
          filePath: result.filePath,
          dataUrl: result.dataUrl
        });
      } else {
        results.errors.push({
          id: item.data.id || item.data.driveId || item.data.location_id,
          type: item.type,
          error: result.error
        });
      }
    } catch (error) {
      results.errors.push({
        id: item.data?.id || 'unknown',
        type: item.type || 'unknown',
        error: error.message
      });
    }
  }
  
  if (results.errors.length > 0 && results.labels.length === 0) {
    results.success = false;
  }
  
  return results;
}

module.exports = {
  createDriveLabel,
  createLocationLabel,
  generateDriveLabel,
  generateLocationLabel,
  generateLabelBatch,
  saveLabelImage,
  LABEL_DIMENSIONS
};