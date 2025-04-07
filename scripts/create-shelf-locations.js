/**
 * Shelf Location Generator
 * 
 * This script creates a batch of physical locations for a shelf or bay
 * and generates labels for them.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const readline = require('readline');

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
    return true;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    return false;
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
    
    // Load models after connection is established
    const PhysicalLocation = require('../src/backend/models/physicalLocation');
    const labelGenerator = require('../src/backend/utils/label-generator');
    
    console.log('\n=== VaultKeeper Shelf Location Generator ===\n');
    
    // Get bay number
    const bayInput = await prompt('Enter bay number: ');
    const bay = parseInt(bayInput);
    
    if (isNaN(bay) || bay < 1) {
      console.error('Invalid bay number. Must be a positive integer.');
      process.exit(1);
    }
    
    // Get shelf information
    console.log('\nShelf Range Options:');
    console.log('1. Single shelf (e.g., just shelf 3)');
    console.log('2. Range of shelves (e.g., shelves 1-5)');
    const shelfOption = await prompt('Enter option (1 or 2): ');
    
    let shelfStart, shelfEnd;
    
    if (shelfOption === '1') {
      const shelf = parseInt(await prompt('Enter shelf number: '));
      if (isNaN(shelf) || shelf < 1) {
        console.error('Invalid shelf number. Must be a positive integer.');
        process.exit(1);
      }
      shelfStart = shelfEnd = shelf;
    } else if (shelfOption === '2') {
      shelfStart = parseInt(await prompt('Enter starting shelf number: '));
      shelfEnd = parseInt(await prompt('Enter ending shelf number: '));
      if (isNaN(shelfStart) || isNaN(shelfEnd) || shelfStart < 1 || shelfEnd < shelfStart) {
        console.error('Invalid shelf range. Start must be a positive integer and end must be >= start.');
        process.exit(1);
      }
    } else {
      console.error('Invalid option. Must be 1 or 2.');
      process.exit(1);
    }
    
    // Get positions per shelf
    const positionsPerShelf = parseInt(await prompt('Enter number of positions per shelf: '));
    if (isNaN(positionsPerShelf) || positionsPerShelf < 1) {
      console.error('Invalid number of positions. Must be a positive integer.');
      process.exit(1);
    }
    
    // Optional section name
    const sectionName = await prompt('Enter optional section name (e.g., "Documentary Projects", leave blank for none): ');
    
    // Confirmation
    const totalLocations = (shelfEnd - shelfStart + 1) * positionsPerShelf;
    console.log(`\nThis will create ${totalLocations} locations:`);
    console.log(`- Bay: ${bay}`);
    console.log(`- Shelves: ${shelfStart === shelfEnd ? shelfStart : `${shelfStart} to ${shelfEnd}`}`);
    console.log(`- Positions per shelf: ${positionsPerShelf}`);
    if (sectionName) {
      console.log(`- Section: "${sectionName}"`);
    }
    
    const confirm = await prompt('\nProceed with creation? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('Operation cancelled.');
      process.exit(0);
    }
    
    // Create locations
    console.log('\nCreating locations...');
    
    const locations = [];
    let existingCount = 0;
    
    for (let shelf = shelfStart; shelf <= shelfEnd; shelf++) {
      for (let position = 1; position <= positionsPerShelf; position++) {
        // Check if location already exists
        const existingLocation = await PhysicalLocation.findOne({
          bay,
          shelf,
          position
        });
        
        if (existingLocation) {
          console.log(`Location B${bay}-S${shelf}-P${position} already exists, skipping.`);
          existingCount++;
          continue;
        }
        
        // Create new location
        const location = new PhysicalLocation({
          bay,
          shelf,
          position,
          status: 'EMPTY',
          section: sectionName || undefined,
          tags: sectionName ? [sectionName] : []
        });
        
        await location.save();
        locations.push(location);
        console.log(`Created location: B${bay}-S${shelf}-P${position}`);
      }
    }
    
    console.log(`\nCreated ${locations.length} new locations. ${existingCount} already existed.`);
    
    // Ask if they want to generate labels
    const generateLabels = await prompt('Generate labels for the new locations? (y/n): ');
    if (generateLabels.toLowerCase() === 'y') {
      console.log('\nGenerating labels...');
      
      const outputDir = path.join(__dirname, '..', 'public', 'labels', 'locations', `bay-${bay}`);
      
      // Ensure output directory exists
      try {
        await fs.mkdir(outputDir, { recursive: true });
      } catch (err) {
        // Ignore if directory already exists
      }
      
      // Generate labels in batches to avoid memory issues
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < locations.length; i += batchSize) {
        batches.push(locations.slice(i, i + batchSize));
      }
      
      let successCount = 0;
      
      for (const [index, batch] of batches.entries()) {
        console.log(`Processing batch ${index + 1} of ${batches.length}...`);
        
        const batchItems = batch.map(location => ({
          type: 'location',
          data: {
            id: location._id.toString(),
            bay: location.bay,
            shelf: location.shelf,
            position: location.position,
            status: location.status,
            section: location.section
          }
        }));
        
        const result = await labelGenerator.generateLabelBatch(batchItems, {
          outputDir
        });
        
        if (result.success) {
          successCount += result.labels.length;
        }
      }
      
      console.log(`\nGenerated ${successCount} location labels.`);
      console.log(`Labels saved to: ${outputDir}`);
      
      // Provide instructions for Niimbot printing
      const niimbotInfo = require('../src/backend/utils/niimbot-printer');
      console.log('\nPrinting Instructions:');
      console.log(niimbotInfo.getManualPrintingInstructions());
    }
    
    console.log('\nOperation completed successfully!');
    
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