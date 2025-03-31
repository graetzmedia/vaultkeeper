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
        if (\!response.ok) throw new Error('Failed to fetch drives');
        
        const data = await response.json();
        // Process and display the drives
        console.log('Drives:', data);
    } catch (error) {
        console.error('Error fetching drives:', error);
    }
}
