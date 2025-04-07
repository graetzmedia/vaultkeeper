/**
 * Test script for generating sample drive and location labels
 * 
 * This script creates sample labels for testing the label layout and design
 * without needing to catalog actual drives or set up locations.
 */

const path = require('path');
const fs = require('fs').promises;
const labelGenerator = require('../src/backend/utils/label-generator');

async function main() {
  console.log('Generating sample drive and location labels...');
  
  const outputDir = path.join(__dirname, '..', 'public', 'labels', 'samples');
  
  // Ensure output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  } catch (err) {
    console.log(`Output directory already exists: ${outputDir}`);
  }
  
  // Generate sample drive label
  const sampleDriveInfo = {
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
  };
  
  const driveResult = await labelGenerator.generateDriveLabel(sampleDriveInfo, true, {
    outputDir
  });
  
  if (driveResult.success) {
    console.log(`Generated sample drive label: ${driveResult.filePath}`);
  } else {
    console.error('Failed to generate drive label:', driveResult.error);
  }
  
  // Generate sample location labels
  const locationSamples = [
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
      bay: 2,
      shelf: 4,
      position: 7,
      status: 'OCCUPIED',
      section: 'Documentary Footage'
    }
  ];
  
  for (const [i, location] of locationSamples.entries()) {
    const locationResult = await labelGenerator.generateLocationLabel(location, true, {
      outputDir
    });
    
    if (locationResult.success) {
      console.log(`Generated sample location label ${i+1}: ${locationResult.filePath}`);
    } else {
      console.error(`Failed to generate location label ${i+1}:`, locationResult.error);
    }
  }
  
  // Generate a batch with mixed types
  const batchItems = [
    {
      type: 'drive',
      data: {
        driveId: 'BATCH-001',
        name: 'Batch Test Drive',
        rootFolders: ['Client X', 'Client Y'],
        mediaStats: {
          'Video': 42,
          'Photos': 128
        },
        createdAt: new Date()
      }
    },
    {
      type: 'location',
      data: {
        id: 'BATCH-LOC',
        bay: 3,
        shelf: 1,
        position: 2,
        status: 'RESERVED'
      }
    }
  ];
  
  const batchResult = await labelGenerator.generateLabelBatch(batchItems, {
    outputDir
  });
  
  if (batchResult.success) {
    console.log(`Generated ${batchResult.labels.length} labels in batch`);
    batchResult.labels.forEach(label => {
      console.log(`  - ${label.type}: ${label.filePath}`);
    });
  } else {
    console.error('Failed to generate batch labels:', batchResult.errors);
  }
  
  console.log('\nAll sample labels have been generated!');
  console.log(`You can view them in: ${outputDir}`);
  console.log('Copy these to your mobile device for testing with the NIIMBOT app');
}

main().catch(err => {
  console.error('Error generating sample labels:', err);
});