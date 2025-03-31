#!/bin/bash

# VaultKeeper Complete Setup Script
# This script sets up the VaultKeeper system with remote access capabilities

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================="
echo -e "VaultKeeper Complete Setup Script"
echo -e "==========================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# Get username for files ownership
CURRENT_USER=$SUDO_USER
if [ -z "$CURRENT_USER" ]; then
  CURRENT_USER=$(whoami)
fi

echo -e "${YELLOW}Installing system dependencies...${NC}"
apt-get update
apt-get install -y smartmontools ffmpeg nodejs npm mongodb git curl build-essential \
  x11vnc xvfb tigervnc-standalone-server caddy

# Check MongoDB installation
echo -e "${YELLOW}Setting up MongoDB...${NC}"
systemctl enable mongod
systemctl start mongod
systemctl status mongod --no-pager

# Install Node.js dependencies
echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
npm install -g n
n stable

# Create VaultKeeper directories
echo -e "${YELLOW}Creating VaultKeeper directories...${NC}"
mkdir -p /opt/vaultkeeper
mkdir -p /opt/vaultkeeper/web
mkdir -p /opt/vaultkeeper/thumbnails
mkdir -p /opt/vaultkeeper/scripts
chmod -R 755 /opt/vaultkeeper

# Install VaultKeeper dependencies
echo -e "${YELLOW}Installing VaultKeeper dependencies...${NC}"
cat > /opt/vaultkeeper/package.json << 'EOL'
{
  "name": "vaultkeeper",
  "version": "1.0.0",
  "description": "Media asset tracking and cataloging system for archived files",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest --runInBand",
    "scan": "node scripts/scan-drive.js",
    "batch-scan": "node scripts/scan-drive.js batch-scan",
    "health-check": "node scripts/scan-drive.js health",
    "report": "node scripts/scan-drive.js report"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "commander": "^9.3.0",
    "cors": "^2.8.5",
    "crypto": "^1.0.1",
    "dotenv": "^16.0.1",
    "exif-parser": "^0.1.12",
    "express": "^4.18.1",
    "express-validator": "^6.14.2",
    "fluent-ffmpeg": "^2.1.2",
    "jsonwebtoken": "^8.5.1",
    "mime-types": "^2.1.35",
    "mongoose": "^6.5.0",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.1",
    "qrcode": "^1.5.1",
    "sharp": "^0.32.1",
    "systeminformation": "^5.17.0",
    "node-disk-info": "^1.3.0",
    "moment": "^2.29.4",
    "chalk": "^4.1.2"
  },
  "devDependencies": {
    "jest": "^28.1.3",
    "nodemon": "^2.0.19",
    "supertest": "^6.2.4"
  }
}
EOL

cd /opt/vaultkeeper
npm install

# Copy VaultKeeper scripts
echo -e "${YELLOW}Copying VaultKeeper scripts...${NC}"
# cp /path/to/your/scripts/* /opt/vaultkeeper/scripts/
# (You would need to copy your scripts here)

# Set up VNC for remote desktop access
echo -e "${YELLOW}Setting up VNC for remote desktop access...${NC}"
mkdir -p /home/$CURRENT_USER/.vnc

# Create VNC password (non-interactive)
echo -e "${YELLOW}Creating VNC password...${NC}"
echo "vaultkeeper" | vncpasswd -f > /home/$CURRENT_USER/.vnc/passwd
chmod 600 /home/$CURRENT_USER/.vnc/passwd

# Create x11vnc service
echo -e "${YELLOW}Creating x11vnc service...${NC}"
cat > /etc/systemd/system/x11vnc.service << EOL
[Unit]
Description=x11vnc Remote Desktop Service
After=multi-user.target

[Service]
Type=simple
User=$CURRENT_USER
ExecStart=/usr/bin/x11vnc -auth guess -forever -loop -noxdamage -repeat -rfbauth /home/$CURRENT_USER/.vnc/passwd -rfbport 5900 -shared
ExecStop=/usr/bin/killall x11vnc
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOL

systemctl daemon-reload
systemctl enable x11vnc.service
systemctl start x11vnc.service

# Set up noVNC for browser-based access
echo -e "${YELLOW}Setting up noVNC for browser-based access...${NC}"
if [ ! -d "/home/$CURRENT_USER/noVNC" ]; then
  cd /home/$CURRENT_USER
  git clone https://github.com/novnc/noVNC.git
  chown -R $CURRENT_USER:$CURRENT_USER noVNC
