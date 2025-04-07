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

// Generate drive labels CSV specifically formatted for Niimbot app
async function generateDriveLabelsCSV(drives, outputPath) {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Create CSV header - using fields that the Niimbot app can use for label layout
    // Each field will be available as a variable in the Niimbot app template
    let csv = "Drive_ID,Drive_Name,Root_Folders,Media_Stats,Date_Added,QR_Code_Data,Label_Text\n";
    
    // Process each drive
    for (const drive of drives) {
      // Generate QR code data
      const qrData = JSON.stringify({
        type: 'drive',
        id: drive.driveId || drive._id?.toString(),
        uuid: drive.uuid || '',
        name: drive.name
      });
      
      // Get root folders as a newline-separated string for display
      let rootFolders = '';
      if (drive.rootFolders && drive.rootFolders.length > 0) {
        rootFolders = drive.rootFolders.slice(0, 3).join('\\n');
      } else {
        rootFolders = 'No folders';
      }
      
      // Format media stats with newlines
      let mediaStats = '';
      if (drive.mediaStats) {
        mediaStats = Object.entries(drive.mediaStats)
          .slice(0, 3) // Limit to top 3 stats
          .map(([type, count]) => `${type}: ${count}`)
          .join('\\n');
      } else if (drive.fileCount) {
        mediaStats = `Files: ${drive.fileCount}`;
      }
      
      // Format date
      const date = drive.createdAt ? 
        new Date(drive.createdAt).toLocaleDateString() : 
        new Date().toLocaleDateString();
      
      // Create a single formatted text field for the label
      // This will be used if the Niimbot app doesn't support multiple text fields
      const labelText = `${drive.name || 'Unnamed Drive'}\\n` +
                       `ID: ${drive.driveId || drive._id?.toString() || 'Unknown'}\\n` +
                       `${rootFolders}\\n` +
                       `${mediaStats}\\n` +
                       `Added: ${date}`;
      
      // Add row to CSV
      // Escape fields with double quotes to handle commas in the data
      csv += `"${drive.driveId || drive._id?.toString() || 'DR-' + Math.floor(Math.random() * 10000)}",` + 
             `"${drive.name || 'Unnamed Drive'}",` +
             `"${rootFolders}",` +
             `"${mediaStats}",` +
             `"${date}",` +
             `"${qrData}",` +
             `"${labelText}"\n`;
    }
    
    // Write CSV file
    await fs.writeFile(outputPath, csv, 'utf8');
    console.log(`Drive labels CSV saved to: ${outputPath}`);
    
    // Also save a simplified version with just the essentials
    const simplePath = outputPath.replace('.csv', '_simple.csv');
    let simpleCSV = "Drive_Name,Root_Folders,QR_Code_Data\n";
    
    // Process each drive for simple CSV
    for (const drive of drives) {
      const qrData = JSON.stringify({
        type: 'drive',
        id: drive.driveId || drive._id?.toString(),
        name: drive.name
      });
      
      let rootFolders = '';
      if (drive.rootFolders && drive.rootFolders.length > 0) {
        rootFolders = drive.rootFolders.slice(0, 3).join(' | ');
      }
      
      simpleCSV += `"${drive.name || 'Unnamed Drive'}","${rootFolders}","${qrData}"\n`;
    }
    
    await fs.writeFile(simplePath, simpleCSV, 'utf8');
    console.log(`Simplified drive labels CSV saved to: ${simplePath}`);
    
    return outputPath;
  } catch (error) {
    console.error('Error generating drive labels CSV:', error);
    throw error;
  }
}

