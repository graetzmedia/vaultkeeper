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
        
        // Initialize other pages with mock data
        populateMockDrivesList();
        populateMockProjectsList();
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
            createProjectButton.addEventListener('click', () => {
                const projectName = document.getElementById('new-project-name').value.trim();
                const clientName = document.getElementById('new-project-client').value.trim();
                
                if (!projectName) {
                    alert('Please enter a project name');
                    return;
                }
                
                alert(`Project "${projectName}" created${clientName ? ` for client "${clientName}"` : ''}`);
                
                // Clear inputs
                document.getElementById('new-project-name').value = '';
                document.getElementById('new-project-client').value = '';
                
                // Refresh projects list
                populateMockProjectsList();
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
    
    // Populate mock drives list
    function populateMockDrivesList() {
        const drivesList = document.getElementById('drives-list');
        if (!drivesList) return;
        
        // Clear existing content
        drivesList.innerHTML = '';
        
        // Mock drives data
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
        
        // Add rows for each drive
        mockDrives.forEach(drive => {
            const row = document.createElement('tr');
            
            const labelCell = document.createElement('td');
            labelCell.textContent = drive.label;
            
            const volumeNameCell = document.createElement('td');
            volumeNameCell.textContent = drive.volumeName;
            
            const sizeCell = document.createElement('td');
            sizeCell.textContent = formatFileSize(drive.sizeBytes);
            
            const freeSpaceCell = document.createElement('td');
            freeSpaceCell.textContent = formatFileSize(drive.freeBytes);
            
            const dateCell = document.createElement('td');
            dateCell.textContent = formatDate(drive.dateCataloged);
            
            const actionsCell = document.createElement('td');
            const detailsButton = document.createElement('button');
            detailsButton.className = 'button secondary';
            detailsButton.textContent = 'Details';
            detailsButton.addEventListener('click', () => {
                alert(`Drive Details: ${drive.label}`);
            });
            
            const qrButton = document.createElement('button');
            qrButton.className = 'button';
            qrButton.textContent = 'QR Code';
            qrButton.addEventListener('click', () => {
                alert(`QR Code for Drive: ${drive.label}`);
            });
            
            actionsCell.appendChild(detailsButton);
            actionsCell.appendChild(document.createTextNode(' '));
            actionsCell.appendChild(qrButton);
            
            row.appendChild(labelCell);
            row.appendChild(volumeNameCell);
            row.appendChild(sizeCell);
            row.appendChild(freeSpaceCell);
            row.appendChild(dateCell);
            row.appendChild(actionsCell);
            
            drivesList.appendChild(row);
        });
    }
    
    // Populate mock projects list
    function populateMockProjectsList() {
        const projectsList = document.getElementById('projects-list');
        if (!projectsList) return;
        
        // Clear existing content
        projectsList.innerHTML = '';
        
        // Mock projects data
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
        
        // Add rows for each project
        mockProjects.forEach(project => {
            const row = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.textContent = project.name;
            
            const clientCell = document.createElement('td');
            clientCell.textContent = project.client;
            
            const dateCell = document.createElement('td');
            dateCell.textContent = formatDate(project.dateCreated);
            
            const filesCell = document.createElement('td');
            filesCell.textContent = project.fileCount.toLocaleString();
            
            const actionsCell = document.createElement('td');
            const detailsButton = document.createElement('button');
            detailsButton.className = 'button secondary';
            detailsButton.textContent = 'Details';
            detailsButton.addEventListener('click', () => {
                alert(`Project Details: ${project.name}`);
            });
            
            const exportButton = document.createElement('button');
            exportButton.className = 'button';
            exportButton.textContent = 'Export';
            exportButton.addEventListener('click', () => {
                alert(`Export Project: ${project.name}`);
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
        
        // Set preview image if available
        if (asset.thumbnailPath) {
            previewImage.src = generatePlaceholderImageUrl(asset);
            previewImage.alt = asset.filename;
            previewImage.style.display = 'block';
        } else {
            previewImage.style.display = 'none';
        }
        
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
            // The Flask API will serve thumbnails from their actual location
            return `${API_BASE_URL}/thumbnails/${asset.thumbnailPath.split('/').pop()}`;
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
    
    // Initialize the app
    init();
});