fi

# Create noVNC service
echo -e "${YELLOW}Creating noVNC service...${NC}"
cat > /etc/systemd/system/novnc.service << EOL
[Unit]
Description=noVNC Web VNC Client
After=network.target x11vnc.service

[Service]
Type=simple
User=$CURRENT_USER
ExecStart=/home/$CURRENT_USER/noVNC/utils/novnc_proxy --vnc localhost:5900 --listen 6080
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOL

systemctl daemon-reload
systemctl enable novnc.service
systemctl start novnc.service

# Configure Caddy for all access methods
echo -e "${YELLOW}Configuring Caddy for remote access...${NC}"
cat > /etc/caddy/Caddyfile << 'EOL'
# VaultKeeper Complete Access Configuration

# Web Interface
:8080 {
    root * /opt/vaultkeeper/web
    file_server
    reverse_proxy /api/* localhost:5000
}

# SSH Access via port forwarding
:2222 {
    reverse_proxy localhost:22
}

# VNC Remote Desktop Access
:5900 {
    reverse_proxy localhost:5900
}

# noVNC Web-based VNC Viewer
:6080 {
    reverse_proxy localhost:6080
}
EOL

# Restart Caddy
systemctl restart caddy

# Create web interface files
echo -e "${YELLOW}Creating web interface...${NC}"
mkdir -p /opt/vaultkeeper/web/css
mkdir -p /opt/vaultkeeper/web/js

# Create CSS file
cat > /opt/vaultkeeper/web/css/styles.css << 'EOL'
body {
    font-family: 'Roboto', Arial, sans-serif;
    line-height: 1.6;
    margin: 0;
    padding: 0;
    background-color: #f5f5f5;
    color: #333;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

header {
    background-color: #1a73e8;
    color: white;
    padding: 20px 0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

header .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

h1, h2, h3, h4 {
    margin-top: 0;
    font-weight: 500;
}

.logo {
    font-size: 24px;
    font-weight: 700;
}

nav ul {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 0;
}

nav li {
    margin-left: 20px;
}

nav a {
    color: white;
    text-decoration: none;
    transition: opacity 0.3s;
}

nav a:hover {
    opacity: 0.8;
}

.card {
    background-color: white;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.08);
}

.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    margin: 20px 0;
}

.status-card {
    text-align: center;
    padding: 30px 20px;
}

.status-card .number {
    font-size: 48px;
    font-weight: 300;
    margin: 10px 0;
    color: #1a73e8;
}

.status-card .label {
    font-size: 16px;
    color: #666;
    text-transform: uppercase;
}

.button {
    display: inline-block;
    background-color: #1a73e8;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    text-decoration: none;
    font-weight: 500;
    transition: background-color 0.3s;
}

.button:hover {
    background-color: #1557b0;
}

.button.secondary {
    background-color: #f1f3f4;
    color: #1a73e8;
}

.button.secondary:hover {
    background-color: #e8eaed;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
}

table th, table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #eee;
}

table th {
    background-color: #f9f9f9;
    font-weight: 500;
}

.health-status {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 14px;
}

.health-status.healthy {
    background-color: #e6f4ea;
    color: #137333;
}

.health-status.degraded {
    background-color: #fef7e0;
    color: #b06000;
}

.health-status.failing {
    background-color: #fce8e6;
    color: #c5221f;
}

.drive-icon {
    font-size: 24px;
    margin-right: 8px;
    vertical-align: middle;
}

footer {
    margin-top: 40px;
    padding: 20px 0;
    background-color: #f1f3f4;
    text-align: center;
    color: #666;
    font-size: 14px;
}
EOL

# Create JavaScript file
cat > /opt/vaultkeeper/web/js/app.js << 'EOL'
document.addEventListener('DOMContentLoaded', function() {
    // Mock data for demonstration
    const driveStats = {
        total: 12,
        healthy: 9,
        degraded: 2,
        failing: 1
    };
    
    const storageStats = {
        totalTB: 45.2,
        usedTB: 28.7
    };
    
    const assetStats = {
        total: 284562,
        video: 15432,
        audio: 8764,
        image: 143520,
        document: 117846
    };
    
    // Update dashboard stats
    document.getElementById('total-drives').textContent = driveStats.total;
    document.getElementById('healthy-drives').textContent = driveStats.healthy;
    document.getElementById('degraded-drives').textContent = driveStats.degraded;
    document.getElementById('failing-drives').textContent = driveStats.failing;
    
    document.getElementById('total-storage').textContent = storageStats.totalTB.toFixed(1);
    document.getElementById('used-storage').textContent = storageStats.usedTB.toFixed(1);
    document.getElementById('used-percent').textContent = 
        Math.round((storageStats.usedTB / storageStats.totalTB) * 100);
    
    document.getElementById('total-assets').textContent = 
        assetStats.total.toLocaleString();
    
    // Fetch actual drive data when API is available
    // fetchDrives();
    
    // Populate mock drives table
    const mockDrives = [
        { id: 'drive-001', name: 'Project X Archive', location: 'Shelf A-3', health: 'Healthy', size: '4TB', used: '3.2TB' },
        { id: 'drive-002', name: 'Summer 2023 Footage', location: 'Shelf B-1', health: 'Degraded', size: '8TB', used: '7.5TB' },
        { id: 'drive-003', name: 'Client Assets Q1', location: 'Shelf A-5', health: 'Healthy', size: '2TB', used: '1.7TB' },
        { id: 'drive-004', name: 'Raw Interview Masters', location: 'Shelf C-2', health: 'Failing', size: '4TB', used: '3.8TB' },
        { id: 'drive-005', name: 'NYC Shoot Oct 2023', location: 'Shelf B-3', health: 'Healthy', size: '8TB', used: '4.2TB' }
    ];
    
    const drivesTableBody = document.getElementById('drives-table-body');
    if (drivesTableBody) {
        drivesTableBody.innerHTML = '';
        
        mockDrives.forEach(drive => {
            const row = document.createElement('tr');
            
            const healthClass = drive.health.toLowerCase();
            
            row.innerHTML = `
                <td><span class="drive-icon">💾</span> ${drive.name}</td>
                <td>${drive.location}</td>
                <td><span class="health-status ${healthClass}">${drive.health}</span></td>
                <td>${drive.size}</td>
                <td>${drive.used}</td>
                <td>
                    <a href="/drives/${drive.id}" class="button secondary">Details</a>
                </td>
            `;
            
            drivesTableBody.appendChild(row);
        });
    }
});

// Function to fetch drives from API when available
async function fetchDrives() {
    try {
        const response = await fetch('/api/drives');
        if (!response.ok) throw new Error('Failed to fetch drives');
        
        const data = await response.json();
        // Process and display the drives
        console.log('Drives:', data);
    } catch (error) {
        console.error('Error fetching drives:', error);
    }
}
EOL

# Create HTML file
cat > /opt/vaultkeeper/web/index.html << 'EOL'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VaultKeeper - Media Asset Manager</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
    <header>
        <div class="container">
            <div class="logo">VaultKeeper</div>
            <nav>
                <ul>
                    <li><a href="/">Dashboard</a></li>
                    <li><a href="/drives">Drives</a></li>
                    <li><a href="/assets">Assets</a></li>
                    <li><a href="/reports">Reports</a></li>
                </ul>
            </nav>
        </div>
    </header>
    
    <div class="container">
        <div class="card">
            <h2>Welcome to VaultKeeper</h2>
            <p>Your comprehensive media asset tracking and cataloging system for archived files.</p>
            <a href="/drives/register" class="button">Register New Drive</a>
        </div>
        
        <div class="dashboard-grid">
            <div class="card status-card">
                <div class="label">Total Drives</div>
                <div class="number" id="total-drives">0</div>
            </div>
            <div class="card status-card">
                <div class="label">Healthy Drives</div>
                <div class="number" id="healthy-drives">0</div>
            </div>
            <div class="card status-card">
                <div class="label">Degraded Drives</div>
                <div class="number" id="degraded-drives">0</div>
            </div>
            <div class="card status-card">
                <div class="label">Failing Drives</div>
                <div class="number" id="failing-drives">0</div>
            </div>
        </div>
        
        <div class="card">
            <h3>Storage Overview</h3>
            <p><span id="used-storage">0</span> TB used of <span id="total-storage">0</span> TB total (<span id="used-percent">0</span>%)</p>
            <p>Total media assets: <strong id="total-assets">0</strong></p>
        </div>
        
        <div class="card">
            <h3>Recent Drives</h3>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Location</th>
                        <th>Health</th>
                        <th>Size</th>
                        <th>Used</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="drives-table-body">
                    <!-- Drive rows will be inserted here by JavaScript -->
                </tbody>
            </table>
            <a href="/drives" class="button secondary">View All Drives</a>
        </div>
        
        <div class="card">
            <h3>Quick Actions</h3>
            <a href="/drives/register" class="button">Register Drive</a>
            <a href="/drives/batch-scan" class="button secondary">Batch Scan</a>
            <a href="/reports" class="button secondary">Generate Report</a>
        </div>
    </div>
    
    <footer>
        <div class="container">
            <p>VaultKeeper &copy; 2024 - Media Asset Management System</p>
            <p>Remote access enabled: <a href="http://localhost:6080/vnc.html">GUI Access</a> | <a href="ssh://localhost:2222">SSH</a></p>
        </div>
    </footer>
    
    <script src="/js/app.js"></script>
</body>
</html>
EOL

# Create MongoDB indexes
echo -e "${YELLOW}Creating MongoDB indexes...${NC}"
mongo <<EOF
use vaultkeeper
db.createCollection("storagedrives")
db.createCollection("mediaassets")
db.createCollection("projects")
db.storagedrives.createIndex({driveId: 1}, {unique: true})
db.storagedrives.createIndex({name: "text", description: "text", location: "text"})
db.mediaassets.createIndex({assetId: 1}, {unique: true})
db.mediaassets.createIndex({driveId: 1})
db.mediaassets.createIndex({title: "text", description: "text", originalFilename: "text"})
EOF

# Set permissions
chown -R $CURRENT_USER:$CURRENT_USER /opt/vaultkeeper
chown -R $CURRENT_USER:$CURRENT_USER /home/$CURRENT_USER/.vnc
chown -R $CURRENT_USER:$CURRENT_USER /home/$CURRENT_USER/noVNC

# Get system information
ip_addr=$(hostname -I | awk '{print $1}')

echo -e "${GREEN}==========================================="
echo -e "VaultKeeper Setup Complete!"
echo -e "============================================${NC}"
echo -e "${YELLOW}System Information:${NC}"
echo -e "Username: $CURRENT_USER"
echo -e "IP Address: $ip_addr"
echo -e ""
echo -e "${YELLOW}Access URLs:${NC}"
echo -e "- Web Interface:   ${GREEN}http://$ip_addr:8080${NC}"
echo -e "- Remote Desktop:  ${GREEN}http://$ip_addr:6080/vnc.html${NC}"
echo -e "- SSH Access:      ${GREEN}ssh -p 2222 $CURRENT_USER@$ip_addr${NC}"
echo -e ""
echo -e "${YELLOW}VNC Password:${NC} vaultkeeper"
echo -e ""
echo -e "${YELLOW}Service Status:${NC}"
echo -e "- MongoDB:  $(systemctl is-active mongod)"
echo -e "- Caddy:    $(systemctl is-active caddy)"
echo -e "- x11vnc:   $(systemctl is-active x11vnc)"
echo -e "- noVNC:    $(systemctl is-active novnc)"
echo -e ""
echo -e "${YELLOW}VaultKeeper Location:${NC}"
echo -e "- Main Directory: /opt/vaultkeeper"
echo -e "- Web Interface:  /opt/vaultkeeper/web"
echo -e "- Thumbnails:     /opt/vaultkeeper/thumbnails"
echo -e ""
echo -e "${YELLOW}For External Access:${NC}"
echo -e "1. Configure port forwarding on your router for ports 8080, 6080, 2222, and 5900"
echo -e "2. Consider setting up a domain name with Caddy for HTTPS"
echo -e ""
echo -e "${YELLOW}Usage Example:${NC}"
echo -e "To register a drive: ${GREEN}cd /opt/vaultkeeper && npm run scan register /media/your-drive --name \"Archive Drive\" --location \"Shelf A-1\"${NC}"
echo -e "To check health:     ${GREEN}cd /opt/vaultkeeper && npm run health-check drive-id-xxxx${NC}"
echo -e "For batch processing: ${GREEN}cd /opt/vaultkeeper && npm run batch-scan --location \"Rack B\" --max 10${NC}"
echo -e ""
echo -e "${GREEN}Happy archiving with VaultKeeper!${NC}"