// Generate location labels CSV specifically formatted for Niimbot app
async function generateLocationLabelsCSV(locations, outputPath) {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Create CSV header - using fields that the Niimbot app can use for label layout
    let csv = "Location_ID,Bay,Shelf,Position,Status,Section,QR_Code_Data,Label_Text\n";
    
    // Process each location
    for (const location of locations) {
      // Generate QR code data
      const qrData = JSON.stringify({
        type: 'location',
        id: location._id?.toString() || location.id,
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
      csv += `"${locationId}",` +
             `"${location.bay}",` +
             `"${location.shelf}",` +
             `"${location.position}",` +
             `"${location.status || 'EMPTY'}",` +
             `"${section}",` +
             `"${qrData}",` +
             `"${labelText}"\n`;
    }
    
    // Write CSV file
    await fs.writeFile(outputPath, csv, 'utf8');
    console.log(`Location labels CSV saved to: ${outputPath}`);
    
    // Also save a simplified version with just the essentials
    const simplePath = outputPath.replace('.csv', '_simple.csv');
    let simpleCSV = "Location_ID,Status,QR_Code_Data\n";
    
    // Process each location for simple CSV
    for (const location of locations) {
      const locationId = `B${location.bay}-S${location.shelf}-P${location.position}`;
      
      const qrData = JSON.stringify({
        type: 'location',
        id: location._id?.toString() || location.id,
        bay: location.bay,
        shelf: location.shelf,
        position: location.position
      });
      
      simpleCSV += `"${locationId}","${location.status || 'EMPTY'}","${qrData}"\n`;
    }
    
    await fs.writeFile(simplePath, simpleCSV, 'utf8');
    console.log(`Simplified location labels CSV saved to: ${simplePath}`);
    
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
        // Generate meaningful sample drive data
        drives = [
          {
            driveId: 'RED-001',
            name: 'RED REEL 2024',
            rootFolders: [
              'ACME - Commercial',
              'GlobalCorp - Documentary',
              'Personal Projects'
            ],
            mediaStats: {
              'R3D Video': 145,
              'ProRes Video': 53,
              'Audio': 76
            },
            fileCount: 274,
            createdAt: new Date()
          },
          {
            driveId: 'ARC-2023-Q4',
            name: 'Archive Q4 2023',
            rootFolders: [
              'Cityscape Documentary',
              'Wildlife Series',
              'Commercial Spots'
            ],
            mediaStats: {
              'Video': 412,
              'Photos': 873,
              'Audio': 124
            },
            fileCount: 1409,
            createdAt: new Date(2023, 11, 15)
          },
          {
            driveId: 'PRO-005',
            name: 'Client XYZ Project',
            rootFolders: [
              'Footage',
              'Audio',
              'Graphics'
            ],
            mediaStats: {
              'RAW Video': 85,
              'ProRes': 42,
              'WAV Audio': 120
            },
            fileCount: 247,
            createdAt: new Date(2024, 2, 10)
          },
          {
            driveId: 'BU-2024-03',
            name: 'March 2024 Backup',
            rootFolders: [
              'Client Projects',
              'Stock Footage',
              'Music Library'
            ],
            mediaStats: {
              'Archives': 15,
              'Video': 230,
              'Audio': 540
            },
            fileCount: 785,
            createdAt: new Date(2024, 3, 1)
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
        // Generate realistic sample location data
        locations = [
          {
            id: 'LOC001',
            bay: 1,
            shelf: 1,
            position: 1,
            status: 'EMPTY',
            section: 'Commercial Projects'
          },
          {
            id: 'LOC002',
            bay: 1,
            shelf: 1,
            position: 2,
            status: 'OCCUPIED',
            section: 'Commercial Projects',
            occupiedBy: 'RED-001'
          },
          {
            id: 'LOC003',
            bay: 1,
            shelf: 2,
            position: 1,
            status: 'OCCUPIED',
            section: 'Commercial Projects',
            occupiedBy: 'ARC-2023-Q4'
          },
          {
            id: 'LOC004',
            bay: 1,
            shelf: 2,
            position: 2,
            status: 'EMPTY',
            section: 'Commercial Projects'
          },
          {
            id: 'LOC005',
            bay: 2,
            shelf: 1,
            position: 1,
            status: 'RESERVED',
            section: 'Documentary Projects'
          },
          {
            id: 'LOC006',
            bay: 2,
            shelf: 1,
            position: 2,
            status: 'OCCUPIED',
            section: 'Documentary Projects',
            occupiedBy: 'PRO-005'
          },
          {
            id: 'LOC007',
            bay: 2,
            shelf: 2,
            position: 1,
            status: 'OCCUPIED',
            section: 'Documentary Projects',
            occupiedBy: 'BU-2024-03'
          },
          {
            id: 'LOC008',
            bay: 2,
            shelf: 2,
            position: 2,
            status: 'EMPTY',
            section: 'Documentary Projects'
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
    console.log('\nFiles generated:');
    console.log('1. Full CSV with all data fields');
    console.log('2. Simple CSV with just essential fields for cleaner layouts');
    
    console.log('\nInstructions for using with Niimbot app:');
    console.log('1. Transfer the CSV file(s) to your mobile device');
    console.log('2. Open the Niimbot app');
    console.log('3. Select "Import" or "Excel/CSV" in the label creation menu');
    console.log('4. Choose the CSV file (try both the full and simple versions)');
    console.log('5. Configure the label layout in the app:');
    console.log('   - For Drive Labels: Place QR code on left, root folders and drive name in largest font on right');
    console.log('   - For Location Labels: Place QR code on left, location ID (e.g., B1-S2-P3) in largest font on right');
    console.log('6. Available fields in full CSV:');
    console.log('   - Drive Labels: Drive_ID, Drive_Name, Root_Folders, Media_Stats, Date_Added, QR_Code_Data, Label_Text');
    console.log('   - Location Labels: Location_ID, Bay, Shelf, Position, Status, Section, QR_Code_Data, Label_Text');
    console.log('7. If your app supports it, create a template and save it for future use');
    console.log('8. Print your labels!');
    
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