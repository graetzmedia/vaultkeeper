/**
 * Label Spreadsheet Generator
 * 
 * This script generates CSV files for drive and location labels that can be
 * imported into the Niimbot app for printing.
 */

const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const readline = require('readline');

// Create readline interface
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
    return true;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    return false;
  }
}

// Generate QR code as data URL
async function generateQRCodeDataURL(data) {
  const qrOptions = {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 200,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  };

  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  return await QRCode.toDataURL(dataString, qrOptions);
}

// Generate drive labels CSV
async function generateDriveLabelsCSV(drives, outputPath) {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Create CSV header
    let csv = "Drive ID,Drive Name,Root Folders,Media Stats,Date Added,QR Code URL\n";
    
    // Process each drive
    for (const drive of drives) {
      // Generate QR code data
      const qrData = {
        type: 'drive',
        id: drive.driveId,
        uuid: drive.uuid || '',
        name: drive.name,
        date: drive.createdAt?.toISOString() || new Date().toISOString()
      };
      
      // Get root folders as a comma-separated string
      const rootFolders = drive.rootFolders?.join(', ') || '';
      
      // Format media stats
      let mediaStats = '';
      if (drive.mediaStats) {
        mediaStats = Object.entries(drive.mediaStats)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ');
      }
      
      // Format date
      const date = drive.createdAt ? 
        drive.createdAt.toLocaleDateString() : 
        new Date().toLocaleDateString();
      
      // Generate QR code data URL
      const qrCodeURL = await generateQRCodeDataURL(qrData);
      
      // Add row to CSV
      // Escape fields with double quotes to handle commas in the data
      csv += `"${drive.driveId}","${drive.name}","${rootFolders}","${mediaStats}","${date}","${qrCodeURL}"\n`;
    }
    
    // Write CSV file
    await fs.writeFile(outputPath, csv, 'utf8');
    console.log(`Drive labels CSV saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating drive labels CSV:', error);
    throw error;
  }
}

// Generate location labels CSV
async function generateLocationLabelsCSV(locations, outputPath) {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Create CSV header
    let csv = "Location ID,Bay,Shelf,Position,Status,Section,QR Code URL\n";
    
    // Process each location
    for (const location of locations) {
      // Generate QR code data
      const qrData = {
        type: 'location',
        id: location._id?.toString() || location.id,
        bay: location.bay,
        shelf: location.shelf,
        position: location.position
      };
      
      // Generate location ID
      const locationId = `B${location.bay}-S${location.shelf}-P${location.position}`;
      
      // Generate QR code data URL
      const qrCodeURL = await generateQRCodeDataURL(qrData);
      
      // Add row to CSV
      csv += `"${locationId}","${location.bay}","${location.shelf}","${location.position}","${location.status || 'EMPTY'}","${location.section || ''}","${qrCodeURL}"\n`;
    }
    
    // Write CSV file
    await fs.writeFile(outputPath, csv, 'utf8');
    console.log(`Location labels CSV saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error generating location labels CSV:', error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log('\n=== VaultKeeper Label Spreadsheet Generator ===\n');
    
    // Ask for label type
    const labelType = await prompt('Which labels do you want to generate?\n1. Drive labels\n2. Location labels\n3. Both\nEnter choice (1-3): ');
    
    if (!['1', '2', '3'].includes(labelType)) {
      console.error('Invalid choice. Please select 1, 2, or 3.');
      process.exit(1);
    }
    
    // Connect to database if using real data
    const useTestData = await prompt('Use test data instead of database? (y/n): ');
    
    let StorageDrive, PhysicalLocation;
    if (useTestData.toLowerCase() !== 'y') {
      const connected = await connectToDatabase();
      if (!connected) {
        process.exit(1);
      }
      
      // Import models
      StorageDrive = require('../src/backend/models/storageDrive');
      PhysicalLocation = require('../src/backend/models/physicalLocation');
    }
    
    // Output directory
    const outputDir = path.join(__dirname, '..', 'public', 'labels', 'spreadsheets');
    
    // Generate drive labels
    if (['1', '3'].includes(labelType)) {
      let drives;
      
      if (useTestData.toLowerCase() === 'y') {
        // Generate sample drive data
        drives = [
          {
            driveId: 'SAMPLE-001',
            name: 'Sample Media Drive',
            rootFolders: [
              'Client A - Project X',
              'Client B - Commercial',
              'Client C - Documentary',
              'Personal Projects'
            ],
            mediaStats: {
              'R3D Video': 145,
              'ProRes Video': 53,
              'RAW Photos': 1289,
              'Audio Files': 76,
              'Documents': 28
            },
            createdAt: new Date()
          },
          {
            driveId: 'SAMPLE-002',
            name: 'Archive Drive 2023',
            rootFolders: [
              'Project Alpha',
              'Project Beta',
              'Special Effects'
            ],
            mediaStats: {
              'Video': 412,
              'Photos': 873,
              'Audio': 124
            },
            createdAt: new Date(2023, 5, 15)
          }
        ];
      } else {
        // Get drives from database
        const driveCount = await prompt('How many drives to include? (Enter a number or "all"): ');
        
        let query = {};
        
        if (driveCount.toLowerCase() === 'all') {
          drives = await StorageDrive.find(query);
        } else {
          const limit = parseInt(driveCount);
          if (isNaN(limit) || limit < 1) {
            console.error('Invalid number. Please enter a positive number or "all".');
            process.exit(1);
          }
          
          drives = await StorageDrive.find(query).limit(limit);
        }
        
        // Scan root folders if needed
        for (const drive of drives) {
          if (!drive.rootFolders || drive.rootFolders.length === 0) {
            try {
              await drive.scanRootFolders();
            } catch (err) {
              console.warn(`Could not scan root folders for drive ${drive.name}: ${err.message}`);
            }
          }
        }
      }
      
      // Generate CSV
      const driveOutputPath = path.join(outputDir, `drive_labels_${new Date().toISOString().replace(/:/g, '-')}.csv`);
      await generateDriveLabelsCSV(drives, driveOutputPath);
    }
    
    // Generate location labels
    if (['2', '3'].includes(labelType)) {
      let locations;
      
      if (useTestData.toLowerCase() === 'y') {
        // Generate sample location data
        locations = [
          {
            id: 'LOC001',
            bay: 1,
            shelf: 2,
            position: 3,
            status: 'EMPTY',
            section: 'Commercial Projects'
          },
          {
            id: 'LOC002',
            bay: 1,
            shelf: 2,
            position: 4,
            status: 'EMPTY',
            section: 'Commercial Projects'
          },
          {
            id: 'LOC003',
            bay: 2,
            shelf: 1,
            position: 1,
            status: 'OCCUPIED',
            section: 'Documentary Footage'
          }
        ];
      } else {
        // Generate locations or get from database
        console.log('\nLocation Options:');
        console.log('1. Get existing locations from database');
        console.log('2. Generate a range of locations');
        
        const locationOption = await prompt('Enter choice (1-2): ');
        
        if (locationOption === '1') {
          // Get from database
          const locationCount = await prompt('How many locations to include? (Enter a number or "all"): ');
          
          let query = {};
          
          if (locationCount.toLowerCase() === 'all') {
            locations = await PhysicalLocation.find(query);
          } else {
            const limit = parseInt(locationCount);
            if (isNaN(limit) || limit < 1) {
              console.error('Invalid number. Please enter a positive number or "all".');
              process.exit(1);
            }
            
            locations = await PhysicalLocation.find(query).limit(limit);
          }
        } else if (locationOption === '2') {
          // Generate a range
          const bay = parseInt(await prompt('Enter bay number: '));
          const shelfStart = parseInt(await prompt('Enter starting shelf number: '));
          const shelfEnd = parseInt(await prompt('Enter ending shelf number (or same as start for single shelf): '));
          const positionsPerShelf = parseInt(await prompt('Enter number of positions per shelf: '));
          const section = await prompt('Enter section name (optional): ');
          
          if (isNaN(bay) || isNaN(shelfStart) || isNaN(shelfEnd) || isNaN(positionsPerShelf) ||
              bay < 1 || shelfStart < 1 || shelfEnd < shelfStart || positionsPerShelf < 1) {
            console.error('Invalid input. Please enter positive numbers with ending shelf >= starting shelf.');
            process.exit(1);
          }
          
          // Generate location array
          locations = [];
          for (let shelf = shelfStart; shelf <= shelfEnd; shelf++) {
            for (let position = 1; position <= positionsPerShelf; position++) {
              locations.push({
                id: `B${bay}-S${shelf}-P${position}`,
                bay,
                shelf,
                position,
                status: 'EMPTY',
                section: section || ''
              });
            }
          }
        } else {
          console.error('Invalid choice. Please select 1 or 2.');
          process.exit(1);
        }
      }
      
      // Generate CSV
      const locationOutputPath = path.join(outputDir, `location_labels_${new Date().toISOString().replace(/:/g, '-')}.csv`);
      await generateLocationLabelsCSV(locations, locationOutputPath);
    }
    
    console.log('\nLabel spreadsheets generated successfully!');
    console.log('\nInstructions for using with Niimbot app:');
    console.log('1. Transfer the CSV file(s) to your mobile device');
    console.log('2. Open the Niimbot app');
    console.log('3. Select "Import" or "Excel/CSV" in the label creation menu');
    console.log('4. Select the CSV file');
    console.log('5. Configure the label layout in the app');
    console.log('6. Print your labels');
    
    // Close connections
    rl.close();
    if (useTestData.toLowerCase() !== 'y') {
      await mongoose.connection.close();
    }
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

// Run the script
main();