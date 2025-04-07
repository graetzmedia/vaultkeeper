/**
 * Drive Location Assignment Tool
 * 
 * This script assigns a drive to a specific shelf location and
 * generates labels for both the drive and location.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const readline = require('readline');

// Import models and utils
let StorageDrive, PhysicalLocation, labelGenerator;

// Create readline interface for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Connect to MongoDB
async function connectToDatabase() {
  try {
    // Get connection string from environment or use default
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/vaultkeeper';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
    
    // Import models after connection is established
    StorageDrive = require('../src/backend/models/storageDrive');
    PhysicalLocation = require('../src/backend/models/physicalLocation');
    labelGenerator = require('../src/backend/utils/label-generator');
    
    return true;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    return false;
  }
}

// Get drive by ID or name
async function getDrive(driveIdentifier) {
  try {
    // Try to find by ID first
    let drive = await StorageDrive.findOne({ driveId: driveIdentifier });
    
    // If not found, try by name
    if (!drive) {
      drive = await StorageDrive.findOne({ name: driveIdentifier });
    }
    
    return drive;
  } catch (error) {
    console.error('Error finding drive:', error.message);
    return null;
  }
}

// Get or create a location
async function getOrCreateLocation(bay, shelf, position) {
  try {
    // Try to find existing location
    let location = await PhysicalLocation.findOne({
      bay: parseInt(bay),
      shelf: parseInt(shelf),
      position: parseInt(position)
    });
    
    // If not found, create it
    if (!location) {
      console.log(`Location B${bay}-S${shelf}-P${position} not found, creating it...`);
      location = new PhysicalLocation({
        bay: parseInt(bay),
        shelf: parseInt(shelf),
        position: parseInt(position),
        status: 'EMPTY'
      });
      await location.save();
      console.log(`Created new location: B${bay}-S${shelf}-P${position}`);
    }
    
    return location;
  } catch (error) {
    console.error('Error with location:', error.message);
    return null;
  }
}

// Assign a drive to a location
async function assignDriveToLocation(drive, location) {
  try {
    // Check if location is available
    if (location.status === 'OCCUPIED' && location.occupiedBy !== drive.driveId) {
      console.log(`Location ${location.locationId} is already occupied by drive ${location.occupiedBy}`);
      const override = await prompt('Do you want to override this assignment? (y/n): ');
      if (override.toLowerCase() !== 'y') {
        return false;
      }
    }
    
    // Update location
    location.status = 'OCCUPIED';
    location.occupiedBy = drive.driveId;
    await location.save();
    
    // Update drive
    drive.location = location.locationId;
    await drive.save();
    
    console.log(`Drive ${drive.name} (${drive.driveId}) assigned to location ${location.locationId}`);
    return true;
  } catch (error) {
    console.error('Error assigning drive to location:', error.message);
    return false;
  }
}

// Generate and print labels
async function generateLabels(drive, location) {
  try {
    console.log('Generating labels...');
    
    const outputDir = path.join(__dirname, '..', 'public', 'labels');
    
    // Get drive media stats
    const mediaStats = {};
    if (drive.fileCount > 0) {
      try {
        const stats = await drive.getUsageStats();
        if (stats.success && stats.stats.byType) {
          stats.stats.byType.forEach(item => {
            mediaStats[item._id] = item.count;
          });
        }
      } catch (err) {
        console.log('Could not get detailed media stats, using basic stats');
        mediaStats['Files'] = drive.fileCount;
      }
    }
    
    // Prepare drive info for label
    const driveInfo = {
      driveId: drive.driveId,
      name: drive.name,
      rootFolders: drive.rootFolders || [],
      mediaStats: mediaStats,
      createdAt: drive.createdAt
    };
    
    // Generate drive label
    const driveResult = await labelGenerator.generateDriveLabel(driveInfo, true, {
      outputDir
    });
    
    if (driveResult.success) {
      console.log(`Generated drive label: ${driveResult.filePath}`);
    } else {
      console.error('Failed to generate drive label:', driveResult.error);
    }
    
    // Generate location label
    const locationResult = await labelGenerator.generateLocationLabel(location, true, {
      outputDir
    });
    
    if (locationResult.success) {
      console.log(`Generated location label: ${locationResult.filePath}`);
    } else {
      console.error('Failed to generate location label:', locationResult.error);
    }
    
    // Provide instructions for printing
    console.log('\nLabel files have been generated.');
    console.log('You can print them using:');
    console.log('1. NIIMBOT mobile app - import the PNG files to your device');
    console.log('2. Direct printing if you have set up the printer connection');
    
    // Mark labels as printed
    drive.physicalLabel = true;
    await drive.save();
    
    location.labelPrinted = true;
    await location.save();
    
    return {
      driveLabel: driveResult.filePath,
      locationLabel: locationResult.filePath
    };
  } catch (error) {
    console.error('Error generating labels:', error.message);
    return null;
  }
}

// Main function
async function main() {
  try {
    // Connect to database
    const connected = await connectToDatabase();
    if (!connected) {
      process.exit(1);
    }
    
    console.log('\n=== VaultKeeper Drive Location Assignment Tool ===\n');
    
    // Get drive ID or name
    const driveIdentifier = await prompt('Enter drive ID or name: ');
    const drive = await getDrive(driveIdentifier);
    
    if (!drive) {
      console.error(`Drive "${driveIdentifier}" not found.`);
      process.exit(1);
    }
    
    console.log(`Found drive: ${drive.name} (${drive.driveId})`);
    
    // Get location details
    console.log('\nEnter location details (Bay-Shelf-Position):');
    const bay = await prompt('Bay number: ');
    const shelf = await prompt('Shelf number: ');
    const position = await prompt('Position number: ');
    
    // Get or create location
    const location = await getOrCreateLocation(bay, shelf, position);
    if (!location) {
      console.error('Could not get or create location.');
      process.exit(1);
    }
    
    // Assign drive to location
    const assigned = await assignDriveToLocation(drive, location);
    if (!assigned) {
      console.log('Location assignment cancelled or failed.');
      process.exit(1);
    }
    
    // Generate labels
    const labels = await generateLabels(drive, location);
    
    console.log('\nDrive location assignment completed successfully!');
    
    // Close readline interface and MongoDB connection
    rl.close();
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

// Run the main function
main();