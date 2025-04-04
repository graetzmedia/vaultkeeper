/**
 * NIIMBOT Printer Integration for VaultKeeper
 * 
 * This module provides integration with NIIMBOT thermal label printers (B1/D101 models)
 * for printing drive and location labels.
 * 
 * Note: Direct printing depends on platform-specific dependencies and Bluetooth access.
 * As a fallback, it supports generating label PNG files for manual printing.
 */

const { SerialPort } = require('serialport');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// NIIMBOT D101 printer info
const PRINTER_INFO = {
  B1: {
    name: 'NIIMBOT B1',
    width: 15, // mm
    dpi: 200
  },
  D101: {
    name: 'NIIMBOT D101',
    width: 20, // mm
    dpi: 300
  }
};

/**
 * NIIMBOT Printer class for handling label printing
 */
class NiimbotPrinter {
  constructor(options = {}) {
    this.options = {
      model: 'D101',
      deviceId: null,
      port: null,
      ...options
    };
    
    this.connected = false;
    this.serialPort = null;
    this.printerInfo = PRINTER_INFO[this.options.model] || PRINTER_INFO.D101;
  }
  
  /**
   * Discover available NIIMBOT printers
   * @returns {Promise<Array>} List of discovered printers
   */
  async discoverPrinters() {
    try {
      // This implementation depends on the platform
      const platform = process.platform;
      let printers = [];
      
      if (platform === 'darwin') { // macOS
        const { stdout } = await exec('system_profiler SPBluetoothDataType | grep -A20 "Printer:"');
        // Parse the output to extract printer info
        // This is simplified and would need to be expanded for production use
        const matches = stdout.matchAll(/Address: ([\w:-]+)[\s\S]*?Name: ([^\n]+)/g);
        for (const match of matches) {
          printers.push({
            id: match[1],
            name: match[2],
            type: 'bluetooth'
          });
        }
      } else if (platform === 'linux') { // Linux
        const { stdout } = await exec('bluetoothctl devices | grep -i "niimbot"');
        const lines = stdout.split('\n').filter(Boolean);
        for (const line of lines) {
          const match = line.match(/Device ([\w:]+) (.+)/);
          if (match) {
            printers.push({
              id: match[1],
              name: match[2],
              type: 'bluetooth'
            });
          }
        }
      } else if (platform === 'win32') { // Windows
        // On Windows, we'd use PowerShell to query Bluetooth devices
        // This is a simplified version
        const { stdout } = await exec(
          'powershell "Get-PnpDevice -Class Bluetooth | Where-Object { $_.FriendlyName -like \"*NIIMBOT*\" } | Select-Object -Property FriendlyName, DeviceID | ConvertTo-Json"'
        );
        const devices = JSON.parse(stdout);
        for (const device of Array.isArray(devices) ? devices : [devices]) {
          printers.push({
            id: device.DeviceID,
            name: device.FriendlyName,
            type: 'bluetooth'
          });
        }
      }
      
      // Also check for serial ports
      const ports = await SerialPort.list();
      for (const port of ports) {
        if (port.manufacturer?.includes('NIIMBOT') || port.productId?.includes('D101')) {
          printers.push({
            id: port.path,
            name: `NIIMBOT (${port.path})`,
            type: 'serial',
            path: port.path
          });
        }
      }
      
      return printers;
    } catch (error) {
      console.error('Error discovering printers:', error);
      return [];
    }
  }
  
  /**
   * Connect to a NIIMBOT printer
   * @param {string} deviceId - Device ID to connect to
   * @returns {Promise<boolean>} Success status
   */
  async connect(deviceId = null) {
    if (deviceId) {
      this.options.deviceId = deviceId;
    }
    
    if (!this.options.deviceId) {
      throw new Error('No printer device ID provided');
    }
    
    try {
      // For USB/Serial connection
      if (this.options.deviceId.includes('COM') || this.options.deviceId.includes('/dev/')) {
        this.serialPort = new SerialPort({
          path: this.options.deviceId,
          baudRate: 115200,
        });
        
        return new Promise((resolve, reject) => {
          this.serialPort.on('open', () => {
            this.connected = true;
            resolve(true);
          });
          
          this.serialPort.on('error', (err) => {
            reject(err);
          });
        });
      }
      
      // For Bluetooth connection, implementation varies by platform
      // This is a placeholder - actual implementation would require platform-specific code
      console.log(`Connecting to Bluetooth printer ${this.options.deviceId}`);
      this.connected = true; // This would be set based on actual connection status
      return true;
    } catch (error) {
      console.error('Error connecting to printer:', error);
      this.connected = false;
      throw error;
    }
  }
  
  /**
   * Disconnect from the printer
   * @returns {Promise<boolean>} Success status
   */
  async disconnect() {
    if (this.serialPort) {
      return new Promise((resolve) => {
        this.serialPort.close(() => {
          this.connected = false;
          this.serialPort = null;
          resolve(true);
        });
      });
    }
    
    // For Bluetooth, implementation varies by platform
    this.connected = false;
    return true;
  }
  
