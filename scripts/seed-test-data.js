/**
 * Seed script for VaultKeeper test data
 * Run with: node scripts/seed-test-data.js
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');

// Import models
const StorageDrive = require('../src/backend/models/storageDrive');
const MediaAsset = require('../src/backend/models/mediaAsset');
const Project = require('../src/backend/models/project');
const ArchiveJob = require('../src/backend/models/archiveJob');

// Ensure QR code directory exists
const qrCodeDir = path.join(__dirname, '..', 'public', 'qrcodes');
if (!fs.existsSync(qrCodeDir)) {
  fs.mkdirSync(qrCodeDir, { recursive: true });
}

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/vaultkeeper', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');
  seedDatabase();
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Sample data generation
async function seedDatabase() {
  try {
    // Clear existing data
    await Promise.all([
      StorageDrive.deleteMany({}),
      MediaAsset.deleteMany({}),
      Project.deleteMany({}),
      ArchiveJob.deleteMany({})
    ]);
    
    console.log('Database cleared');
    
    // Create projects
    const projects = await Project.insertMany([
      {
        title: 'Corporate Brand Video - XYZ Inc',
        description: 'Annual corporate overview video for XYZ Inc.',
        type: 'corporate',
        client: {
          name: 'XYZ Inc.',
          contactName: 'John Smith',
          email: 'john@xyzinc.com',
          phone: '555-123-4567'
        },
        startDate: new Date('2023-09-01'),
        endDate: new Date('2023-10-15'),
        archiveDate: new Date('2023-10-20'),
        status: 'archived',
        director: 'Jane Doe',
        producer: 'Sam Johnson',
        dop: 'Mike Williams',
        editor: 'Lisa Chen',
        format: '4K',
        frameRate: 24,
        aspectRatio: '16:9',
        deliverables: ['Master File', 'Web Version', 'Social Media Cuts'],
        archivePlan: {
          strategy: 'full',
          retentionPeriod: 60, // 5 years
          notes: 'Retain all raw footage and project files'
        },
        tags: ['Corporate', '4K', '2023'],
        categories: ['Client Work', 'Corporate']
      },
      {
        title: 'Summer Music Festival',
        description: 'Multi-camera coverage of summer music festival',
        type: 'event',
        client: {
          name: 'Festival Productions',
          contactName: 'Alex Rivera',
          email: 'alex@festivalproductions.com',
          phone: '555-987-6543'
        },
        startDate: new Date('2023-07-15'),
        endDate: new Date('2023-07-17'),
        archiveDate: new Date('2023-08-10'),
        status: 'archived',
        director: 'Carlos Diaz',
        producer: 'Sarah Lee',
        dop: 'James Wilson',
        editor: 'Maria Garcia',
        format: '4K',
        frameRate: 30,
        aspectRatio: '16:9',
        deliverables: ['Artist Performances', 'Festival Highlight Reel'],
        archivePlan: {
          strategy: 'selective',
          retentionPeriod: 24, // 2 years
          notes: 'Keep best performances, discard B-roll after 1 year'
        },
        tags: ['Music', 'Concert', 'Multi-cam', '2023'],
        categories: ['Event Coverage', 'Music']
      }
    ]);
    
    console.log(`Created ${projects.length} projects`);
    
    // Create storage drives
    const drives = [];
    const driveTypes = ['HDD', 'SSD', 'HDD', 'NVMe', 'RAID'];
    const manufacturers = ['Western Digital', 'Samsung', 'Seagate', 'Crucial', 'LaCie'];
    const capacities = [1000, 2000, 4000, 500, 8000]; // In GB
    
    for (let i = 0; i < 5; i++) {
      const driveId = uuidv4();
      const type = driveTypes[i];
      const name = `${type} Drive ${i + 1}`;
      const serialNumber = `SN${Math.floor(Math.random() * 1000000)}`;
      
      // Generate QR code
      const qrData = JSON.stringify({
        id: driveId,
        serialNumber,
        name,
        type
      });
      
      const qrCodeFilename = `drive-qr-${driveId}.png`;
      const qrCodePath = path.join(qrCodeDir, qrCodeFilename);
      
      await qrcode.toFile(qrCodePath, qrData);
      
      // Create drive
      const drive = new StorageDrive({
        name,
        serialNumber,
        type,
        manufacturer: manufacturers[i],
        model: `Model ${i + 1}`,
        capacity: capacities[i],
        interface: 'SATA',
        formFactor: '3.5"',
        location: {
          facility: 'Main Office',
          room: 'Server Room',
          shelf: `Shelf ${Math.floor(i / 2) + 1}`,
          position: `Position ${(i % 2) + 1}`
        },
        usedSpace: Math.floor(Math.random() * capacities[i]),
        status: i < 4 ? 'active' : 'archived',
        health: i < 4 ? 'good' : 'fair',
        lastChecked: new Date(),
        qrCode: `/qrcodes/${qrCodeFilename}`,
        labelPrinted: true,
        projects: [projects[i % 2]._id],
        tags: ['Backup', `${type}`],
        purchaseDate: new Date(2022, i % 12, Math.floor(Math.random() * 28) + 1),
        notes: `Test drive ${i + 1} for development`
      });
      
      drives.push(await drive.save());
      
      // Update project with drive reference
      await Project.findByIdAndUpdate(projects[i % 2]._id, {
        $push: { drives: drive._id }
      });
    }
    
    console.log(`Created ${drives.length} drives`);
    
    // Create media assets
    const assetTypes = ['video', 'audio', 'image', 'project'];
    const assets = [];
    
    for (let i = 0; i < 20; i++) {
      const type = assetTypes[i % 4];
      const projectIndex = i % 2;
      const driveIndex = i % 5;
      
      const asset = new MediaAsset({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Asset ${i + 1}`,
        description: `Sample ${type} asset for testing`,
        type,
        originalFilename: `file_${i + 1}.${type === 'video' ? 'mp4' : type === 'audio' ? 'wav' : type === 'image' ? 'jpg' : 'prproj'}`,
        fileExtension: type === 'video' ? '.mp4' : type === 'audio' ? '.wav' : type === 'image' ? '.jpg' : '.prproj',
        fileSize: Math.floor(Math.random() * 1000000000) + 1000000, // Random size between 1MB and 1GB
        project: projects[projectIndex]._id,
        drive: drives[driveIndex]._id,
        path: `/Projects/${projects[projectIndex].title}/Assets/${type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : type === 'image' ? 'Images' : 'Project Files'}/`,
        archived: true,
        archiveDate: projects[projectIndex].archiveDate,
        tags: [`${type}`, 'sample', `project-${projectIndex + 1}`],
        categories: [type === 'video' ? 'Footage' : type === 'audio' ? 'Sound' : type === 'image' ? 'Stills' : 'Edits'],
        status: 'available'
      });
      
      // Add type-specific details
      if (type === 'video') {
        asset.duration = Math.floor(Math.random() * 600) + 30; // 30 seconds to 10 minutes
        asset.resolution = { width: 3840, height: 2160 }; // 4K
        asset.codec = 'H.264';
        asset.frameRate = 24;
        asset.previewImage = '/uploads/previews/sample-thumb.jpg';
        asset.previewVideo = '/uploads/previews/sample-preview.mp4';
      } else if (type === 'audio') {
        asset.duration = Math.floor(Math.random() * 300) + 10; // 10 seconds to 5 minutes
        asset.sampleRate = 48000;
        asset.channels = 2;
        asset.bitrate = 320000;
      } else if (type === 'image') {
        asset.resolution = { width: 5000, height: 3333 };
        asset.colorSpace = 'sRGB';
        asset.previewImage = '/uploads/previews/sample-image.jpg';
      }
      
      assets.push(await asset.save());
      
      // Update drive with asset reference and file count
      await StorageDrive.findByIdAndUpdate(drives[driveIndex]._id, {
        $push: { assets: asset._id },
        $inc: { fileCount: 1 }
      });
      
      // Update project with asset reference
      await Project.findByIdAndUpdate(projects[projectIndex]._id, {
        $push: { assets: asset._id }
      });
    }
    
    console.log(`Created ${assets.length} media assets`);
    
    // Create archive jobs
    const archiveJobs = [];
    
    for (let i = 0; i < 2; i++) {
      const projectIndex = i % 2;
      const job = new ArchiveJob({
        name: `Archive Job for ${projects[projectIndex].title}`,
        description: `Archive process for project ${i + 1}`,
        project: projects[projectIndex]._id,
        targetDrives: [drives[i % 5]._id],
        sourceDrives: [drives[(i + 2) % 5]._id],
        type: 'full-archive',
        status: i === 0 ? 'completed' : 'in-progress',
        progress: i === 0 ? 100 : 65,
        scheduledDate: new Date(projects[projectIndex].endDate.getTime() + 86400000 * 2), // 2 days after project end
        startDate: new Date(projects[projectIndex].endDate.getTime() + 86400000 * 3), // 3 days after project end
        endDate: i === 0 ? new Date(projects[projectIndex].endDate.getTime() + 86400000 * 4) : null,
        estimatedDuration: 120, // 2 hours
        actualDuration: i === 0 ? 145 : null,
        totalSize: 500, // 500 GB
        transferredSize: i === 0 ? 500 : 325,
        fileCount: 150,
        verificationMethod: 'checksum',
        verificationStatus: i === 0 ? 'passed' : 'in-progress',
        assignedTo: 'Admin'
      });
      
      // Add assets to job
      const projectAssets = assets.filter(asset => asset.project.toString() === projects[projectIndex]._id.toString());
      job.assets = projectAssets.map(asset => ({
        asset: asset._id,
        status: i === 0 ? 'completed' : Math.random() > 0.7 ? 'completed' : 'in-progress',
        targetPath: `/Archive/${projects[projectIndex].title}/${asset.type}s/`
      }));
      
      // Add some logs
      job.logs = [
        {
          timestamp: job.startDate,
          message: 'Archive job started',
          level: 'info'
        },
        {
          timestamp: new Date(job.startDate.getTime() + 3600000), // 1 hour after start
          message: 'Transfer in progress',
          level: 'info'
        }
      ];
      
      if (i === 0) {
        job.logs.push({
          timestamp: job.endDate,
          message: 'Archive job completed successfully',
          level: 'success'
        });
      }
      
      archiveJobs.push(await job.save());
    }
    
    console.log(`Created ${archiveJobs.length} archive jobs`);
    
    console.log('Database seeded successfully');
    mongoose.disconnect();
    
  } catch (error) {
    console.error('Error seeding database:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}