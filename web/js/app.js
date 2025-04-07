document.addEventListener('DOMContentLoaded', function() {
    // Configuration
    const API_BASE_URL = 'http://localhost:5000'; // Set to your Flask server URL
    const DB_PATH = '~/media-asset-tracker/asset-db.sqlite'; // Path to SQLite database
    const THUMBNAILS_PATH = '~/media-asset-tracker/thumbnails'; // Path to thumbnails directory
    
    // Flag to use actual backend (set to true to use the Flask backend)
    const USE_BACKEND = true;
    
    // Database configuration - assuming we're using a Python API to interact with SQLite
    const PAGE_SIZE = 20; // Number of results per page
    let currentPage = 1;
    let totalPages = 1;
    let currentSearchResults = []; // Store current search results
    let selectedFiles = new Set(); // Track selected files for client assignment
    
    // DOM Elements
    const searchButton = document.getElementById('search-button');
    const searchQuery = document.getElementById('search-query');
    const searchType = document.getElementById('search-type');
    const includeTranscripts = document.getElementById('include-transcripts');
    const driveFilter = document.getElementById('drive-filter');
    const clientFilter = document.getElementById('client-filter');
    const resultsCount = document.getElementById('results-count');
    const thumbnailView = document.getElementById('thumbnail-view');
    const resultsBody = document.getElementById('results-body');
    const pagination = document.getElementById('pagination');
    const addClientButton = document.getElementById('add-client-button');
    const newClientName = document.getElementById('new-client-name');
    const clientSelect = document.getElementById('client-select');
    const assignClientButton = document.getElementById('assign-client-button');
    
    // Modal Elements
    const thumbnailModal = document.getElementById('thumbnail-modal');
    const closeModalButton = document.querySelector('.close-modal');
    const previewImage = document.getElementById('preview-image');
    const modalFilename = document.getElementById('modal-filename');
    const modalPath = document.getElementById('modal-path');
    const modalDrive = document.getElementById('modal-drive');
    const modalSize = document.getElementById('modal-size');
    const modalDate = document.getElementById('modal-date');
    const transcriptionContent = document.getElementById('transcription-content');
    
    // Initialize the interface
    function init() {
        // Load drives list for filter dropdown
        loadDrives();
        
        // Load clients list for filter and assignment dropdowns
        loadClients();
        
        // Set up event listeners
        setupEventListeners();
        
        // Display initial set of results (empty search)
        search();
        
        // Load data for other pages
        loadDrivesList();
        loadProjectsList();
        loadLocationsData();
        loadReportsData();
    }
    
    // Set up event listeners
    function setupEventListeners() {
        // Navigation links
        document.querySelectorAll('nav a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = link.getAttribute('data-page');
                if (pageId) {
                    // Hide all pages
                    document.querySelectorAll('.page').forEach(page => {
                        page.classList.remove('active');
                    });
                    
                    // Show selected page
                    document.getElementById(`page-${pageId}`).classList.add('active');
                    
                    // Update active link
                    document.querySelectorAll('nav a').forEach(navLink => {
                        navLink.classList.remove('active');
                    });
                    link.classList.add('active');
                }
            });
        });
        
        // Search button click
        if (searchButton) {
            searchButton.addEventListener('click', () => {
                currentPage = 1; // Reset to first page on new search
                search();
            });
        }
        
        // Enter key in search input
        if (searchQuery) {
            searchQuery.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    currentPage = 1;
                    search();
                }
            });
        }
        
        // Select all files checkbox
        const selectAllCheckbox = document.getElementById('select-all-files');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', () => {
                const isChecked = selectAllCheckbox.checked;
                document.querySelectorAll('.file-checkbox').forEach(checkbox => {
                    checkbox.checked = isChecked;
                    
                    // Update the selected files set
                    const fileId = checkbox.dataset.id;
                    if (isChecked) {
                        selectedFiles.add(fileId);
                    } else {
                        selectedFiles.delete(fileId);
                    }
                });
            });
        }
        
        // Add client button
        if (addClientButton) {
            addClientButton.addEventListener('click', addClient);
        }
        
        // Assign client button
        if (assignClientButton) {
            assignClientButton.addEventListener('click', assignFilesToClient);
        }
        
        // Create project button
        const createProjectButton = document.getElementById('create-project-button');
        if (createProjectButton) {
            createProjectButton.addEventListener('click', async () => {
                const projectName = document.getElementById('new-project-name').value.trim();
                const clientName = document.getElementById('new-project-client').value.trim();
                
                if (!projectName) {
                    alert('Please enter a project name');
                    return;
                }
                
                try {
                    if (USE_BACKEND) {
                        console.log('Creating project via API...');
                        const response = await fetch(`${API_BASE_URL}/api/projects`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ 
                                name: projectName, 
                                client: clientName 
                            }),
                        });
                        
                        if (!response.ok) throw new Error('Failed to create project');
                        
                        const result = await response.json();
                        console.log('Project created:', result);
                        
                        // Refresh projects list with real data
                        loadProjectsList();
                        
                        // Also refresh client lists since this might have created a new client
                        loadClients();
                    } else {
                        alert(`Project "${projectName}" created${clientName ? ` for client "${clientName}"` : ''}`);
                        // Mock refresh
                        populateMockProjectsList();
                    }
                    
                    // Clear inputs
                    document.getElementById('new-project-name').value = '';
                    document.getElementById('new-project-client').value = '';
                    
                } catch (error) {
                    console.error('Error creating project:', error);
                    alert('Failed to create project: ' + error.message);
                }
            });
        }
        
        // Close modal
        if (closeModalButton) {
            closeModalButton.addEventListener('click', () => {
                thumbnailModal.style.display = 'none';
            });
        }
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === thumbnailModal) {
                thumbnailModal.style.display = 'none';
            }
        });
    }
    
    // Load real drives list from API
    async function loadDrivesList() {
        const drivesList = document.getElementById('drives-list');
        if (!drivesList) return;
        
        // Clear existing content
        drivesList.innerHTML = '<tr><td colspan="6">Loading drives...</td></tr>';
        
        try {
            if (USE_BACKEND) {
                console.log('Fetching drives from API for drives list...');
                const response = await fetch(`${API_BASE_URL}/api/drives`);
                if (!response.ok) throw new Error('Failed to fetch drives');
                const drives = await response.json();
                console.log('Received drives from API for drives list:', drives);
                populateDrivesList(drives);
            } else {
                console.log('Using mock drive data for drives list...');
                const mockDrives = [
                    { 
                        id: 'drive-001', 
                        label: 'RED Footage Archive', 
                        volumeName: 'RED_ARCHIVE_01',
                        sizeBytes: 8 * 1024 * 1024 * 1024 * 1024, // 8TB
                        freeBytes: 2.3 * 1024 * 1024 * 1024 * 1024, // 2.3TB
                        dateCataloged: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days ago
                    },
                    { 
                        id: 'drive-002', 
                        label: 'Client Delivery Shuttle', 
                        volumeName: 'SHUTTLE_01',
                        sizeBytes: 4 * 1024 * 1024 * 1024 * 1024, // 4TB
                        freeBytes: 1.2 * 1024 * 1024 * 1024 * 1024, // 1.2TB
                        dateCataloged: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago
                    },
                    { 
                        id: 'drive-003', 
                        label: 'Raw Interview Masters', 
                        volumeName: 'INTERVIEWS_2023',
                        sizeBytes: 12 * 1024 * 1024 * 1024 * 1024, // 12TB
                        freeBytes: 3.7 * 1024 * 1024 * 1024 * 1024, // 3.7TB
                        dateCataloged: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString() // 21 days ago
                    },
                    { 
                        id: 'drive-004', 
                        label: 'NYC Shoot Oct 2023', 
                        volumeName: 'NYC_OCT23',
                        sizeBytes: 4 * 1024 * 1024 * 1024 * 1024, // 4TB
                        freeBytes: 0.8 * 1024 * 1024 * 1024 * 1024, // 0.8TB
                        dateCataloged: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
                    },
                    { 
                        id: 'drive-005', 
                        label: 'Personal Projects', 
                        volumeName: 'PERSONAL',
                        sizeBytes: 2 * 1024 * 1024 * 1024 * 1024, // 2TB
                        freeBytes: 0.5 * 1024 * 1024 * 1024 * 1024, // 0.5TB
                        dateCataloged: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days ago
                    }
                ];
                populateDrivesList(mockDrives);
            }
        } catch (error) {
            console.error('Error loading drives list:', error);
            // Fall back to mock data if API fails
            console.log('Falling back to mock drive data due to error');
            drivesList.innerHTML = '<tr><td colspan="6">Error loading drives. Falling back to mock data...</td></tr>';
            
            setTimeout(() => {
                const mockDrives = [
                    { 
                        id: 'drive-001', 
                        label: 'RED Footage Archive', 
                        volumeName: 'RED_ARCHIVE_01',
                        sizeBytes: 8 * 1024 * 1024 * 1024 * 1024, // 8TB
                        freeBytes: 2.3 * 1024 * 1024 * 1024 * 1024, // 2.3TB
                        dateCataloged: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days ago
                    },
                    { 
                        id: 'drive-002', 
                        label: 'Client Delivery Shuttle', 
                        volumeName: 'SHUTTLE_01',
                        sizeBytes: 4 * 1024 * 1024 * 1024 * 1024, // 4TB
                        freeBytes: 1.2 * 1024 * 1024 * 1024 * 1024, // 1.2TB
                        dateCataloged: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago
                    },
                    { 
                        id: 'drive-003', 
                        label: 'Raw Interview Masters', 
                        volumeName: 'INTERVIEWS_2023',
                        sizeBytes: 12 * 1024 * 1024 * 1024 * 1024, // 12TB
                        freeBytes: 3.7 * 1024 * 1024 * 1024 * 1024, // 3.7TB
                        dateCataloged: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString() // 21 days ago
                    }
                ];
                populateDrivesList(mockDrives);
            }, 1000);
        }
    }
    
    // Populate drives list with data (either real or mock)
    function populateDrivesList(drives) {
        const drivesList = document.getElementById('drives-list');
        const folderDriveSelect = document.getElementById('folder-drive-select');
        
        if (!drivesList) return;
        
        // Clear existing content
        drivesList.innerHTML = '';
        
        // Clear and repopulate folder drive select
        if (folderDriveSelect) {
            folderDriveSelect.innerHTML = '<option value="">Select Drive</option>';
        }
        
        if (drives.length === 0) {
            drivesList.innerHTML = '<tr><td colspan="7">No drives found</td></tr>';
            return;
        }
        
        // Add rows for each drive
        drives.forEach(drive => {
            const row = document.createElement('tr');
            row.dataset.id = drive.id;
            
            const labelCell = document.createElement('td');
            labelCell.textContent = drive.label || 'Unnamed Drive';
            
            const volumeNameCell = document.createElement('td');
            volumeNameCell.textContent = drive.volumeName || 'No Volume Name';
            
            const sizeCell = document.createElement('td');
            sizeCell.textContent = formatFileSize(drive.sizeBytes || 0);
            
            const freeSpaceCell = document.createElement('td');
            freeSpaceCell.textContent = formatFileSize(drive.freeBytes || 0);
            
            const dateCell = document.createElement('td');
            dateCell.textContent = formatDate(drive.dateCataloged || new Date().toISOString());
            
            // Add client assignment cell
            const clientCell = document.createElement('td');
            const clientSelect = document.createElement('select');
            clientSelect.className = 'drive-client-select';
            clientSelect.innerHTML = '<option value="">Assign Client...</option>';
            clientSelect.dataset.driveId = drive.id;
            
            // Fetch clients to populate the dropdown
            loadClientsForSelect(clientSelect);
            
            // Determine if drive already has a client by checking for a project
            // that mentions this drive in the name (just a heuristic for display)
            if (drive.client) {
                const option = document.createElement('option');
                option.value = drive.client;
                option.textContent = drive.client;
                option.selected = true;
                clientSelect.appendChild(option);
                
                // Add the client name as text next to the dropdown
                const clientSpan = document.createElement('span');
                clientSpan.textContent = drive.client;
                clientSpan.style.marginRight = '10px';
                clientCell.appendChild(clientSpan);
            }
            
            clientCell.appendChild(clientSelect);
            
            // Add listener for client assignment
            clientSelect.addEventListener('change', async (e) => {
                const clientName = e.target.value;
                if (!clientName || clientName === 'ADD_NEW_CLIENT') return;
                
                try {
                    if (USE_BACKEND) {
                        const response = await fetch(`${API_BASE_URL}/api/drives/${drive.id}/assign-client`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ client: clientName }),
                        });
                        
                        if (!response.ok) throw new Error('Failed to assign client');
                        
                        const result = await response.json();
                        console.log('Client assigned to drive:', result);
                        
                        // Update the display
                        const clientSpan = clientCell.querySelector('span');
                        if (clientSpan) {
                            clientSpan.textContent = clientName;
                        } else {
                            const newSpan = document.createElement('span');
                            newSpan.textContent = clientName;
                            newSpan.style.marginRight = '10px';
                            clientCell.insertBefore(newSpan, clientCell.firstChild);
                        }
                    } else {
                        alert(`Drive assigned to client: ${clientName}`);
                    }
                    
                    // Refresh drives list to show all updated assignments
                    loadDrivesList();
                } catch (error) {
                    console.error('Error assigning client to drive:', error);
                    alert('Failed to assign client: ' + error.message);
                }
            });
            
            const actionsCell = document.createElement('td');
            
            const foldersButton = document.createElement('button');
            foldersButton.className = 'button secondary';
            foldersButton.textContent = 'Folders';
            foldersButton.addEventListener('click', () => {
                // Set the folder drive select to this drive and load folders
                if (folderDriveSelect) {
                    folderDriveSelect.value = drive.id;
                    loadFolders(drive.id);
                    
                    // Scroll to folders section
                    document.getElementById('drive-folders').scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
            
            const exportLabelButton = document.createElement('button');
            exportLabelButton.className = 'button';
            exportLabelButton.textContent = 'Export Label';
            exportLabelButton.addEventListener('click', () => {
                console.log('Export Label button clicked, drive:', drive);
                if (USE_BACKEND) {
                    // Determine the correct ID to use (could be id, _id, or driveId)
                    const driveId = drive._id || drive.id || drive.driveId;
                    console.log('Using drive ID:', driveId);
                    
                    // Try the drives endpoint first
                    const url = `${API_BASE_URL}/api/drives/${driveId}/export-label`;
                    console.log('Opening URL:', url);
                    window.open(url, '_blank');
                } else {
                    alert(`Export Label for Drive: ${drive.label || drive.volumeName || drive.id}`);
                }
            });
            
            actionsCell.appendChild(foldersButton);
            actionsCell.appendChild(document.createTextNode(' '));
            actionsCell.appendChild(exportLabelButton);
            
            row.appendChild(labelCell);
            row.appendChild(volumeNameCell);
            row.appendChild(sizeCell);
            row.appendChild(freeSpaceCell);
            row.appendChild(dateCell);
            row.appendChild(clientCell);
            row.appendChild(actionsCell);
            
            drivesList.appendChild(row);
            
            // Also add to folder drive select
            if (folderDriveSelect) {
                const option = document.createElement('option');
                option.value = drive.id;
                option.textContent = drive.label || drive.volumeName || drive.id;
                folderDriveSelect.appendChild(option);
            }
        });
        
        // Set up load folders button
        const loadFoldersButton = document.getElementById('load-folders-button');
        if (loadFoldersButton) {
            loadFoldersButton.addEventListener('click', () => {
                const driveId = folderDriveSelect.value;
                if (!driveId) {
                    alert('Please select a drive first');
                    return;
                }
                
                loadFolders(driveId);
            });
        }
    }
    
    // Load clients for a select dropdown
    async function loadClientsForSelect(selectElement) {
        try {
            if (USE_BACKEND) {
                console.log('Fetching clients for select dropdown...');
                const response = await fetch(`${API_BASE_URL}/api/clients`);
                if (!response.ok) throw new Error('Failed to fetch clients');
                const clients = await response.json();
                
                // Add each client as an option
                clients.forEach(client => {
                    if (client.name) {
                        const option = document.createElement('option');
                        option.value = client.name;
                        option.textContent = client.name;
                        selectElement.appendChild(option);
                    }
                });
            } else {
                // Add mock clients
                const mockClients = [
                    { id: 'client-001', name: 'Acme Productions' },
                    { id: 'client-002', name: 'Global Media' },
                    { id: 'client-003', name: 'Indie Filmworks' },
                    { id: 'client-004', name: 'Studio 54 Digital' },
                    { id: 'client-005', name: 'Personal Projects' }
                ];
                
                mockClients.forEach(client => {
                    const option = document.createElement('option');
                    option.value = client.name;
                    option.textContent = client.name;
                    selectElement.appendChild(option);
                });
            }
            
            // Add "Add new client..." option at the end
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '──────────────';
            selectElement.appendChild(separator);
            
            const addNewOption = document.createElement('option');
            addNewOption.value = "ADD_NEW_CLIENT";
            addNewOption.textContent = '+ Add new client...';
            selectElement.appendChild(addNewOption);
            
            // Add change listener to handle "Add new client..." selection
            // Store original listener to prevent duplicates
            if (!selectElement.hasAddNewClientHandler) {
                selectElement.hasAddNewClientHandler = true;
                
                selectElement.addEventListener('change', async (e) => {
                    if (e.target.value === 'ADD_NEW_CLIENT') {
                        const newClientName = prompt('Enter new client name:');
                        if (newClientName && newClientName.trim()) {
                            try {
                                // Create the new client
                                const response = await fetch(`${API_BASE_URL}/api/clients`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({ name: newClientName.trim() }),
                                });
                                
                                if (!response.ok) throw new Error('Failed to add client');
                                
                                const newClient = await response.json();
                                console.log('New client created:', newClient);
                                
                                // Add the new client to the select
                                const option = document.createElement('option');
                                option.value = newClient.name;
                                option.textContent = newClient.name;
                                
                                // Insert before the separator
                                selectElement.insertBefore(option, separator);
                                
                                // Select the new client
                                option.selected = true;
                                
                                // Manually trigger the change handler for the select instead of dispatching event
                                // This prevents recursion and ADD_NEW_CLIENT being saved
                                
                                // Find the parent element that holds the client dropdown
                                const parentCell = selectElement.closest('td');
                                if (parentCell) {
                                    // If we're in a table cell (drive or folder assignment)
                                    const clientSpan = parentCell.querySelector('span');
                                    if (clientSpan) {
                                        clientSpan.textContent = newClient.name;
                                    } else {
                                        const newSpan = document.createElement('span');
                                        newSpan.textContent = newClient.name;
                                        newSpan.style.marginRight = '10px';
                                        parentCell.insertBefore(newSpan, parentCell.firstChild);
                                    }
                                }
                                
                                // For drive assignment
                                if (selectElement.dataset.driveId) {
                                    // Handle drive client assignment
                                    if (USE_BACKEND) {
                                        const driveResponse = await fetch(`${API_BASE_URL}/api/drives/${selectElement.dataset.driveId}/assign-client`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({ client: newClient.name }),
                                        });
                                        
                                        if (!driveResponse.ok) {
                                            console.error('Failed to assign client to drive');
                                        } else {
                                            // Refresh drives list to show updated assignments
                                            loadDrivesList();
                                        }
                                    }
                                }
                                
                                // For folder assignment
                                if (selectElement.dataset.folderPath) {
                                    // Handle folder client assignment
                                    if (USE_BACKEND) {
                                        const folderResponse = await fetch(`${API_BASE_URL}/api/folders/assign-client`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                                drive_id: selectElement.dataset.driveId,
                                                folder_path: selectElement.dataset.folderPath,
                                                client: newClient.name
                                            }),
                                        });
                                        
                                        if (!folderResponse.ok) {
                                            console.error('Failed to assign client to folder');
                                        } else {
                                            // Refresh folders list to show updated assignments
                                            const driveId = selectElement.dataset.driveId;
                                            if (driveId) {
                                                loadFolders(driveId);
                                            }
                                        }
                                    }
                                }
                                
                            } catch (error) {
                                console.error('Error adding client:', error);
                                alert('Failed to add client: ' + error.message);
                                
                                // Reset selection to the first option
                                selectElement.selectedIndex = 0;
                            }
                        } else {
                            // Reset selection to the first option
                            selectElement.selectedIndex = 0;
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error loading clients for select:', error);
        }
    }
    
    // Load folders for a drive
    async function loadFolders(driveId) {
        const foldersList = document.getElementById('folders-list');
        if (!foldersList) return;
        
        // Clear existing content
        foldersList.innerHTML = '<tr><td colspan="4">Loading folders...</td></tr>';
        
        try {
            if (USE_BACKEND) {
                console.log(`Fetching folders for drive ${driveId}...`);
                const response = await fetch(`${API_BASE_URL}/api/drives/${driveId}/folders`);
                if (!response.ok) throw new Error('Failed to fetch folders');
                const folders = await response.json();
                console.log('Received folders:', folders);
                
                populateFoldersList(driveId, folders);
            } else {
                // Generate mock folders
                const mockFolders = [
                    { folder_path: 'client_projects', item_count: 253, client: 'Acme Productions' },
                    { folder_path: 'raw_footage', item_count: 892, client: null },
                    { folder_path: 'archives', item_count: 127, client: 'Global Media' },
                    { folder_path: 'misc', item_count: 45, client: null }
                ];
                
                populateFoldersList(driveId, mockFolders);
            }
        } catch (error) {
            console.error('Error loading folders:', error);
            foldersList.innerHTML = '<tr><td colspan="4">Error loading folders</td></tr>';
        }
    }
    
    // Populate folders list
    function populateFoldersList(driveId, folders) {
        const foldersList = document.getElementById('folders-list');
        if (!foldersList) return;
        
        // Clear existing content
        foldersList.innerHTML = '';
        
        if (folders.length === 0) {
            foldersList.innerHTML = '<tr><td colspan="4">No folders found on this drive</td></tr>';
            return;
        }
        
        // Add rows for each folder
        folders.forEach(folder => {
            const row = document.createElement('tr');
            
            const pathCell = document.createElement('td');
            pathCell.textContent = folder.folder_path;
            
            const countCell = document.createElement('td');
            countCell.textContent = folder.item_count.toLocaleString();
            
            // Add client assignment cell
            const clientCell = document.createElement('td');
            const clientSelect = document.createElement('select');
            clientSelect.className = 'folder-client-select';
            clientSelect.innerHTML = '<option value="">Assign Client...</option>';
            clientSelect.dataset.driveId = driveId;
            clientSelect.dataset.folderPath = folder.folder_path;
            
            // Fetch clients to populate the dropdown
            loadClientsForSelect(clientSelect);
            
            // Set selected client if exists
            if (folder.client) {
                const option = document.createElement('option');
                option.value = folder.client;
                option.textContent = folder.client;
                option.selected = true;
                clientSelect.appendChild(option);
                
                // Add the client name as text next to the dropdown
                const clientSpan = document.createElement('span');
                clientSpan.textContent = folder.client;
                clientSpan.style.marginRight = '10px';
                clientCell.appendChild(clientSpan);
            }
            
            clientCell.appendChild(clientSelect);
            
            // Add listener for client assignment
            clientSelect.addEventListener('change', async (e) => {
                const clientName = e.target.value;
                if (!clientName || clientName === 'ADD_NEW_CLIENT') return;
                
                try {
                    if (USE_BACKEND) {
                        const response = await fetch(`${API_BASE_URL}/api/folders/assign-client`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                drive_id: driveId,
                                folder_path: folder.folder_path,
                                client: clientName
                            }),
                        });
                        
                        if (!response.ok) throw new Error('Failed to assign client');
                        
                        const result = await response.json();
                        console.log('Client assigned to folder:', result);
                        
                        // Update the display
                        const clientSpan = clientCell.querySelector('span');
                        if (clientSpan) {
                            clientSpan.textContent = clientName;
                        } else {
                            const newSpan = document.createElement('span');
                            newSpan.textContent = clientName;
                            newSpan.style.marginRight = '10px';
                            clientCell.insertBefore(newSpan, clientCell.firstChild);
                        }
                    } else {
                        alert(`Folder ${folder.folder_path} assigned to client: ${clientName}`);
                    }
                    
                    // Refresh folders list to show all updated assignments
                    loadFolders(driveId);
                } catch (error) {
                    console.error('Error assigning client to folder:', error);
                    alert('Failed to assign client: ' + error.message);
                }
            });
            
            const actionsCell = document.createElement('td');
            const browseButton = document.createElement('button');
            browseButton.className = 'button secondary';
            browseButton.textContent = 'Browse';
            browseButton.addEventListener('click', () => {
                // Set up a search filtered by drive and folder path
                if (searchQuery && driveFilter) {
                    // Go back to query page
                    document.querySelectorAll('.page').forEach(page => {
                        page.classList.remove('active');
                    });
                    document.getElementById('page-query-tool').classList.add('active');
                    
                    // Set filters and perform search
                    driveFilter.value = driveId;
                    searchQuery.value = folder.folder_path + '/';
                    searchType.value = 'any';
                    currentPage = 1;
                    search();
                    
                    // Update navigation
                    document.querySelectorAll('nav a').forEach(navLink => {
                        navLink.classList.remove('active');
                    });
                    document.querySelector('nav a[data-page="query-tool"]').classList.add('active');
                }
            });
            
            actionsCell.appendChild(browseButton);
            
            row.appendChild(pathCell);
            row.appendChild(countCell);
            row.appendChild(clientCell);
            row.appendChild(actionsCell);
            
            foldersList.appendChild(row);
        });
    }
    
    // Load real projects list from API
    async function loadProjectsList() {
        const projectsList = document.getElementById('projects-list');
        if (!projectsList) return;
        
        // Clear existing content
        projectsList.innerHTML = '<tr><td colspan="5">Loading projects...</td></tr>';
        
        try {
            if (USE_BACKEND) {
                console.log('Fetching projects from API...');
                const response = await fetch(`${API_BASE_URL}/api/projects`);
                if (!response.ok) throw new Error('Failed to fetch projects');
                const projects = await response.json();
                console.log('Received projects from API:', projects);
                populateProjectsList(projects);
            } else {
                console.log('Using mock project data...');
                const mockProjects = [
                    { 
                        id: 'project-001', 
                        name: 'NYC Documentary', 
                        client: 'Global Media',
                        dateCreated: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
                        fileCount: 1253
                    },
                    { 
                        id: 'project-002', 
                        name: 'Summer Promo Campaign', 
                        client: 'Acme Productions',
                        dateCreated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
                        fileCount: 587
                    },
                    { 
                        id: 'project-003', 
                        name: 'Wedding Compilation', 
                        client: 'Studio 54 Digital',
                        dateCreated: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
                        fileCount: 2431
                    },
                    { 
                        id: 'project-004', 
                        name: 'Corporate Training Series', 
                        client: 'Indie Filmworks',
                        dateCreated: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
                        fileCount: 103
                    },
                    { 
                        id: 'project-005', 
                        name: 'Experimental Short Film', 
                        client: 'Personal Projects',
                        dateCreated: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
                        fileCount: 76
                    }
                ];
                populateProjectsList(mockProjects);
            }
        } catch (error) {
            console.error('Error loading projects:', error);
            // Fall back to mock data if API fails
            console.log('Falling back to mock project data due to error');
            projectsList.innerHTML = '<tr><td colspan="5">Error loading projects. Falling back to mock data...</td></tr>';
            
            setTimeout(() => {
                const mockProjects = [
                    { 
                        id: 'project-001', 
                        name: 'NYC Documentary', 
                        client: 'Global Media',
                        dateCreated: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
                        fileCount: 1253
                    },
                    { 
                        id: 'project-002', 
                        name: 'Summer Promo Campaign', 
                        client: 'Acme Productions',
                        dateCreated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                        fileCount: 587
                    },
                    { 
                        id: 'project-003', 
                        name: 'Wedding Compilation', 
                        client: 'Studio 54 Digital',
                        dateCreated: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
                        fileCount: 2431
                    }
                ];
                populateProjectsList(mockProjects);
            }, 1000);
        }
    }
    
    // Populate projects list with data (either real or mock)
    function populateProjectsList(projects) {
        const projectsList = document.getElementById('projects-list');
        if (!projectsList) return;
        
        // Clear existing content
        projectsList.innerHTML = '';
        
        if (projects.length === 0) {
            projectsList.innerHTML = '<tr><td colspan="5">No projects found</td></tr>';
            return;
        }
        
        // Add rows for each project
        projects.forEach(project => {
            const row = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.textContent = project.name || 'Unnamed Project';
            
            const clientCell = document.createElement('td');
            clientCell.textContent = project.client || 'No Client';
            
            const dateCell = document.createElement('td');
            dateCell.textContent = formatDate(project.dateCreated || project.date_created || new Date().toISOString());
            
            const filesCell = document.createElement('td');
            filesCell.textContent = (project.fileCount || project.file_count || 0).toLocaleString();
            
            const actionsCell = document.createElement('td');
            const detailsButton = document.createElement('button');
            detailsButton.className = 'button secondary';
            detailsButton.textContent = 'Details';
            detailsButton.addEventListener('click', () => {
                alert(`Project Details: ${project.name || 'Unnamed Project'}`);
            });
            
            const exportButton = document.createElement('button');
            exportButton.className = 'button';
            exportButton.textContent = 'Export';
            exportButton.addEventListener('click', () => {
                if (USE_BACKEND) {
                    window.open(`${API_BASE_URL}/api/projects/${project.id}/export`, '_blank');
                } else {
                    alert(`Export Project: ${project.name || 'Unnamed Project'}`);
                }
            });
            
            actionsCell.appendChild(detailsButton);
            actionsCell.appendChild(document.createTextNode(' '));
            actionsCell.appendChild(exportButton);
            
            row.appendChild(nameCell);
            row.appendChild(clientCell);
            row.appendChild(dateCell);
            row.appendChild(filesCell);
            row.appendChild(actionsCell);
            
            projectsList.appendChild(row);
        });
    }
    
    // Load drives for dropdown filter
    async function loadDrives() {
        try {
            if (USE_BACKEND) {
                console.log('Fetching drives from API...');
                const response = await fetch(`${API_BASE_URL}/api/drives`);
                if (!response.ok) throw new Error('Failed to fetch drives');
                const drives = await response.json();
                console.log('Received drives from API:', drives);
                populateDrivesDropdown(drives);
            } else {
                console.log('Using mock drive data...');
                const mockDrives = [
                    { id: 'drive-001', label: 'RED Footage Archive', volumeName: 'RED_ARCHIVE_01' },
                    { id: 'drive-002', label: 'Client Delivery Shuttle', volumeName: 'SHUTTLE_01' },
                    { id: 'drive-003', label: 'Raw Interview Masters', volumeName: 'INTERVIEWS_2023' },
                    { id: 'drive-004', label: 'NYC Shoot Oct 2023', volumeName: 'NYC_OCT23' },
                    { id: 'drive-005', label: 'Personal Projects', volumeName: 'PERSONAL' }
                ];
                populateDrivesDropdown(mockDrives);
            }
        } catch (error) {
            console.error('Error loading drives:', error);
            // Fall back to mock data if API fails
            console.log('Falling back to mock data due to error');
            const mockDrives = [
                { id: 'drive-001', label: 'RED Footage Archive', volumeName: 'RED_ARCHIVE_01' },
                { id: 'drive-002', label: 'Client Delivery Shuttle', volumeName: 'SHUTTLE_01' },
                { id: 'drive-003', label: 'Raw Interview Masters', volumeName: 'INTERVIEWS_2023' },
                { id: 'drive-004', label: 'NYC Shoot Oct 2023', volumeName: 'NYC_OCT23' },
                { id: 'drive-005', label: 'Personal Projects', volumeName: 'PERSONAL' }
            ];
            populateDrivesDropdown(mockDrives);
        }
    }
    
    // Populate drives dropdown
    function populateDrivesDropdown(drives) {
        if (!driveFilter) return;
        
        // Keep the first "All Drives" option
        driveFilter.innerHTML = '<option value="">All Drives</option>';
        
        drives.forEach(drive => {
            const option = document.createElement('option');
            option.value = drive.id;
            option.textContent = drive.label || drive.volumeName;
            driveFilter.appendChild(option);
        });
    }
    
    // Load clients for dropdown
    async function loadClients() {
        try {
            if (USE_BACKEND) {
                console.log('Fetching clients from API...');
                const response = await fetch(`${API_BASE_URL}/api/clients`);
                if (!response.ok) throw new Error('Failed to fetch clients');
                const clients = await response.json();
                console.log('Received clients from API:', clients);
                populateClientsDropdown(clients);
            } else {
                console.log('Using mock client data...');
                const mockClients = [
                    { id: 'client-001', name: 'Acme Productions' },
                    { id: 'client-002', name: 'Global Media' },
                    { id: 'client-003', name: 'Indie Filmworks' },
                    { id: 'client-004', name: 'Studio 54 Digital' },
                    { id: 'client-005', name: 'Personal Projects' }
                ];
                populateClientsDropdown(mockClients);
            }
        } catch (error) {
            console.error('Error loading clients:', error);
            // Fall back to mock data if API fails
            console.log('Falling back to mock client data due to error');
            const mockClients = [
                { id: 'client-001', name: 'Acme Productions' },
                { id: 'client-002', name: 'Global Media' },
                { id: 'client-003', name: 'Indie Filmworks' },
                { id: 'client-004', name: 'Studio 54 Digital' },
                { id: 'client-005', name: 'Personal Projects' }
            ];
            populateClientsDropdown(mockClients);
        }
    }
    
    // Populate clients dropdown
    function populateClientsDropdown(clients) {
        if (!clientFilter || !clientSelect) return;
        
        // Keep the first "All Clients" option in the filter dropdown
        clientFilter.innerHTML = '<option value="">All Clients</option>';
        
        // Keep the first "Select Client" option in the assignment dropdown
        clientSelect.innerHTML = '<option value="">Select Client</option>';
        
        clients.forEach(client => {
            // Add to filter dropdown
            const filterOption = document.createElement('option');
            filterOption.value = client.id;
            filterOption.textContent = client.name;
            clientFilter.appendChild(filterOption);
            
            // Add to assignment dropdown
            const assignOption = document.createElement('option');
            assignOption.value = client.id;
            assignOption.textContent = client.name;
            clientSelect.appendChild(assignOption);
        });
    }
    
    // Search function
    async function search() {
        const query = searchQuery ? searchQuery.value : '';
        const type = searchType ? searchType.value : 'any';
        const transcripts = includeTranscripts ? includeTranscripts.checked : false;
        const drive = driveFilter ? driveFilter.value : '';
        const client = clientFilter ? clientFilter.value : '';
        
        try {
            // Reset selected files when performing a new search
            selectedFiles.clear();
            
            if (USE_BACKEND) {
                console.log('Searching via API...');
                const params = new URLSearchParams({
                    query,
                    type,
                    transcripts: transcripts ? 'true' : 'false',
                    drive,
                    client,
                    page: currentPage,
                    pageSize: PAGE_SIZE
                });
                
                const response = await fetch(`${API_BASE_URL}/api/search?${params}`);
                if (!response.ok) throw new Error('Search failed');
                
                const data = await response.json();
                console.log('Search results from API:', data);
                
                // Update pagination information
                totalPages = data.totalPages;
                currentPage = data.page;
                
                // Update UI
                displayResults(data.results);
                resultsCount.textContent = `${data.total} results found`;
            } else {
                console.log('Generating mock search results...');
                const mockResults = generateMockSearchResults(query, type, transcripts, drive, client);
                displayResults(mockResults);
            }
        } catch (error) {
            console.error('Search error:', error);
            resultsCount.textContent = 'Error: Search failed';
            thumbnailView.innerHTML = '';
            resultsBody.innerHTML = '';
            
            // Fall back to mock data if the API fails
            console.log('Falling back to mock data due to search error');
            const mockResults = generateMockSearchResults('', 'any', false, '', '');
            displayResults(mockResults);
        }
    }
    
    // Mock function to generate fake search results for the demo
    function generateMockSearchResults(query, type, transcripts, drive, client) {
        // This function mimics what would come from the SQLite database
        const results = [];
        const types = ['video', 'audio', 'image', 'document', 'r3d'];
        const extensions = {
            video: ['mp4', 'mov', 'avi', 'mxf'],
            audio: ['wav', 'mp3', 'aac', 'flac'],
            image: ['jpg', 'png', 'tif', 'cr2'],
            document: ['pdf', 'doc', 'xls', 'txt'],
            r3d: ['r3d']
        };
        
        // Generate between 10-50 random results
        const count = Math.floor(Math.random() * 40) + 10;
        
        for (let i = 0; i < count; i++) {
            const fileType = types[Math.floor(Math.random() * types.length)];
            const extension = extensions[fileType][Math.floor(Math.random() * extensions[fileType].length)];
            
            let filename;
            if (query && Math.random() > 0.3) {
                // 70% of results contain the search query
                filename = `${query}_project_${i+1}.${extension}`;
            } else {
                filename = `project_${Math.floor(Math.random() * 100)}_file_${i+1}.${extension}`;
            }
            
            const driveId = drive || `drive-00${Math.floor(Math.random() * 5) + 1}`;
            const driveName = {
                'drive-001': 'RED Footage Archive',
                'drive-002': 'Client Delivery Shuttle',
                'drive-003': 'Raw Interview Masters',
                'drive-004': 'NYC Shoot Oct 2023',
                'drive-005': 'Personal Projects'
            }[driveId] || 'Unknown Drive';
            
            // Random file size between 10MB and 10GB
            const fileSizeBytes = Math.floor(Math.random() * 10 * 1024 * 1024 * 1024) + 10 * 1024 * 1024;
            
            // Random date in the last year
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 365));
            
            // Generate mock path
            const pathSegments = ['footage', 'projects', 'client_deliveries', 'archive', 'raw'];
            const randomFolder = pathSegments[Math.floor(Math.random() * pathSegments.length)];
            const subFolder = fileType === 'r3d' ? 'RDC' : fileType + 's';
            const path = `${randomFolder}/${subFolder}/${filename}`;
            
            // Random client (only if client filter not specified)
            const clientId = client || (Math.random() > 0.7 ? `client-00${Math.floor(Math.random() * 5) + 1}` : null);
            
            // Create mock transcription for audio/video files if transcripts option is checked
            let transcription = null;
            if ((fileType === 'video' || fileType === 'audio') && transcripts && Math.random() > 0.3) {
                transcription = {
                    text: `This is a mock transcription for ${filename}. It contains the search term "${query}" somewhere in the text.`,
                    language: 'en',
                    segments: [
                        { start: 0, end: 10, text: 'This is the first segment of the transcription.' },
                        { start: 10, end: 20, text: `It contains the search term "${query}" somewhere in the text.` },
                        { start: 20, end: 30, text: 'This is the final segment of the mock transcription.' }
                    ]
                };
            }
            
            // Only include R3D files in the results if they made it past the filters
            if (fileType === 'r3d' && !query.toLowerCase().includes('r3d') && type !== 'extension' && Math.random() > 0.5) {
                continue;
            }
            
            // Create thumbnail path for media files
            let thumbnailPath = null;
            if (fileType === 'video' || fileType === 'image' || fileType === 'r3d') {
                thumbnailPath = `${THUMBNAILS_PATH}/${driveId}/${filename.replace(/\.[^.]+$/, '')}_${Math.random().toString(36).substring(2, 10)}.jpg`;
            }
            
            // Create the result object
            results.push({
                id: `file-${i+1}-${Math.random().toString(36).substring(2, 10)}`,
                filename,
                extension,
                path,
                driveId,
                driveName,
                sizeBytes: fileSizeBytes,
                dateModified: date.toISOString(),
                mimeType: `${fileType}/${extension}`,
                thumbnailPath,
                transcription,
                clientId
            });
        }
        
        // Store results for use with pagination
        currentSearchResults = results;
        
        // Calculate total pages
        totalPages = Math.ceil(results.length / PAGE_SIZE);
        
        // Return paginated results
        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        
        return results.slice(startIdx, endIdx);
    }
    
    // Display search results
    function displayResults(results) {
        // Update results count
        resultsCount.textContent = `${currentSearchResults.length} results found`;
        
        // Clear existing results
        thumbnailView.innerHTML = '';
        resultsBody.innerHTML = '';
        
        if (results.length === 0) {
            thumbnailView.innerHTML = '<p>No results match your search criteria.</p>';
            return;
        }
        
        // Display thumbnails
        results.forEach(result => {
            // Only create thumbnails for media files that have thumbnails
            if (result.thumbnailPath) {
                const thumbnailItem = document.createElement('div');
                thumbnailItem.className = 'thumbnail-item';
                thumbnailItem.dataset.id = result.id;
                
                // Placeholder image for demo
                // In production, the src would be the actual thumbnail path
                const thumbImg = document.createElement('img');
                thumbImg.src = generatePlaceholderImageUrl(result);
                thumbImg.alt = result.filename;
                
                const thumbInfo = document.createElement('div');
                thumbInfo.className = 'thumbnail-info';
                
                const thumbFilename = document.createElement('div');
                thumbFilename.className = 'filename';
                thumbFilename.textContent = result.filename;
                
                const thumbSize = document.createElement('div');
                thumbSize.textContent = formatFileSize(result.sizeBytes);
                
                thumbInfo.appendChild(thumbFilename);
                thumbInfo.appendChild(thumbSize);
                thumbnailItem.appendChild(thumbImg);
                thumbnailItem.appendChild(thumbInfo);
                
                // Add click event to show modal
                thumbnailItem.addEventListener('click', () => {
                    showAssetPreview(result);
                });
                
                thumbnailView.appendChild(thumbnailItem);
            }
        });
        
        // Display table rows
        results.forEach(result => {
            const row = document.createElement('tr');
            
            // Create checkbox for file selection
            const checkboxCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'file-checkbox';
            checkbox.dataset.id = result.id;
            
            // Add event listener to track selected files
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedFiles.add(result.id);
                } else {
                    selectedFiles.delete(result.id);
                }
            });
            
            checkboxCell.appendChild(checkbox);
            
            // Create thumbnail cell
            const thumbnailCell = document.createElement('td');
            if (result.thumbnailPath) {
                const thumbImg = document.createElement('img');
                thumbImg.src = generatePlaceholderImageUrl(result);
                thumbImg.alt = result.filename;
                thumbImg.style.width = '50px';
                thumbImg.style.height = '40px';
                thumbImg.style.objectFit = 'cover';
                thumbImg.style.cursor = 'pointer';
                
                // Add click event to show modal
                thumbImg.addEventListener('click', () => {
                    showAssetPreview(result);
                });
                
                thumbnailCell.appendChild(thumbImg);
            } else {
                thumbnailCell.textContent = 'No thumbnail';
            }
            
            // Create filename cell
            const filenameCell = document.createElement('td');
            filenameCell.textContent = result.filename;
            
            // Create drive cell
            const driveCell = document.createElement('td');
            driveCell.textContent = result.driveName;
            
            // Create path cell
            const pathCell = document.createElement('td');
            pathCell.textContent = result.path;
            
            // Create size cell
            const sizeCell = document.createElement('td');
            sizeCell.textContent = formatFileSize(result.sizeBytes);
            
            // Create date cell
            const dateCell = document.createElement('td');
            dateCell.textContent = formatDate(result.dateModified);
            
            // Create actions cell
            const actionsCell = document.createElement('td');
            const detailsButton = document.createElement('button');
            detailsButton.className = 'button secondary';
            detailsButton.textContent = 'Details';
            detailsButton.addEventListener('click', () => {
                showAssetPreview(result);
            });
            actionsCell.appendChild(detailsButton);
            
            // Append all cells to row
            row.appendChild(checkboxCell);
            row.appendChild(thumbnailCell);
            row.appendChild(filenameCell);
            row.appendChild(driveCell);
            row.appendChild(pathCell);
            row.appendChild(sizeCell);
            row.appendChild(dateCell);
            row.appendChild(actionsCell);
            
            // Append row to table body
            resultsBody.appendChild(row);
        });
        
        // Update pagination
        updatePagination();
    }
    
    // Update pagination controls
    function updatePagination() {
        if (!pagination) return;
        
        pagination.innerHTML = '';
        
        if (totalPages <= 1) return;
        
        // Previous button
        if (currentPage > 1) {
            const prevButton = document.createElement('button');
            prevButton.className = 'page-button';
            prevButton.textContent = '< Previous';
            prevButton.addEventListener('click', () => {
                currentPage--;
                paginateResults();
            });
            pagination.appendChild(prevButton);
        }
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            // Only show 5 page buttons
            if (
                i === 1 || 
                i === totalPages || 
                (i >= currentPage - 1 && i <= currentPage + 1)
            ) {
                const pageButton = document.createElement('button');
                pageButton.className = `page-button ${i === currentPage ? 'active' : ''}`;
                pageButton.textContent = i;
                pageButton.addEventListener('click', () => {
                    currentPage = i;
                    paginateResults();
                });
                pagination.appendChild(pageButton);
            } else if (
                (i === currentPage - 2 && currentPage > 3) ||
                (i === currentPage + 2 && currentPage < totalPages - 2)
            ) {
                // Show ellipsis
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.className = 'ellipsis';
                pagination.appendChild(ellipsis);
            }
        }
        
        // Next button
        if (currentPage < totalPages) {
            const nextButton = document.createElement('button');
            nextButton.className = 'page-button';
            nextButton.textContent = 'Next >';
            nextButton.addEventListener('click', () => {
                currentPage++;
                paginateResults();
            });
            pagination.appendChild(nextButton);
        }
    }
    
    // Handle pagination
    function paginateResults() {
        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        const paginatedResults = currentSearchResults.slice(startIdx, endIdx);
        
        displayResults(paginatedResults);
    }
    
    // Show asset preview modal
    function showAssetPreview(asset) {
        // Set modal content
        modalFilename.textContent = asset.filename;
        modalPath.textContent = asset.path;
        modalDrive.textContent = asset.driveName;
        modalSize.textContent = formatFileSize(asset.sizeBytes);
        modalDate.textContent = formatDate(asset.dateModified);
        
        // Set preview image
        previewImage.src = generatePlaceholderImageUrl(asset);
        previewImage.alt = asset.filename;
        previewImage.style.display = 'block';
        
        // Show transcription if available
        const transcriptionSection = document.getElementById('modal-transcription');
        if (asset.transcription) {
            transcriptionSection.style.display = 'block';
            transcriptionContent.textContent = asset.transcription.text;
        } else {
            transcriptionSection.style.display = 'none';
        }
        
        // Show modal
        thumbnailModal.style.display = 'block';
    }
    
    // Add new client
    async function addClient() {
        const clientName = newClientName.value.trim();
        
        if (!clientName) {
            alert('Please enter a client name');
            return;
        }
        
        try {
            if (USE_BACKEND) {
                console.log('Adding client via API...');
                const response = await fetch(`${API_BASE_URL}/api/clients`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: clientName }),
                });
                
                if (!response.ok) throw new Error('Failed to add client');
                
                const newClient = await response.json();
                console.log('New client created:', newClient);
                
                // Update the dropdowns
                const option1 = document.createElement('option');
                option1.value = newClient.id;
                option1.textContent = newClient.name;
                clientFilter.appendChild(option1);
                
                const option2 = document.createElement('option');
                option2.value = newClient.id;
                option2.textContent = newClient.name;
                clientSelect.appendChild(option2);
            } else {
                console.log('Adding mock client...');
                // Mock client creation
                const newClientId = 'client-' + Math.floor(Math.random() * 1000);
                
                const option1 = document.createElement('option');
                option1.value = newClientId;
                option1.textContent = clientName;
                clientFilter.appendChild(option1);
                
                const option2 = document.createElement('option');
                option2.value = newClientId;
                option2.textContent = clientName;
                clientSelect.appendChild(option2);
            }
            
            // Clear input and show success
            newClientName.value = '';
            alert(`Client "${clientName}" added successfully`);
            
            // Refresh all lists to show the new client
            loadDrives();  // Refresh all drive dropdowns
            loadClients(); // Refresh client filters and dropdowns
            
        } catch (error) {
            console.error('Error adding client:', error);
            alert('Failed to add client: ' + error.message);
            
            // In case of error, still add the client to the UI
            const newClientId = 'client-' + Math.floor(Math.random() * 1000);
            
            const option1 = document.createElement('option');
            option1.value = newClientId;
            option1.textContent = clientName;
            clientFilter.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = newClientId;
            option2.textContent = clientName;
            clientSelect.appendChild(option2);
            
            newClientName.value = '';
        }
    }
    
    // Assign selected files to client
    async function assignFilesToClient() {
        const clientId = clientSelect.value;
        
        if (!clientId) {
            alert('Please select a client');
            return;
        }
        
        if (selectedFiles.size === 0) {
            alert('Please select at least one file');
            return;
        }
        
        const clientName = clientSelect.options[clientSelect.selectedIndex].text;
        const fileIds = Array.from(selectedFiles);
        
        try {
            if (USE_BACKEND) {
                console.log('Assigning files to client via API...');
                console.log(`Client ID: ${clientId}, Files: ${fileIds.join(', ')}`);
                
                const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/assign-files`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ fileIds }),
                });
                
                if (!response.ok) throw new Error('Failed to assign files');
                
                const result = await response.json();
                console.log('Assignment result:', result);
                
                // Success message
                alert(`Successfully assigned ${fileIds.length} files to client: ${clientName}`);
            } else {
                console.log('Mock file assignment...');
                // Just show a success message in mock mode
                alert(`Assigned ${fileIds.length} files to client: ${clientName}`);
            }
            
            // Clear selections
            selectedFiles.clear();
            
            // Uncheck all checkboxes
            document.querySelectorAll('.file-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
            
        } catch (error) {
            console.error('Error assigning files:', error);
            alert('Failed to assign files: ' + error.message);
            
            // Still clear the selection even if there was an error
            selectedFiles.clear();
            document.querySelectorAll('.file-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
        }
    }
    
    // Helper function to generate image URL for thumbnails
    function generatePlaceholderImageUrl(asset) {
        // If we're using the backend and have a real thumbnail path, use it
        if (USE_BACKEND && asset.thumbnailPath) {
            console.log('Thumbnail path:', asset.thumbnailPath);
            // Extract drive ID from the path (usually a UUID format)
            const pathParts = asset.thumbnailPath.split('/');
            if (pathParts.length >= 2) {
                const driveId = pathParts[pathParts.length - 2];
                const filename = pathParts[pathParts.length - 1];
                return `${API_BASE_URL}/thumbnails/${driveId}/${filename}`;
            }
            // Fallback if path format is unexpected
            return `${API_BASE_URL}/thumbnails/${asset.thumbnailPath}`;
        }
        
        // If no path available or not using backend, generate a placeholder
        let fileType = 'document';
        if (asset.mimeType) {
            if (asset.mimeType.startsWith('video/') || asset.extension === 'r3d') {
                fileType = 'video';
            } else if (asset.mimeType.startsWith('image/')) {
                fileType = 'image';
            } else if (asset.mimeType.startsWith('audio/')) {
                fileType = 'audio';
            }
        }
        
        // Generate a placeholder image with the filename
        return `https://via.placeholder.com/320x240/4285F4/FFFFFF?text=${fileType}:${asset.filename}`;
    }
    
    // Helper function to format file size
    function formatFileSize(bytes) {
        if (bytes < 1024) {
            return bytes + ' B';
        } else if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + ' KB';
        } else if (bytes < 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        } else {
            return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        }
    }
    
    // Helper function to format date
    function formatDate(isoDate) {
        const date = new Date(isoDate);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    
    // Load reports data from API
    async function loadReportsData() {
        try {
            if (USE_BACKEND) {
                console.log('Fetching reports data from API...');
                
                // Load storage usage data
                const storageResponse = await fetch(`${API_BASE_URL}/api/reports/storage`);
                if (storageResponse.ok) {
                    const storageData = await storageResponse.json();
                    console.log('Received storage data:', storageData);
                    displayStorageChart(storageData.drives);
                }
                
                // Load file types data
                const fileTypesResponse = await fetch(`${API_BASE_URL}/api/reports/filetypes`);
                if (fileTypesResponse.ok) {
                    const fileTypesData = await fileTypesResponse.json();
                    console.log('Received file types data:', fileTypesData);
                    displayFileTypesChart(fileTypesData.fileTypes);
                }
            } else {
                console.log('Using mock reports data...');
                // Display mock charts
                displayMockStorageChart();
                displayMockFileTypesChart();
            }
        } catch (error) {
            console.error('Error loading reports data:', error);
            // Fall back to mock charts
            displayMockStorageChart();
            displayMockFileTypesChart();
        }
    }
    
    // Display storage usage chart
    function displayStorageChart(drivesData) {
        const chartContainer = document.getElementById('storage-chart');
        if (!chartContainer) return;
        
        // Create simple visual representation with CSS
        chartContainer.innerHTML = '';
        
        if (!drivesData || drivesData.length === 0) {
            chartContainer.innerHTML = '<p>No drive data available</p>';
            return;
        }
        
        // Create chart heading
        const heading = document.createElement('h4');
        heading.textContent = 'Storage Usage by Drive';
        heading.style.textAlign = 'center';
        heading.style.marginBottom = '20px';
        chartContainer.appendChild(heading);
        
        // Create container for bars
        const barsContainer = document.createElement('div');
        barsContainer.style.display = 'flex';
        barsContainer.style.flexDirection = 'column';
        barsContainer.style.gap = '10px';
        barsContainer.style.width = '100%';
        chartContainer.appendChild(barsContainer);
        
        // Find the drive with maximum capacity for scaling
        const maxCapacity = Math.max(...drivesData.map(drive => drive.sizeBytes || 0));
        
        // Add a bar for each drive
        drivesData.forEach(drive => {
            const driveLabel = drive.label || drive.volumeName || 'Unnamed Drive';
            const usedBytes = drive.usedBytes || 0;
            const freeBytes = (drive.sizeBytes || 0) - usedBytes;
            const percentUsed = drive.sizeBytes ? (usedBytes / drive.sizeBytes * 100).toFixed(1) : 0;
            
            // Container for this drive's data
            const driveContainer = document.createElement('div');
            driveContainer.style.display = 'flex';
            driveContainer.style.alignItems = 'center';
            driveContainer.style.marginBottom = '15px';
            
            // Drive label
            const label = document.createElement('div');
            label.textContent = driveLabel;
            label.style.width = '150px';
            label.style.fontWeight = 'bold';
            label.style.marginRight = '10px';
            label.style.whiteSpace = 'nowrap';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            
            // Bar container
            const barContainer = document.createElement('div');
            barContainer.style.flex = '1';
            barContainer.style.height = '25px';
            barContainer.style.backgroundColor = '#eee';
            barContainer.style.borderRadius = '4px';
            barContainer.style.overflow = 'hidden';
            barContainer.style.position = 'relative';
            
            // Calculate width based on max capacity
            const widthPercent = (drive.sizeBytes / maxCapacity * 100).toFixed(1);
            barContainer.style.width = `${widthPercent}%`;
            
            // Used space bar
            const usedBar = document.createElement('div');
            usedBar.style.height = '100%';
            usedBar.style.width = `${percentUsed}%`;
            usedBar.style.backgroundColor = percentUsed > 90 ? '#e74c3c' : percentUsed > 70 ? '#f39c12' : '#2ecc71';
            
            // Size labels
            const sizeInfo = document.createElement('div');
            sizeInfo.textContent = `${formatFileSize(usedBytes)} / ${formatFileSize(drive.sizeBytes || 0)} (${percentUsed}%)`;
            sizeInfo.style.marginLeft = '10px';
            sizeInfo.style.whiteSpace = 'nowrap';
            
            barContainer.appendChild(usedBar);
            driveContainer.appendChild(label);
            driveContainer.appendChild(barContainer);
            driveContainer.appendChild(sizeInfo);
            barsContainer.appendChild(driveContainer);
        });
    }
    
    // Display mock storage chart when API is not available
    function displayMockStorageChart() {
        const mockDrives = [
            {
                id: 'drive-001',
                label: 'RED Footage Archive',
                volumeName: 'RED_ARCHIVE_01',
                sizeBytes: 8 * 1024 * 1024 * 1024 * 1024, // 8TB
                usedBytes: 5.7 * 1024 * 1024 * 1024 * 1024, // 5.7TB
                fileCount: 1254
            },
            {
                id: 'drive-002',
                label: 'Client Delivery Shuttle',
                volumeName: 'SHUTTLE_01',
                sizeBytes: 4 * 1024 * 1024 * 1024 * 1024, // 4TB
                usedBytes: 2.8 * 1024 * 1024 * 1024 * 1024, // 2.8TB
                fileCount: 786
            },
            {
                id: 'drive-003',
                label: 'Raw Interview Masters',
                volumeName: 'INTERVIEWS_2023',
                sizeBytes: 12 * 1024 * 1024 * 1024 * 1024, // 12TB
                usedBytes: 8.3 * 1024 * 1024 * 1024 * 1024, // 8.3TB
                fileCount: 3254
            },
            {
                id: 'drive-004',
                label: 'NYC Shoot Oct 2023',
                volumeName: 'NYC_OCT23',
                sizeBytes: 4 * 1024 * 1024 * 1024 * 1024, // 4TB
                usedBytes: 3.2 * 1024 * 1024 * 1024 * 1024, // 3.2TB
                fileCount: 985
            },
            {
                id: 'drive-005',
                label: 'Personal Projects',
                volumeName: 'PERSONAL',
                sizeBytes: 2 * 1024 * 1024 * 1024 * 1024, // 2TB
                usedBytes: 1.5 * 1024 * 1024 * 1024 * 1024, // 1.5TB
                fileCount: 520
            }
        ];
        
        displayStorageChart(mockDrives);
    }
    
    // Display file types chart
    function displayFileTypesChart(fileTypesData) {
        const chartContainer = document.getElementById('filetype-chart');
        if (!chartContainer) return;
        
        // Create simple visual representation with CSS
        chartContainer.innerHTML = '';
        
        if (!fileTypesData || fileTypesData.length === 0) {
            chartContainer.innerHTML = '<p>No file type data available</p>';
            return;
        }
        
        // Create chart heading
        const heading = document.createElement('h4');
        heading.textContent = 'File Types Distribution';
        heading.style.textAlign = 'center';
        heading.style.marginBottom = '20px';
        chartContainer.appendChild(heading);
        
        // Create container for the pie chart visualization
        const chartWrapper = document.createElement('div');
        chartWrapper.style.display = 'flex';
        chartWrapper.style.flexWrap = 'wrap';
        chartWrapper.style.justifyContent = 'center';
        chartWrapper.style.gap = '20px';
        chartContainer.appendChild(chartWrapper);
        
        // Calculate total files
        const totalFiles = fileTypesData.reduce((sum, type) => sum + type.count, 0);
        const totalBytes = fileTypesData.reduce((sum, type) => sum + (type.totalBytes || 0), 0);
        
        // Only display top file types (limit to 10)
        const topFileTypes = fileTypesData.slice(0, 10);
        
        // Create pie chart section
        const pieSection = document.createElement('div');
        pieSection.style.flex = '1';
        pieSection.style.minWidth = '300px';
        pieSection.style.display = 'flex';
        pieSection.style.flexDirection = 'column';
        pieSection.style.alignItems = 'center';
        
        // Create legend section
        const legendSection = document.createElement('div');
        legendSection.style.flex = '1';
        legendSection.style.minWidth = '300px';
        
        // Create pie chart (simplified CSS version)
        const pieChart = document.createElement('div');
        pieChart.style.width = '200px';
        pieChart.style.height = '200px';
        pieChart.style.borderRadius = '50%';
        pieChart.style.background = 'conic-gradient(';
        
        // Colors for different file types
        const colors = [
            '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#d35400', '#34495e', '#7f8c8d', '#c0392b'
        ];
        
        // Build legend items and conic gradient
        let startPercent = 0;
        let gradientString = '';
        
        topFileTypes.forEach((fileType, index) => {
            const percent = (fileType.count / totalFiles * 100).toFixed(1);
            const endPercent = startPercent + parseFloat(percent);
            const color = colors[index % colors.length];
            
            // Add to gradient string
            gradientString += `${color} ${startPercent}%, ${color} ${endPercent}%`;
            if (index < topFileTypes.length - 1) {
                gradientString += ', ';
            }
            
            // Create legend item
            const legendItem = document.createElement('div');
            legendItem.style.display = 'flex';
            legendItem.style.alignItems = 'center';
            legendItem.style.marginBottom = '10px';
            
            const colorBox = document.createElement('div');
            colorBox.style.width = '15px';
            colorBox.style.height = '15px';
            colorBox.style.backgroundColor = color;
            colorBox.style.marginRight = '10px';
            
            const label = document.createElement('div');
            const extension = fileType.extension || 'unknown';
            label.textContent = `${extension}: ${fileType.count} files (${percent}%)`;
            
            const sizeText = document.createElement('div');
            sizeText.textContent = fileType.totalBytes ? formatFileSize(fileType.totalBytes) : 'N/A';
            sizeText.style.marginLeft = 'auto';
            sizeText.style.color = '#666';
            
            legendItem.appendChild(colorBox);
            legendItem.appendChild(label);
            legendItem.appendChild(sizeText);
            legendSection.appendChild(legendItem);
            
            startPercent = endPercent;
        });
        
        // Finish the pie chart
        pieChart.style.background = `conic-gradient(${gradientString})`;
        
        // Add total information
        const totalInfo = document.createElement('div');
        totalInfo.style.marginTop = '15px';
        totalInfo.style.textAlign = 'center';
        
        const totalFilesText = document.createElement('div');
        totalFilesText.textContent = `Total Files: ${totalFiles.toLocaleString()}`;
        totalFilesText.style.fontWeight = 'bold';
        
        const totalSizeText = document.createElement('div');
        totalSizeText.textContent = `Total Size: ${formatFileSize(totalBytes)}`;
        
        totalInfo.appendChild(totalFilesText);
        totalInfo.appendChild(totalSizeText);
        
        // Add elements to the chart wrapper
        pieSection.appendChild(pieChart);
        pieSection.appendChild(totalInfo);
        chartWrapper.appendChild(pieSection);
        chartWrapper.appendChild(legendSection);
    }
    
    // Display mock file types chart when API is not available
    function displayMockFileTypesChart() {
        const mockFileTypes = [
            { extension: 'r3d', count: 2450, totalBytes: 4.5 * 1024 * 1024 * 1024 * 1024 },
            { extension: 'mp4', count: 1873, totalBytes: 2.1 * 1024 * 1024 * 1024 * 1024 },
            { extension: 'mov', count: 1245, totalBytes: 1.8 * 1024 * 1024 * 1024 * 1024 },
            { extension: 'jpg', count: 5631, totalBytes: 245 * 1024 * 1024 * 1024 },
            { extension: 'cr2', count: 3254, totalBytes: 310 * 1024 * 1024 * 1024 },
            { extension: 'wav', count: 879, totalBytes: 540 * 1024 * 1024 * 1024 },
            { extension: 'arw', count: 1532, totalBytes: 180 * 1024 * 1024 * 1024 },
            { extension: 'psd', count: 325, totalBytes: 85 * 1024 * 1024 * 1024 },
            { extension: 'pdf', count: 142, totalBytes: 5 * 1024 * 1024 * 1024 },
            { extension: 'mxf', count: 498, totalBytes: 750 * 1024 * 1024 * 1024 }
        ];
        
        displayFileTypesChart(mockFileTypes);
    }
    
    // LOCATIONS FUNCTIONALITY
    
    // Load locations data and populate UI components
    async function loadLocationsData() {
        try {
            // Load location summary for summary section
            loadLocationsSummary();
            
            // Load unique bays for bay filter dropdown
            loadLocationBays();
            
            // Set up event listeners for the locations page
            setupLocationsEventListeners();
        } catch (error) {
            console.error('Error loading locations data:', error);
        }
    }
    
    // Set up event listeners for locations page
    function setupLocationsEventListeners() {
        // Create location button
        const createLocationButton = document.getElementById('create-location-button');
        if (createLocationButton) {
            createLocationButton.addEventListener('click', createNewLocation);
        }
        
        // Create batch locations button
        const createBatchButton = document.getElementById('create-batch-locations-button');
        if (createBatchButton) {
            createBatchButton.addEventListener('click', createBatchLocations);
        }
        
        // Load locations button
        const loadLocationsButton = document.getElementById('load-locations-button');
        if (loadLocationsButton) {
            loadLocationsButton.addEventListener('click', loadFilteredLocations);
        }
        
        // Bay filter dropdown - when changed, update shelf dropdown
        const bayFilter = document.getElementById('location-bay-filter');
        if (bayFilter) {
            bayFilter.addEventListener('change', (e) => {
                if (e.target.value) {
                    loadLocationShelves(parseInt(e.target.value));
                    
                    // Also update the visual layout
                    renderBayVisualization(parseInt(e.target.value));
                } else {
                    // Reset shelf filter
                    const shelfFilter = document.getElementById('location-shelf-filter');
                    if (shelfFilter) {
                        shelfFilter.innerHTML = '<option value="">All Shelves</option>';
                    }
                    
                    // Reset visualization
                    const visualization = document.getElementById('bay-shelf-visualization');
                    if (visualization) {
                        visualization.innerHTML = '<p>Select a bay to view visual layout</p>';
                    }
                }
            });
        }
    }
    
    // Create a new location
    async function createNewLocation() {
        const bay = document.getElementById('new-location-bay').value;
        const shelf = document.getElementById('new-location-shelf').value;
        const position = document.getElementById('new-location-position').value;
        const section = document.getElementById('new-location-section').value;
        
        if (!bay || !shelf || !position) {
            alert('Bay, shelf, and position are required');
            return;
        }
        
        try {
            if (USE_BACKEND) {
                console.log('Creating location via API...');
                const response = await fetch(`${API_BASE_URL}/api/locations`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        bay: parseInt(bay),
                        shelf: parseInt(shelf),
                        position: parseInt(position),
                        section: section || undefined
                    }),
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to create location');
                }
                
                const newLocation = await response.json();
                console.log('Location created:', newLocation);
                
                // Clear the inputs
                document.getElementById('new-location-bay').value = '';
                document.getElementById('new-location-shelf').value = '';
                document.getElementById('new-location-position').value = '';
                document.getElementById('new-location-section').value = '';
                
                // Refresh data
                loadLocationsSummary();
                loadLocationBays();
                
                // Show success message
                alert(`Location ${newLocation.locationId} created successfully`);
                
                // If filters match the new location, refresh the locations list
                const bayFilter = document.getElementById('location-bay-filter').value;
                const shelfFilter = document.getElementById('location-shelf-filter').value;
                
                if ((!bayFilter || bayFilter == bay) && (!shelfFilter || shelfFilter == shelf)) {
                    loadFilteredLocations();
                }
                
                // Update visualization if the bay matches
                if ((!bayFilter || bayFilter == bay)) {
                    renderBayVisualization(parseInt(bay));
                }
            } else {
                // Mock create location
                alert(`Mock: Created location B${bay}-S${shelf}-P${position}`);
                
                // Clear inputs
                document.getElementById('new-location-bay').value = '';
                document.getElementById('new-location-shelf').value = '';
                document.getElementById('new-location-position').value = '';
                document.getElementById('new-location-section').value = '';
                
                // Update with mock data
                loadMockLocationsSummary();
                populateMockLocationBays();
            }
        } catch (error) {
            console.error('Error creating location:', error);
            alert('Failed to create location: ' + error.message);
        }
    }
    
    // Create batch locations
    async function createBatchLocations() {
        const bay = document.getElementById('batch-bay').value;
        const shelf = document.getElementById('batch-shelf').value;
        const positions = document.getElementById('batch-positions').value;
        const section = document.getElementById('batch-section').value;
        
        if (!bay || !shelf || !positions) {
            alert('Bay, shelf, and number of positions are required');
            return;
        }
        
        const numPositions = parseInt(positions);
        if (numPositions <= 0 || numPositions > 50) {
            alert('Number of positions must be between 1 and 50');
            return;
        }
        
        try {
            if (USE_BACKEND) {
                console.log('Creating batch locations via API...');
                
                // Create array of location objects
                const locations = [];
                for (let pos = 1; pos <= numPositions; pos++) {
                    locations.push({
                        bay: parseInt(bay),
                        shelf: parseInt(shelf),
                        position: pos,
                        section: section || undefined,
                        status: 'EMPTY'
                    });
                }
                
                const response = await fetch(`${API_BASE_URL}/api/locations/batch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ locations }),
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to create batch locations');
                }
                
                const result = await response.json();
                console.log('Batch locations created:', result);
                
                // Clear the inputs
                document.getElementById('batch-bay').value = '';
                document.getElementById('batch-shelf').value = '';
                document.getElementById('batch-section').value = '';
                
                // Refresh data
                loadLocationsSummary();
                loadLocationBays();
                
                // Show success message
                alert(`Created ${result.created.length} locations successfully`);
                
                // If filters match the new locations, refresh the locations list
                const bayFilter = document.getElementById('location-bay-filter').value;
                const shelfFilter = document.getElementById('location-shelf-filter').value;
                
                if ((!bayFilter || bayFilter == bay) && (!shelfFilter || shelfFilter == shelf)) {
                    loadFilteredLocations();
                }
                
                // Update visualization if the bay matches
                if ((!bayFilter || bayFilter == bay)) {
                    renderBayVisualization(parseInt(bay));
                }
            } else {
                // Mock create batch locations
                alert(`Mock: Created ${numPositions} locations in Bay ${bay}, Shelf ${shelf}`);
                
                // Clear inputs
                document.getElementById('batch-bay').value = '';
                document.getElementById('batch-shelf').value = '';
                document.getElementById('batch-section').value = '';
                
                // Update with mock data
                loadMockLocationsSummary();
                populateMockLocationBays();
            }
        } catch (error) {
            console.error('Error creating batch locations:', error);
            alert('Failed to create batch locations: ' + error.message);
        }
    }
    
    // Load filtered locations based on user selections
    async function loadFilteredLocations() {
        const bay = document.getElementById('location-bay-filter').value;
        const shelf = document.getElementById('location-shelf-filter').value;
        const status = document.getElementById('location-status-filter').value;
        
        try {
            const locationsList = document.getElementById('locations-list');
            if (!locationsList) return;
            
            // Show loading indicator
            locationsList.innerHTML = '<tr><td colspan="6">Loading locations...</td></tr>';
            
            if (USE_BACKEND) {
                console.log('Fetching locations from API...');
                
                // Build query parameters
                const params = new URLSearchParams();
                if (bay) params.append('bay', bay);
                if (shelf) params.append('shelf', shelf);
                if (status) params.append('status', status);
                
                const url = `${API_BASE_URL}/api/locations${params.toString() ? '?' + params.toString() : ''}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error('Failed to fetch locations');
                }
                
                const locations = await response.json();
                console.log('Received locations:', locations);
                
                // Populate the table
                populateLocationsTable(locations);
                
                // Update visualization if bay is selected
                if (bay) {
                    renderBayVisualization(parseInt(bay));
                }
            } else {
                // Generate mock locations data
                console.log('Generating mock locations data...');
                const mockLocations = generateMockLocations(bay, shelf, status);
                
                // Populate the table with mock data
                populateLocationsTable(mockLocations);
                
                // Update visualization with mock data
                if (bay) {
                    renderMockBayVisualization(parseInt(bay), shelf ? parseInt(shelf) : null);
                }
            }
        } catch (error) {
            console.error('Error loading locations:', error);
            const locationsList = document.getElementById('locations-list');
            if (locationsList) {
                locationsList.innerHTML = '<tr><td colspan="6">Error loading locations</td></tr>';
            }
        }
    }
    
    // Populate locations table with data
    function populateLocationsTable(locations) {
        const locationsList = document.getElementById('locations-list');
        if (!locationsList) return;
        
        // Clear existing content
        locationsList.innerHTML = '';
        
        if (locations.length === 0) {
            locationsList.innerHTML = '<tr><td colspan="6">No locations found matching the criteria</td></tr>';
            return;
        }
        
        // Add a row for each location
        locations.forEach(location => {
            const row = document.createElement('tr');
            
            // Determine CSS class based on status
            if (location.status === 'OCCUPIED') {
                row.classList.add('occupied-location');
            } else if (location.status === 'RESERVED') {
                row.classList.add('reserved-location');
            } else if (location.status === 'MAINTENANCE') {
                row.classList.add('maintenance-location');
            }
            
            // Location ID cell
            const idCell = document.createElement('td');
            idCell.textContent = location.locationId || `B${location.bay}-S${location.shelf}-P${location.position}`;
            
            // Status cell
            const statusCell = document.createElement('td');
            
            // Create status dropdown for changing status
            const statusSelect = document.createElement('select');
            statusSelect.className = 'location-status-select';
            statusSelect.dataset.locationId = location._id;
            
            const statusOptions = ['EMPTY', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];
            statusOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                option.selected = location.status === opt;
                statusSelect.appendChild(option);
            });
            
            // Add event listener to update status
            statusSelect.addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                const locationId = e.target.dataset.locationId;
                
                try {
                    if (USE_BACKEND) {
                        const response = await fetch(`${API_BASE_URL}/api/locations/${locationId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ status: newStatus }),
                        });
                        
                        if (!response.ok) {
                            throw new Error('Failed to update location status');
                        }
                        
                        // Refresh data to reflect changes
                        loadLocationsSummary();
                        
                        // Update the row class
                        if (newStatus === 'OCCUPIED') {
                            row.className = 'occupied-location';
                        } else if (newStatus === 'RESERVED') {
                            row.className = 'reserved-location';
                        } else if (newStatus === 'MAINTENANCE') {
                            row.className = 'maintenance-location';
                        } else {
                            row.className = '';
                        }
                    } else {
                        // Update UI for mock mode
                        if (newStatus === 'OCCUPIED') {
                            row.className = 'occupied-location';
                        } else if (newStatus === 'RESERVED') {
                            row.className = 'reserved-location';
                        } else if (newStatus === 'MAINTENANCE') {
                            row.className = 'maintenance-location';
                        } else {
                            row.className = '';
                        }
                    }
                } catch (error) {
                    console.error('Error updating location status:', error);
                    alert('Failed to update location status: ' + error.message);
                    
                    // Reset to previous value on error
                    e.target.value = location.status;
                }
            });
            
            statusCell.appendChild(statusSelect);
            
            // Occupied By cell
            const occupiedByCell = document.createElement('td');
            
            if (location.occupiedBy) {
                // Fetch drive details if available
                if (USE_BACKEND) {
                    fetch(`${API_BASE_URL}/api/drives/${location.occupiedBy}`)
                        .then(response => response.ok ? response.json() : Promise.reject('Drive not found'))
                        .then(drive => {
                            occupiedByCell.textContent = drive.label || drive.volumeName || drive.driveId || location.occupiedBy;
                        })
                        .catch(err => {
                            console.error('Error fetching drive:', err);
                            occupiedByCell.textContent = location.occupiedBy;
                        });
                } else {
                    occupiedByCell.textContent = `Drive ${location.occupiedBy}`;
                }
            } else {
                occupiedByCell.textContent = '-';
            }
            
            // Section cell
            const sectionCell = document.createElement('td');
            sectionCell.textContent = location.section || '-';
            
            // Notes cell
            const notesCell = document.createElement('td');
            if (location.notes) {
                notesCell.textContent = location.notes;
            } else {
                // Add an "Add Note" button
                const addNoteButton = document.createElement('button');
                addNoteButton.className = 'button small';
                addNoteButton.textContent = '+ Add Note';
                addNoteButton.dataset.locationId = location._id;
                
                addNoteButton.addEventListener('click', function() {
                    const note = prompt('Enter a note for this location:');
                    if (note !== null) {
                        addNoteToLocation(location._id, note, notesCell);
                    }
                });
                
                notesCell.appendChild(addNoteButton);
            }
            
            // Actions cell
            const actionsCell = document.createElement('td');
            
            const assignDriveButton = document.createElement('button');
            assignDriveButton.className = 'button small';
            assignDriveButton.textContent = 'Assign Drive';
            assignDriveButton.dataset.locationId = location._id;
            
            assignDriveButton.addEventListener('click', async function() {
                try {
                    // First fetch a list of available drives
                    let drives = [];
                    
                    if (USE_BACKEND) {
                        const response = await fetch(`${API_BASE_URL}/api/drives`);
                        if (response.ok) {
                            drives = await response.json();
                        } else {
                            throw new Error('Failed to fetch drives');
                        }
                    } else {
                        // Mock drives
                        drives = [
                            { id: 'drive-001', label: 'RED Footage Archive' },
                            { id: 'drive-002', label: 'Client Delivery Shuttle' },
                            { id: 'drive-003', label: 'Raw Interview Masters' }
                        ];
                    }
                    
                    // Create a select dropdown for available drives
                    const selectDrive = document.createElement('select');
                    selectDrive.innerHTML = '<option value="">Select a drive...</option>';
                    
                    drives.forEach(drive => {
                        const option = document.createElement('option');
                        option.value = drive.id || drive.driveId;
                        option.textContent = drive.label || drive.volumeName || drive.id || drive.driveId;
                        selectDrive.appendChild(option);
                    });
                    
                    // Create a dialog for drive selection
                    const dialog = document.createElement('div');
                    dialog.className = 'modal';
                    dialog.style.display = 'block';
                    
                    const dialogContent = document.createElement('div');
                    dialogContent.className = 'modal-content';
                    dialogContent.style.width = '400px';
                    
                    const closeBtn = document.createElement('span');
                    closeBtn.className = 'close-modal';
                    closeBtn.textContent = '×';
                    closeBtn.onclick = function() {
                        document.body.removeChild(dialog);
                    };
                    
                    const heading = document.createElement('h3');
                    heading.textContent = `Assign Drive to ${location.locationId}`;
                    
                    const form = document.createElement('div');
                    form.appendChild(selectDrive);
                    
                    const confirmBtn = document.createElement('button');
                    confirmBtn.className = 'button';
                    confirmBtn.textContent = 'Assign';
                    confirmBtn.style.marginTop = '15px';
                    confirmBtn.onclick = function() {
                        const driveId = selectDrive.value;
                        if (!driveId) {
                            alert('Please select a drive');
                            return;
                        }
                        
                        // Close dialog
                        document.body.removeChild(dialog);
                        
                        // Assign drive to location
                        assignDriveToLocation(location._id, driveId, occupiedByCell, statusSelect);
                    };
                    
                    form.appendChild(document.createElement('br'));
                    form.appendChild(confirmBtn);
                    
                    dialogContent.appendChild(closeBtn);
                    dialogContent.appendChild(heading);
                    dialogContent.appendChild(form);
                    
                    dialog.appendChild(dialogContent);
                    document.body.appendChild(dialog);
                    
                } catch (error) {
                    console.error('Error fetching drives for assignment:', error);
                    alert('Failed to fetch drives: ' + error.message);
                }
            });
            
            const exportLabelButton = document.createElement('button');
            exportLabelButton.className = 'button small';
            exportLabelButton.textContent = 'Export Label';
            
            exportLabelButton.addEventListener('click', function() {
                if (USE_BACKEND) {
                    window.open(`${API_BASE_URL}/api/locations/${location._id}/export-label`, '_blank');
                    console.log(`Export URL: ${API_BASE_URL}/api/locations/${location._id}/export-label`);
                } else {
                    alert(`Export Label for Location: ${location.locationId}`);
                }
            });
            
            const deleteButton = document.createElement('button');
            deleteButton.className = 'button small danger';
            deleteButton.textContent = 'Delete';
            
            deleteButton.addEventListener('click', function() {
                if (confirm(`Are you sure you want to delete location ${location.locationId}?`)) {
                    deleteLocation(location._id, row);
                }
            });
            
            actionsCell.appendChild(assignDriveButton);
            actionsCell.appendChild(document.createTextNode(' '));
            actionsCell.appendChild(exportLabelButton);
            actionsCell.appendChild(document.createTextNode(' '));
            actionsCell.appendChild(deleteButton);
            
            // Add all cells to the row
            row.appendChild(idCell);
            row.appendChild(statusCell);
            row.appendChild(occupiedByCell);
            row.appendChild(sectionCell);
            row.appendChild(notesCell);
            row.appendChild(actionsCell);
            
            // Add row to the table
            locationsList.appendChild(row);
        });
    }
    
    // Add a note to a location
    async function addNoteToLocation(locationId, note, notesCell) {
        try {
            if (USE_BACKEND) {
                const response = await fetch(`${API_BASE_URL}/api/locations/${locationId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ notes: note }),
                });
                
                if (!response.ok) {
                    throw new Error('Failed to update location notes');
                }
                
                // Update the cell with the new note
                notesCell.textContent = note;
            } else {
                // Mock update
                notesCell.textContent = note;
            }
        } catch (error) {
            console.error('Error adding note to location:', error);
            alert('Failed to add note: ' + error.message);
        }
    }
    
    // Assign a drive to a location
    async function assignDriveToLocation(locationId, driveId, occupiedByCell, statusSelect) {
        try {
            if (USE_BACKEND) {
                const response = await fetch(`${API_BASE_URL}/api/locations/${locationId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        occupiedBy: driveId,
                        status: 'OCCUPIED'
                    }),
                });
                
                if (!response.ok) {
                    throw new Error('Failed to assign drive to location');
                }
                
                // Fetch drive details to update the cell
                const driveResponse = await fetch(`${API_BASE_URL}/api/drives/${driveId}`);
                if (driveResponse.ok) {
                    const drive = await driveResponse.json();
                    occupiedByCell.textContent = drive.label || drive.volumeName || drive.driveId || driveId;
                } else {
                    occupiedByCell.textContent = driveId;
                }
                
                // Update status select
                statusSelect.value = 'OCCUPIED';
                
                // Update the row class
                const row = occupiedByCell.parentElement;
                row.className = 'occupied-location';
                
                // Update location summary
                loadLocationsSummary();
            } else {
                // Mock assignment
                occupiedByCell.textContent = `Drive ${driveId}`;
                statusSelect.value = 'OCCUPIED';
                
                // Update the row class
                const row = occupiedByCell.parentElement;
                row.className = 'occupied-location';
            }
        } catch (error) {
            console.error('Error assigning drive to location:', error);
            alert('Failed to assign drive: ' + error.message);
        }
    }
    
    // Delete a location
    async function deleteLocation(locationId, row) {
        try {
            if (USE_BACKEND) {
                const response = await fetch(`${API_BASE_URL}/api/locations/${locationId}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    throw new Error('Failed to delete location');
                }
                
                // Remove the row from the table
                row.parentElement.removeChild(row);
                
                // Update summary data
                loadLocationsSummary();
                
                // Update bay dropdown (in case we deleted the only location in a bay/shelf)
                loadLocationBays();
                
                // Update visualization
                const bayFilter = document.getElementById('location-bay-filter').value;
                if (bayFilter) {
                    renderBayVisualization(parseInt(bayFilter));
                }
            } else {
                // Mock deletion
                row.parentElement.removeChild(row);
            }
        } catch (error) {
            console.error('Error deleting location:', error);
            alert('Failed to delete location: ' + error.message);
        }
    }
    
    // Load locations summary
    async function loadLocationsSummary() {
        const summaryContainer = document.getElementById('locations-summary');
        if (!summaryContainer) return;
        
        try {
            if (USE_BACKEND) {
                console.log('Fetching locations summary from API...');
                const response = await fetch(`${API_BASE_URL}/api/locations/summary`);
                
                if (!response.ok) {
                    throw new Error('Failed to fetch locations summary');
                }
                
                const summary = await response.json();
                console.log('Received locations summary:', summary);
                
                displayLocationsSummary(summary);
            } else {
                console.log('Generating mock locations summary...');
                loadMockLocationsSummary();
            }
        } catch (error) {
            console.error('Error loading locations summary:', error);
            summaryContainer.innerHTML = '<p>Error loading locations summary</p>';
        }
    }
    
    // Display locations summary
    function displayLocationsSummary(summary) {
        const summaryContainer = document.getElementById('locations-summary');
        if (!summaryContainer) return;
        
        // Clear existing content
        summaryContainer.innerHTML = '';
        
        // Check if summary is empty
        if (Object.keys(summary).length === 0) {
            summaryContainer.innerHTML = '<p>No locations have been created yet</p>';
            return;
        }
        
        // Create summary table
        const table = document.createElement('table');
        table.className = 'summary-table';
        
        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        const bayHeader = document.createElement('th');
        bayHeader.textContent = 'Bay';
        
        const totalHeader = document.createElement('th');
        totalHeader.textContent = 'Total Locations';
        
        const occupiedHeader = document.createElement('th');
        occupiedHeader.textContent = 'Occupied';
        
        const emptyHeader = document.createElement('th');
        emptyHeader.textContent = 'Empty';
        
        const detailsHeader = document.createElement('th');
        detailsHeader.textContent = 'Details';
        
        const actionsHeader = document.createElement('th');
        actionsHeader.textContent = 'Actions';
        
        headerRow.appendChild(bayHeader);
        headerRow.appendChild(totalHeader);
        headerRow.appendChild(occupiedHeader);
        headerRow.appendChild(emptyHeader);
        headerRow.appendChild(detailsHeader);
        headerRow.appendChild(actionsHeader);
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Add rows for each bay
        Object.keys(summary).sort().forEach(bayKey => {
            const bayData = summary[bayKey];
            
            // Create bay row
            const bayRow = document.createElement('tr');
            bayRow.classList.add('bay-row');
            
            const bayCell = document.createElement('td');
            bayCell.textContent = bayKey;
            
            const totalCell = document.createElement('td');
            totalCell.textContent = bayData.totalLocations;
            
            const occupiedCell = document.createElement('td');
            occupiedCell.textContent = bayData.occupied;
            
            const emptyCell = document.createElement('td');
            emptyCell.textContent = bayData.empty;
            
            const detailsCell = document.createElement('td');
            const toggleButton = document.createElement('button');
            toggleButton.className = 'button small toggle-details';
            toggleButton.textContent = 'Show Shelves';
            toggleButton.dataset.expanded = 'false';
            toggleButton.dataset.bay = bayKey;
            
            toggleButton.addEventListener('click', function() {
                const isExpanded = this.dataset.expanded === 'true';
                this.dataset.expanded = isExpanded ? 'false' : 'true';
                this.textContent = isExpanded ? 'Show Shelves' : 'Hide Shelves';
                
                // Toggle visibility of shelf rows for this bay
                document.querySelectorAll(`.shelf-row[data-bay="${bayKey}"]`).forEach(row => {
                    row.style.display = isExpanded ? 'none' : 'table-row';
                });
            });
            
            detailsCell.appendChild(toggleButton);
            
            const actionsCell = document.createElement('td');
            const viewButton = document.createElement('button');
            viewButton.className = 'button small';
            viewButton.textContent = 'View';
            
            viewButton.addEventListener('click', function() {
                // Extract bay number from bay key (format: "Bay X")
                const bayNumber = bayKey.split(' ')[1];
                
                // Set bay filter and trigger change event
                const bayFilter = document.getElementById('location-bay-filter');
                if (bayFilter) {
                    bayFilter.value = bayNumber;
                    
                    // Manually trigger change event
                    const event = new Event('change');
                    bayFilter.dispatchEvent(event);
                    
                    // Load locations for this bay
                    loadFilteredLocations();
                    
                    // Scroll to locations section
                    document.querySelector('.card h3:contains("Storage Location Browser")').scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            });
            
            const exportButton = document.createElement('button');
            exportButton.className = 'button small';
            exportButton.textContent = 'Export Labels';
            
            exportButton.addEventListener('click', function() {
                if (USE_BACKEND) {
                    // Extract bay number from bay key (format: "Bay X")
                    const bayNumber = bayKey.split(' ')[1];
                    window.open(`${API_BASE_URL}/api/locations/export-batch?bay=${bayNumber}`, '_blank');
                } else {
                    alert(`Export Labels for ${bayKey}`);
                }
            });
            
            actionsCell.appendChild(viewButton);
            actionsCell.appendChild(document.createTextNode(' '));
            actionsCell.appendChild(exportButton);
            
            bayRow.appendChild(bayCell);
            bayRow.appendChild(totalCell);
            bayRow.appendChild(occupiedCell);
            bayRow.appendChild(emptyCell);
            bayRow.appendChild(detailsCell);
            bayRow.appendChild(actionsCell);
            
            tbody.appendChild(bayRow);
            
            // Add shelf rows for this bay (initially hidden)
            Object.keys(bayData.shelves).sort().forEach(shelfKey => {
                const shelfData = bayData.shelves[shelfKey];
                
                const shelfRow = document.createElement('tr');
                shelfRow.classList.add('shelf-row');
                shelfRow.dataset.bay = bayKey;
                shelfRow.style.display = 'none'; // Initially hidden
                
                const shelfCell = document.createElement('td');
                shelfCell.textContent = `  ${shelfKey}`;
                shelfCell.style.paddingLeft = '20px';
                
                const shelfTotalCell = document.createElement('td');
                shelfTotalCell.textContent = shelfData.totalLocations;
                
                const shelfOccupiedCell = document.createElement('td');
                shelfOccupiedCell.textContent = shelfData.occupied;
                
                const shelfEmptyCell = document.createElement('td');
                shelfEmptyCell.textContent = shelfData.empty;
                
                const shelfDetailsCell = document.createElement('td');
                // No details button for shelves
                
                const shelfActionsCell = document.createElement('td');
                const viewShelfButton = document.createElement('button');
                viewShelfButton.className = 'button small';
                viewShelfButton.textContent = 'View';
                
                viewShelfButton.addEventListener('click', function() {
                    // Extract bay and shelf numbers
                    const bayNumber = bayKey.split(' ')[1];
                    const shelfNumber = shelfKey.split(' ')[1];
                    
                    // Set bay and shelf filters
                    const bayFilter = document.getElementById('location-bay-filter');
                    const shelfFilter = document.getElementById('location-shelf-filter');
                    
                    if (bayFilter && shelfFilter) {
                        bayFilter.value = bayNumber;
                        
                        // Trigger bay filter change to load shelves
                        const bayEvent = new Event('change');
                        bayFilter.dispatchEvent(bayEvent);
                        
                        // Now set shelf filter
                        setTimeout(() => {
                            shelfFilter.value = shelfNumber;
                            
                            // Load locations for this bay/shelf
                            loadFilteredLocations();
                            
                            // Scroll to locations section
                            document.querySelector('.card h3:contains("Storage Location Browser")').scrollIntoView({
                                behavior: 'smooth'
                            });
                        }, 100);
                    }
                });
                
                const exportShelfButton = document.createElement('button');
                exportShelfButton.className = 'button small';
                exportShelfButton.textContent = 'Export Labels';
                
                exportShelfButton.addEventListener('click', function() {
                    if (USE_BACKEND) {
                        // Extract bay and shelf numbers
                        const bayNumber = bayKey.split(' ')[1];
                        const shelfNumber = shelfKey.split(' ')[1];
                        window.open(`${API_BASE_URL}/api/locations/export-batch?bay=${bayNumber}&shelf=${shelfNumber}`, '_blank');
                    } else {
                        alert(`Export Labels for ${bayKey}, ${shelfKey}`);
                    }
                });
                
                shelfActionsCell.appendChild(viewShelfButton);
                shelfActionsCell.appendChild(document.createTextNode(' '));
                shelfActionsCell.appendChild(exportShelfButton);
                
                shelfRow.appendChild(shelfCell);
                shelfRow.appendChild(shelfTotalCell);
                shelfRow.appendChild(shelfOccupiedCell);
                shelfRow.appendChild(shelfEmptyCell);
                shelfRow.appendChild(shelfDetailsCell);
                shelfRow.appendChild(shelfActionsCell);
                
                tbody.appendChild(shelfRow);
            });
        });
        
        table.appendChild(tbody);
        summaryContainer.appendChild(table);
    }
    
    // Load mock locations summary
    function loadMockLocationsSummary() {
        const mockSummary = {
            'Bay 1': {
                totalLocations: 30,
                occupied: 24,
                empty: 6,
                shelves: {
                    'Shelf 1': { totalLocations: 10, occupied: 9, empty: 1 },
                    'Shelf 2': { totalLocations: 10, occupied: 8, empty: 2 },
                    'Shelf 3': { totalLocations: 10, occupied: 7, empty: 3 }
                }
            },
            'Bay 2': {
                totalLocations: 30,
                occupied: 15,
                empty: 15,
                shelves: {
                    'Shelf 1': { totalLocations: 10, occupied: 5, empty: 5 },
                    'Shelf 2': { totalLocations: 10, occupied: 5, empty: 5 },
                    'Shelf 3': { totalLocations: 10, occupied: 5, empty: 5 }
                }
            },
            'Bay 3': {
                totalLocations: 30,
                occupied: 6,
                empty: 24,
                shelves: {
                    'Shelf 1': { totalLocations: 10, occupied: 3, empty: 7 },
                    'Shelf 2': { totalLocations: 10, occupied: 2, empty: 8 },
                    'Shelf 3': { totalLocations: 10, occupied: 1, empty: 9 }
                }
            }
        };
        
        displayLocationsSummary(mockSummary);
    }
    
    // Load location bays for dropdown
    async function loadLocationBays() {
        const bayFilter = document.getElementById('location-bay-filter');
        if (!bayFilter) return;
        
        try {
            if (USE_BACKEND) {
                console.log('Fetching locations from API for bays...');
                const response = await fetch(`${API_BASE_URL}/api/locations`);
                
                if (!response.ok) {
                    throw new Error('Failed to fetch locations');
                }
                
                const locations = await response.json();
                
                // Extract unique bay numbers
                const bays = [...new Set(locations.map(loc => loc.bay))].sort((a, b) => a - b);
                
                populateBayFilter(bays);
            } else {
                console.log('Using mock location data for bays...');
                populateMockLocationBays();
            }
        } catch (error) {
            console.error('Error loading location bays:', error);
            populateMockLocationBays(); // Fallback to mock data
        }
    }
    
    // Populate bay filter dropdown
    function populateBayFilter(bays) {
        const bayFilter = document.getElementById('location-bay-filter');
        if (!bayFilter) return;
        
        // Keep the first "All Bays" option
        bayFilter.innerHTML = '<option value="">All Bays</option>';
        
        // Add each bay as an option
        bays.forEach(bay => {
            const option = document.createElement('option');
            option.value = bay;
            option.textContent = `Bay ${bay}`;
            bayFilter.appendChild(option);
        });
    }
    
    // Populate mock location bays
    function populateMockLocationBays() {
        const mockBays = [1, 2, 3];
        populateBayFilter(mockBays);
    }
    
    // Load shelves for a specific bay
    async function loadLocationShelves(bay) {
        const shelfFilter = document.getElementById('location-shelf-filter');
        if (!shelfFilter) return;
        
        try {
            if (USE_BACKEND) {
                console.log(`Fetching shelves for Bay ${bay} from API...`);
                const response = await fetch(`${API_BASE_URL}/api/locations?bay=${bay}`);
                
                if (!response.ok) {
                    throw new Error('Failed to fetch locations');
                }
                
                const locations = await response.json();
                
                // Extract unique shelf numbers
                const shelves = [...new Set(locations.map(loc => loc.shelf))].sort((a, b) => a - b);
                
                populateShelfFilter(shelves);
            } else {
                console.log(`Using mock shelves for Bay ${bay}...`);
                populateMockLocationShelves(bay);
            }
        } catch (error) {
            console.error('Error loading location shelves:', error);
            populateMockLocationShelves(bay); // Fallback to mock data
        }
    }
    
    // Populate shelf filter dropdown
    function populateShelfFilter(shelves) {
        const shelfFilter = document.getElementById('location-shelf-filter');
        if (!shelfFilter) return;
        
        // Keep the first "All Shelves" option
        shelfFilter.innerHTML = '<option value="">All Shelves</option>';
        
        // Add each shelf as an option
        shelves.forEach(shelf => {
            const option = document.createElement('option');
            option.value = shelf;
            option.textContent = `Shelf ${shelf}`;
            shelfFilter.appendChild(option);
        });
    }
    
    // Populate mock location shelves
    function populateMockLocationShelves(bay) {
        const mockShelves = [1, 2, 3];
        populateShelfFilter(mockShelves);
    }
    
    // Generate mock locations
    function generateMockLocations(bay, shelf, status) {
        const mockLocations = [];
        
        // Define bay and shelf ranges based on filters
        const bayNumbers = bay ? [parseInt(bay)] : [1, 2, 3];
        
        for (const bayNum of bayNumbers) {
            const shelfNumbers = shelf ? [parseInt(shelf)] : [1, 2, 3];
            
            for (const shelfNum of shelfNumbers) {
                // Generate 10 positions per shelf
                for (let position = 1; position <= 10; position++) {
                    // Generate a random status if not filtered
                    const statuses = ['EMPTY', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];
                    const randomStatus = status || statuses[Math.floor(Math.random() * statuses.length)];
                    
                    // Skip if status filter doesn't match
                    if (status && status !== randomStatus) {
                        continue;
                    }
                    
                    // Create mock location
                    const mockLocation = {
                        _id: `mock-location-${bayNum}-${shelfNum}-${position}`,
                        bay: bayNum,
                        shelf: shelfNum,
                        position,
                        status: randomStatus,
                        locationId: `B${bayNum}-S${shelfNum}-P${position}`,
                        section: Math.random() > 0.7 ? `Section ${String.fromCharCode(65 + Math.floor(Math.random() * 5))}` : '',
                        notes: Math.random() > 0.8 ? `Mock note for position ${position}` : '',
                        occupiedBy: randomStatus === 'OCCUPIED' ? `drive-${Math.floor(Math.random() * 999) + 1}` : null,
                        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
                    };
                    
                    mockLocations.push(mockLocation);
                }
            }
        }
        
        return mockLocations;
    }
    
    // Render visual bay/shelf layout
    async function renderBayVisualization(bayNumber) {
        const visualContainer = document.getElementById('bay-shelf-visualization');
        if (!visualContainer) return;
        
        try {
            if (USE_BACKEND) {
                console.log(`Rendering visualization for Bay ${bayNumber}...`);
                
                // Fetch all locations for this bay
                const response = await fetch(`${API_BASE_URL}/api/locations?bay=${bayNumber}`);
                
                if (!response.ok) {
                    throw new Error('Failed to fetch locations');
                }
                
                const locations = await response.json();
                
                // Create the visualization
                createBayVisualization(visualContainer, bayNumber, locations);
            } else {
                console.log(`Rendering mock visualization for Bay ${bayNumber}...`);
                renderMockBayVisualization(bayNumber);
            }
        } catch (error) {
            console.error('Error rendering bay visualization:', error);
            visualContainer.innerHTML = '<p>Error rendering visualization</p>';
        }
    }
    
    // Create bay visualization
    function createBayVisualization(container, bayNumber, locations) {
        // Clear container
        container.innerHTML = '';
        
        // Group locations by shelf
        const shelvesByNumber = {};
        
        locations.forEach(location => {
            if (!shelvesByNumber[location.shelf]) {
                shelvesByNumber[location.shelf] = [];
            }
            shelvesByNumber[location.shelf].push(location);
        });
        
        // Title for the visualization
        const title = document.createElement('h3');
        title.textContent = `Bay ${bayNumber} Layout`;
        container.appendChild(title);
        
        // Check if any locations exist
        if (Object.keys(shelvesByNumber).length === 0) {
            const message = document.createElement('p');
            message.textContent = `No locations found in Bay ${bayNumber}`;
            container.appendChild(message);
            return;
        }
        
        // Create bay container
        const bayContainer = document.createElement('div');
        bayContainer.className = 'bay-visualization';
        
        // For each shelf, create a shelf row
        Object.keys(shelvesByNumber).sort((a, b) => a - b).forEach(shelfNumber => {
            const shelfLocations = shelvesByNumber[shelfNumber];
            
            // Create shelf container
            const shelfContainer = document.createElement('div');
            shelfContainer.className = 'shelf-visualization';
            
            // Shelf label
            const shelfLabel = document.createElement('div');
            shelfLabel.className = 'shelf-label';
            shelfLabel.textContent = `Shelf ${shelfNumber}`;
            shelfContainer.appendChild(shelfLabel);
            
            // Create position blocks
            shelfLocations.sort((a, b) => a.position - b.position).forEach(location => {
                const positionBlock = document.createElement('div');
                positionBlock.className = 'position-block';
                positionBlock.dataset.status = location.status.toLowerCase();
                positionBlock.title = `${location.locationId}${location.occupiedBy ? `\nOccupied by: ${location.occupiedBy}` : ''}`;
                
                // Position number
                const positionLabel = document.createElement('div');
                positionLabel.className = 'position-label';
                positionLabel.textContent = location.position;
                positionBlock.appendChild(positionLabel);
                
                // Click handler to view/edit location
                positionBlock.addEventListener('click', function() {
                    // Create a dialog for location details
                    showLocationDetails(location);
                });
                
                shelfContainer.appendChild(positionBlock);
            });
            
            bayContainer.appendChild(shelfContainer);
        });
        
        container.appendChild(bayContainer);
        
        // Add legend
        const legend = document.createElement('div');
        legend.className = 'visualization-legend';
        
        const legendItems = [
            { status: 'empty', label: 'Empty' },
            { status: 'occupied', label: 'Occupied' },
            { status: 'reserved', label: 'Reserved' },
            { status: 'maintenance', label: 'Maintenance' }
        ];
        
        legendItems.forEach(item => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            
            const colorBox = document.createElement('div');
            colorBox.className = 'legend-color';
            colorBox.dataset.status = item.status;
            
            const label = document.createElement('span');
            label.textContent = item.label;
            
            legendItem.appendChild(colorBox);
            legendItem.appendChild(label);
            legend.appendChild(legendItem);
        });
        
        container.appendChild(legend);
    }
    
    // Show location details popup
    function showLocationDetails(location) {
        // Create a dialog for location details
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.style.display = 'block';
        
        const dialogContent = document.createElement('div');
        dialogContent.className = 'modal-content';
        
        const closeBtn = document.createElement('span');
        closeBtn.className = 'close-modal';
        closeBtn.textContent = '×';
        closeBtn.onclick = function() {
            document.body.removeChild(dialog);
        };
        
        const heading = document.createElement('h3');
        heading.textContent = `Location Details: ${location.locationId}`;
        
        const details = document.createElement('div');
        details.className = 'location-details';
        
        // Status with color coding
        const statusDiv = document.createElement('div');
        statusDiv.className = 'detail-row';
        statusDiv.innerHTML = `<strong>Status:</strong> <span class="status-badge" data-status="${location.status.toLowerCase()}">${location.status}</span>`;
        
        // Occupied by
        const occupiedDiv = document.createElement('div');
        occupiedDiv.className = 'detail-row';
        occupiedDiv.innerHTML = `<strong>Occupied By:</strong> ${location.occupiedBy ? location.occupiedBy : 'None'}`;
        
        // Section
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'detail-row';
        sectionDiv.innerHTML = `<strong>Section:</strong> ${location.section || 'None'}`;
        
        // Notes
        const notesDiv = document.createElement('div');
        notesDiv.className = 'detail-row';
        notesDiv.innerHTML = `<strong>Notes:</strong> ${location.notes || 'None'}`;
        
        // Created date
        const createdDiv = document.createElement('div');
        createdDiv.className = 'detail-row';
        createdDiv.innerHTML = `<strong>Created:</strong> ${formatDate(location.createdAt || new Date().toISOString())}`;
        
        // Add all details
        details.appendChild(statusDiv);
        details.appendChild(occupiedDiv);
        details.appendChild(sectionDiv);
        details.appendChild(notesDiv);
        details.appendChild(createdDiv);
        
        // Actions
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'location-actions';
        
        const exportButton = document.createElement('button');
        exportButton.className = 'button';
        exportButton.textContent = 'Export Label';
        exportButton.onclick = function() {
            if (USE_BACKEND) {
                window.open(`${API_BASE_URL}/api/locations/${location._id}/export-label`, '_blank');
                document.body.removeChild(dialog);
            } else {
                alert(`Export Label for Location: ${location.locationId}`);
                document.body.removeChild(dialog);
            }
        };
        
        actionsDiv.appendChild(exportButton);
        
        // Assemble dialog
        dialogContent.appendChild(closeBtn);
        dialogContent.appendChild(heading);
        dialogContent.appendChild(details);
        dialogContent.appendChild(actionsDiv);
        
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
    }
    
    // Render mock bay visualization
    function renderMockBayVisualization(bayNumber, shelfNumber = null) {
        const visualContainer = document.getElementById('bay-shelf-visualization');
        if (!visualContainer) return;
        
        // Generate mock locations for this bay
        const mockBayLocations = [];
        
        const shelfNumbers = shelfNumber ? [shelfNumber] : [1, 2, 3];
        
        for (const shelf of shelfNumbers) {
            for (let position = 1; position <= 10; position++) {
                // Determine a mock status - weighted to have more occupied than empty
                let status;
                const rand = Math.random();
                if (rand < 0.6) {
                    status = 'OCCUPIED';
                } else if (rand < 0.8) {
                    status = 'EMPTY';
                } else if (rand < 0.9) {
                    status = 'RESERVED';
                } else {
                    status = 'MAINTENANCE';
                }
                
                mockBayLocations.push({
                    _id: `mock-location-${bayNumber}-${shelf}-${position}`,
                    bay: bayNumber,
                    shelf,
                    position,
                    status,
                    locationId: `B${bayNumber}-S${shelf}-P${position}`,
                    section: Math.random() > 0.7 ? `Section ${String.fromCharCode(65 + Math.floor(Math.random() * 5))}` : '',
                    notes: Math.random() > 0.8 ? `Mock note for position ${position}` : '',
                    occupiedBy: status === 'OCCUPIED' ? `drive-${Math.floor(Math.random() * 999) + 1}` : null,
                    createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
                });
            }
        }
        
        // Create the visualization
        createBayVisualization(visualContainer, bayNumber, mockBayLocations);
    }
    
    // Initialize the app
    init();
});