  /**
   * Print a label image
   * @param {Buffer|string} imageData - Image data as buffer or file path
   * @returns {Promise<boolean>} Success status
   */
  async printLabel(imageData) {
    if (!this.connected) {
      throw new Error('Printer not connected');
    }
    
    try {
      // Convert file path to buffer if needed
      let imageBuffer = imageData;
      if (typeof imageData === 'string') {
        imageBuffer = await fs.readFile(imageData);
      }
      
      // For a real implementation, this would convert the image to printer commands
      // and send them to the printer via the appropriate channel
      
      // This is a placeholder for the actual printing implementation
      if (this.serialPort) {
        // Serial port printing (simplified example)
        // Real implementation would format the image according to printer protocol
        const printData = this._formatImageForPrinter(imageBuffer);
        return new Promise((resolve, reject) => {
          this.serialPort.write(printData, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(true);
            }
          });
        });
      } else {
        // Bluetooth printing would be implemented here
        console.log('Bluetooth printing not fully implemented - would send data to printer');
        return true; // Placeholder for actual implementation
      }
    } catch (error) {
      console.error('Error printing label:', error);
      throw error;
    }
  }
  
  /**
   * Format image data for the specific printer model
   * @private
   * @param {Buffer} imageBuffer - Image data buffer
   * @returns {Buffer} Formatted printer commands
   */
  _formatImageForPrinter(imageBuffer) {
    // This is a placeholder - actual implementation would depend on the printer protocol
    // Each printer model has specific command sequences for printing
    
    // For example, NIIMBOT printers typically use ESC/POS or similar commands
    const header = Buffer.from([0x1B, 0x40]); // ESC @ - Initialize printer
    const printCmd = Buffer.from([0x1B, 0x2A, 0x21]); // ESC * ! - Print image command
    
    // In a real implementation, we would:
    // 1. Resize/dither the image to match printer capabilities
    // 2. Convert to printer-specific format
    // 3. Add appropriate command headers/footers
    
    // This is simplified - just a placeholder
    return Buffer.concat([header, printCmd, imageBuffer]);
  }
  
  /**
   * Print multiple labels in a batch
   * @param {Array<Buffer|string>} imageDataArray - Array of image data or file paths
   * @returns {Promise<Object>} Results with success count and errors
   */
  async printBatch(imageDataArray) {
    if (!Array.isArray(imageDataArray) || imageDataArray.length === 0) {
      throw new Error('No images provided for batch printing');
    }
    
    const results = {
      total: imageDataArray.length,
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (let i = 0; i < imageDataArray.length; i++) {
      try {
        await this.printLabel(imageDataArray[i]);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          index: i,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Get printer status
   * @returns {Promise<Object>} Printer status information
   */
  async getStatus() {
    if (!this.connected) {
      return { connected: false, status: 'disconnected' };
    }
    
    try {
      // This is a placeholder - actual implementation would query the printer
      // Different printers have different status commands
      
      if (this.serialPort) {
        // Example: send status query command
        const statusCmd = Buffer.from([0x1B, 0x76]); // ESC v - Status query
        
        return new Promise((resolve, reject) => {
          this.serialPort.write(statusCmd, (err) => {
            if (err) {
              reject(err);
            } else {
              // In a real implementation, we would read the response
              // This is a placeholder
              resolve({
                connected: true,
                status: 'ready',
                model: this.printerInfo.name,
                batteryLevel: 80, // Would come from actual printer
                paperRemaining: 100 // Would come from actual printer
              });
            }
          });
        });
      }
      
      // Bluetooth status query placeholder
      return {
        connected: this.connected,
        status: 'ready', // Placeholder
        model: this.printerInfo.name
      };
    } catch (error) {
      console.error('Error getting printer status:', error);
      return {
        connected: this.connected,
        status: 'error',
        error: error.message
      };
    }
  }
}

/**
 * Helper function to create a printer instance and connect
 * @param {Object} options - Printer options
 * @returns {Promise<NiimbotPrinter>} Connected printer instance
 */
async function createPrinter(options = {}) {
  const printer = new NiimbotPrinter(options);
  
  if (options.deviceId) {
    await printer.connect();
  }
  
  return printer;
}

/**
 * Generate instructions for manual printing with NIIMBOT app
 * @returns {string} Instructions text
 */
function getManualPrintingInstructions() {
  return `
# Manual Printing with NIIMBOT App

If direct printing isn't available, follow these steps to print using the NIIMBOT app:

1. Connect your NIIMBOT printer to your mobile device via Bluetooth
2. Open the NIIMBOT app (available for iOS and Android)
3. In the app, tap "Create Label"
4. Select "Image" as the content type
5. Choose the label image from your gallery
   - You can transfer the generated images from VaultKeeper to your phone
6. Adjust size if needed (labels are designed for ${PRINTER_INFO.D101.width}mm width)
7. Print the label

For batch printing:
1. Export all label images to your phone
2. In the NIIMBOT app, create each label individually
3. Print them in sequence

The labels are saved in the "public/labels" directory of your VaultKeeper installation.
`;
}

module.exports = {
  NiimbotPrinter,
  createPrinter,
  getManualPrintingInstructions,
  PRINTER_INFO
};