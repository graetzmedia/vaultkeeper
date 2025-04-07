#!/bin/bash
# VaultKeeper CLI Menu Interface

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Activate virtual environment if it exists
if [ -d "$SCRIPT_DIR/.venv" ]; then
  echo "Activating virtual environment..."
  source "$SCRIPT_DIR/.venv/bin/activate"
  
  # Check for required packages
  if ! python -c "import whisper" &> /dev/null; then
    echo "Whisper not found, installing dependencies..."
    pip install openai-whisper
  fi
else
  echo "Warning: Virtual environment not found at $SCRIPT_DIR/.venv"
  echo "Transcription features may not work correctly."
  echo "Consider creating a virtual environment with: python -m venv .venv"
  echo "Then install dependencies with: pip install openai-whisper qrcode pillow"
  echo "Press Enter to continue anyway..."
  read
fi

# Colors for better readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to display the menu
show_menu() {
  clear
  echo -e "${GREEN}==========================================${NC}"
  echo -e "${GREEN}     VaultKeeper Media Asset Tracker     ${NC}"
  echo -e "${GREEN}==========================================${NC}"
  echo
  echo -e "${BLUE}Choose an action:${NC}"
  echo
  echo "  1) Initialize Database"
  echo "  2) Catalog a Drive"
  echo "  3) Batch Catalog All Mounted Drives"
  echo "  4) List All Drives"
  echo "  5) Search Files"
  echo "  6) Create New Project"
  echo "  7) Add Files to Project"
  echo "  8) Generate QR Code for Drive"
  echo "  9) Run Shelf Drive Health Check"
  echo "  10) Full Process: Catalog + Health Check All Drives"
  echo "  11) Clean Up Duplicate Drive Entries"
  echo "  12) Process Transcriptions"
  echo "  13) Search Transcriptions"
  echo "  14) View Transcription for File"
  echo "  15) Exit"
  echo
  echo -e "${YELLOW}Enter your choice [1-15]:${NC} "
}

# Function to initialize the database
initialize_db() {
  echo "Initializing database..."
  
  echo -e "${BLUE}Do you want to force reinitialization to fix any column issues? (y/n)${NC}"
  read -e force_init
  
  if [[ "$force_init" =~ ^[Yy] ]]; then
    echo "Running forced initialization to fix database issues..."
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" init --force
  else
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" init
  fi
  
  echo "Press Enter to continue..."
  read
}

# Function to catalog a drive
catalog_drive() {
  echo -e "${BLUE}Enter the mount point of the drive to catalog:${NC}"
  read -e mount_point
  
  if [ -z "$mount_point" ]; then
    echo "Mount point cannot be empty."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  echo -e "${BLUE}Enter a label for the drive (optional):${NC}"
  read -e label
  
  echo -e "${BLUE}Transcribe audio/video files while cataloging? (y/n):${NC}"
  read -e do_transcribe
  
  # Build command based on options
  if [ -z "$label" ]; then
    cmd="python \"$SCRIPT_DIR/scripts/utils/asset-tracker.py\" catalog \"$mount_point\""
  else
    cmd="python \"$SCRIPT_DIR/scripts/utils/asset-tracker.py\" catalog \"$mount_point\" -l \"$label\""
  fi
  
  # Add transcription flag if requested
  if [[ "$do_transcribe" =~ ^[Yy] ]]; then
    cmd="$cmd -t"
    echo -e "${YELLOW}Note: This will mark audio/video files for transcription.${NC}"
    echo -e "${YELLOW}Includes non-music/SFX audio files that may be external recordings.${NC}"
    echo "Cataloging drive at $mount_point with transcription enabled..."
  else
    echo "Cataloging drive at $mount_point..."
  fi
  
  # Execute the command
  eval $cmd
  
  echo "Press Enter to continue..."
  read
}

# Function to list all drives
list_drives() {
  echo "Listing all drives..."
  python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" drives
  echo "Press Enter to continue..."
  read
}

# Function to search files
search_files() {
  echo -e "${BLUE}Enter search query:${NC}"
  read -e query
  
  if [ -z "$query" ]; then
    echo "Search query cannot be empty."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  echo -e "${BLUE}Select search type:${NC}"
  echo "1) Any (default)"
  echo "2) Filename"
  echo "3) Extension"
  echo "4) Project"
  read -e search_type_num
  
  case $search_type_num in
    1) search_type="any" ;;
    2) search_type="filename" ;;
    3) search_type="extension" ;;
    4) search_type="project" ;;
    *) search_type="any" ;;
  esac
  
  echo "Searching for '$query' with type '$search_type'..."
  python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" search "$query" -t "$search_type"
  echo "Press Enter to continue..."
  read
}

# Function to search through transcriptions
search_transcriptions() {
  echo -e "${BLUE}Enter text to search for in transcriptions:${NC}"
  read -e query
  
  if [ -z "$query" ]; then
    echo "Search query cannot be empty."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  echo "Searching transcriptions for '$query'..."
  python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" search "$query" -t "transcription"
  
  echo "Press Enter to continue..."
  read
}

# Function to create a new project
create_project() {
  echo -e "${BLUE}Enter project name:${NC}"
  read -e name
  
  if [ -z "$name" ]; then
    echo "Project name cannot be empty."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  echo -e "${BLUE}Enter client name (optional):${NC}"
  read -e client
  
  echo -e "${BLUE}Enter project notes (optional):${NC}"
  read -e notes
  
  cmd="python \"$SCRIPT_DIR/scripts/utils/asset-tracker.py\" project \"$name\""
  
  if [ ! -z "$client" ]; then
    cmd="$cmd -c \"$client\""
  fi
  
  if [ ! -z "$notes" ]; then
    cmd="$cmd -n \"$notes\""
  fi
  
  echo "Creating project..."
  eval $cmd
  echo "Press Enter to continue..."
  read
}

# Function to add files to a project
add_files_to_project() {
  echo -e "${BLUE}Enter project ID:${NC}"
  read -e project_id
  
  if [ -z "$project_id" ]; then
    echo "Project ID cannot be empty."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  echo -e "${BLUE}How would you like to select files?${NC}"
  echo "1) Search pattern"
  echo "2) Specific file paths"
  read -e selection_method
  
  case $selection_method in
    1)
      echo -e "${BLUE}Enter search pattern:${NC}"
      read -e pattern
      
      if [ -z "$pattern" ]; then
        echo "Search pattern cannot be empty."
        echo "Press Enter to continue..."
        read
        return
      fi
      
      echo "Adding files matching '$pattern' to project $project_id..."
      python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" add-files "$project_id" -p "$pattern"
      ;;
    2)
      echo -e "${BLUE}Enter file paths (space-separated):${NC}"
      read -e file_paths
      
      if [ -z "$file_paths" ]; then
        echo "File paths cannot be empty."
        echo "Press Enter to continue..."
        read
        return
      fi
      
      echo "Adding specified files to project $project_id..."
      python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" add-files "$project_id" -f $file_paths
      ;;
    *)
      echo "Invalid selection method."
      ;;
  esac
  
  echo "Press Enter to continue..."
  read
}

# Function to generate QR code for a drive
generate_qr() {
  echo -e "${BLUE}Enter drive ID:${NC}"
  read -e drive_id
  
  if [ -z "$drive_id" ]; then
    echo "Drive ID cannot be empty."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  echo -e "${BLUE}Enter custom label (optional):${NC}"
  read -e label
  
  if [ -z "$label" ]; then
    echo "Generating QR code for drive $drive_id..."
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" qr "$drive_id"
  else
    echo "Generating QR code for drive $drive_id with label $label..."
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" qr "$drive_id" -l "$label"
  fi
  
  echo "Press Enter to continue..."
  read
}

# Function to batch catalog all mounted drives
batch_catalog_drives() {
  echo "===== Batch Cataloging All Mounted Drives ====="
  echo

  # Drives to ignore
  IGNORE_DRIVES=("/media/GMCloud48TB01")
  
  # Detect mounted drives and their labels
  echo "Detecting mounted drives..."
  MOUNTED_DRIVES=()
  DRIVE_LABELS=()
  CUSTOM_LABELS=()  # Array to store user-defined labels
  ENABLE_TRANSCRIPTION=0  # Global flag for transcription
  DUPLICATES_CHOICE=1  # Default choice for duplicates (1=replace, 2=create new, 3=skip)
  PARALLEL=0  # Default to serial processing
  
  # Common media mount points
  MOUNT_POINTS=$(mount | grep "/media/" | awk '{print $3}')
  
  if [ -z "$MOUNT_POINTS" ]; then
    echo "No external drives detected in /media/"
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # List detected drives
  echo "Detected the following drives:"
  i=1
  for mount in $MOUNT_POINTS; do
    # Check if this drive should be ignored
    IGNORE=0
    for ignore_mount in "${IGNORE_DRIVES[@]}"; do
      if [ "$mount" == "$ignore_mount" ]; then
        echo "Ignoring $mount (in exclude list)"
        IGNORE=1
        break
      fi
    done
    
    if [ $IGNORE -eq 1 ]; then
      continue
    fi
    
    drive_name=$(basename "$mount")
    size=$(df -h "$mount" | awk 'NR==2 {print $2}')
    used=$(df -h "$mount" | awk 'NR==2 {print $5}')
    
    echo "$i) $mount ($drive_name) - Size: $size, Used: $used"
    MOUNTED_DRIVES+=("$mount")
    DRIVE_LABELS+=("$drive_name")  # Use exact drive name without suffix
    ((i++))
  done
  
  echo
  echo -e "${BLUE}Do you want to catalog all these drives? (y/n)${NC}"
  read -e confirm
  
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    echo "Operation canceled."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Check if any drives are already in database
  echo "Checking for existing drives in database..."
  python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" drives
  
  echo
  echo -e "${BLUE}Continue with cataloging? (y/n)${NC}"
  read -e confirm
  
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    echo "Operation canceled."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Ask about processing method (serial vs parallel)
  echo
  echo -e "${BLUE}Select cataloging method:${NC}"
  echo "1) Serial cataloging (one drive at a time, safer)"
  echo "2) Parallel cataloging (2 drives simultaneously, faster)"
  read -e process_method
  
  # Set up parallel processing if selected
  if [[ "$process_method" == "2" ]]; then
    PARALLEL=1
    echo "Selected parallel cataloging"
  else
    echo "Selected serial cataloging (default)"
  fi
  
  # Ask about how to handle duplicate drives
  echo
  echo -e "${BLUE}How should duplicate drive entries be handled?${NC}"
  echo "1) Replace existing entries (keeps same drive ID)"
  echo "2) Create new entries (results in duplicates)"
  echo "3) Skip duplicate drives (only catalog new drives)"
  read -e duplicate_choice
  
  # Set default choice based on user input (default to 1 if invalid)
  if [[ "$duplicate_choice" =~ ^[1-3]$ ]]; then
    DUPLICATES_CHOICE=$duplicate_choice
  else
    echo "Invalid choice, using default (replace existing entries)"
    DUPLICATES_CHOICE=1
  fi
  
  # Ask about transcription for all drives
  echo
  echo -e "${BLUE}Enable audio transcription for all drives? (y/n):${NC}"
  read -e do_transcribe
  if [[ "$do_transcribe" =~ ^[Yy] ]]; then
    ENABLE_TRANSCRIPTION=1
    echo "Transcription enabled for all drives"
  fi
  
  # Collect all labels first before starting the batch process
  echo
  echo -e "${YELLOW}Let's set up labels for all drives before processing:${NC}"
  echo
  
  for i in "${!MOUNTED_DRIVES[@]}"; do
    mount_point="${MOUNTED_DRIVES[$i]}"
    default_label="${DRIVE_LABELS[$i]}"
    
    echo -e "$((i+1))) ${BLUE}Drive: $mount_point${NC}"
    echo -e "   ${BLUE}Enter label for this drive (default: $default_label):${NC}"
    read -e custom_label
    
    if [ -z "$custom_label" ]; then
      CUSTOM_LABELS+=("$default_label")
      echo "   Using default label: $default_label"
    else
      CUSTOM_LABELS+=("$custom_label")
      echo "   Using custom label: $custom_label"
    fi
    
    echo
  done
  
  # Confirm before starting the walkaway process
  echo -e "${YELLOW}Ready to start walkaway batch processing for all drives.${NC}"
  echo -e "${BLUE}Processing method: $([ "$PARALLEL" -eq 1 ] && echo "Parallel (2 drives at once)" || echo "Serial (one at a time)")${NC}"
  echo -e "${BLUE}For duplicate drives: $([ "$DUPLICATES_CHOICE" -eq 1 ] && echo "Replace existing entries" || [ "$DUPLICATES_CHOICE" -eq 2 ] && echo "Create new entries" || echo "Skip drives")${NC}"
  echo -e "${BLUE}Start processing? (y/n)${NC}"
  read -e start_confirm
  
  if [[ ! "$start_confirm" =~ ^[Yy] ]]; then
    echo "Operation canceled."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Now process all drives in a walkaway batch
  echo "Starting batch processing of all drives..."
  echo
  
  # Create log directory
  LOG_DIR="$HOME/vaultkeeper_logs"
  mkdir -p "$LOG_DIR"
  
  # Build the batch flag for duplicate handling
  BATCH_FLAGS="--batch-mode --duplicate-choice $DUPLICATES_CHOICE"
  
  if [ $PARALLEL -eq 1 ]; then
    # Parallel processing (2 drives at a time)
    # For true parallel processing, we'll launch all processes at once
    # and use a separate loop to monitor them
    
    echo "Starting parallel processing of drives..."
    
    # Start a progress status file to track overall completion
    echo "0" > "$LOG_DIR/total_completed"
    total_drives=${#MOUNTED_DRIVES[@]}
    echo "$total_drives" > "$LOG_DIR/total_drives"
    
    # Array to store all PIDs
    declare -a CATALOG_PIDS=()
    declare -a MONITOR_PIDS=()
    
    # Track which drives are being processed in which slot
    declare -a PROCESSING_SLOTS=()
    
    # First, start all processes simultaneously (2 at a time)
    for i in "${!MOUNTED_DRIVES[@]}"; do
      # Process current drive
      mount_point="${MOUNTED_DRIVES[$i]}"
      label="${CUSTOM_LABELS[$i]}"
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${BLUE}CATALOGING Drive #$((i+1)): $mount_point (Label: $label)${NC}"
      if [ $ENABLE_TRANSCRIPTION -eq 1 ]; then
        echo -e "${BLUE}Transcription: ENABLED${NC}"
      else
        echo -e "${BLUE}Transcription: DISABLED${NC}"
      fi
      echo -e "${GREEN}==================================================${NC}"
      
      # Create log file
      LOG_FILE="$LOG_DIR/drive_$(echo "$mount_point" | tr '/' '_').log"
      
      # Start catalog in background
      echo "Launching cataloging process in background..."
      echo "Logging output to: $LOG_FILE"
      
      if [ $ENABLE_TRANSCRIPTION -eq 1 ]; then
        (python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" -t $BATCH_FLAGS > "$LOG_FILE" 2>&1) &
      else
        (python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" $BATCH_FLAGS > "$LOG_FILE" 2>&1) &
      fi
      CATALOG_PID=$!
      CATALOG_PIDS+=($CATALOG_PID)
      
      # Store the drive being processed in this slot
      PROCESSING_SLOTS+=($i)
      
      # Create a progress monitoring loop for this drive
      (
        drive_num=$((i+1))
        drive_label="$label"
        drive_log="$LOG_FILE"
        catalog_pid=$CATALOG_PID
        
        echo -e "${BLUE}Started monitoring for Drive #${drive_num} ($drive_label)${NC}"
        
        while true; do
          if [ -f "$drive_log" ]; then
            # Extract the latest progress information
            PROGRESS=$(tail -n 100 "$drive_log" | grep -E "Progress:|Processing directory:|Processed [0-9]+ R3D files|Generated thumbnail for:|Extracted media info for:" | tail -n 1)
            if [ ! -z "$PROGRESS" ]; then
              echo -e "${BLUE}Drive #${drive_num} ($drive_label):${NC} $PROGRESS"
            fi
          fi
          
          # Check if the process is still running
          if ! kill -0 $catalog_pid 2>/dev/null; then
            echo -e "${GREEN}Drive #${drive_num} ($drive_label) process completed${NC}"
            
            # Update completion counter
            completed=$(cat "$LOG_DIR/total_completed")
            completed=$((completed + 1))
            echo "$completed" > "$LOG_DIR/total_completed"
            
            # Calculate and display overall progress
            total=$(cat "$LOG_DIR/total_drives")
            percent=$((completed * 100 / total))
            echo -e "${YELLOW}Overall progress: ${completed}/${total} drives completed (${percent}%)${NC}"
            
            break
          fi
          
          sleep 5
        done
      ) &
      MONITOR_PID=$!
      MONITOR_PIDS+=($MONITOR_PID)
      
      # If we've started 2 processes or this is the last drive, 
      # wait until one finishes before starting more
      if [ $(( (i+1) % 2 )) -eq 0 ] || [ $i -eq $((${#MOUNTED_DRIVES[@]} - 1)) ]; then
        echo "Maximum concurrent processes reached (or all drives started)"
        echo "Letting processing continue in background..."
        echo
      fi
    done
    
    # Wait for all catalog processes to complete
    echo
    echo -e "${YELLOW}All drives are being processed in parallel.${NC}"
    echo -e "${YELLOW}Progress updates are displayed above. You can safely continue using the menu.${NC}"
    echo -e "${YELLOW}When all drives complete, a summary will be shown.${NC}"
    
    # Don't wait here - this is a walkaway process
    # We'll let the monitoring processes handle the updates
    echo
    echo -e "${GREEN}Returning to main menu. Processing continues in background.${NC}"
    
  else
    # Serial processing for cataloging
    for i in "${!MOUNTED_DRIVES[@]}"; do
      mount_point="${MOUNTED_DRIVES[$i]}"
      label="${CUSTOM_LABELS[$i]}"
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${BLUE}CATALOGING Drive #$((i+1)): $mount_point (Label: $label)${NC}"
      if [ $ENABLE_TRANSCRIPTION -eq 1 ]; then
        echo -e "${BLUE}Transcription: ENABLED${NC}"
      else
        echo -e "${BLUE}Transcription: DISABLED${NC}"
      fi
      echo -e "${GREEN}==================================================${NC}"
      
      # Catalog the drive with predetermined settings
      echo "Starting cataloging..."
      
      if [ $ENABLE_TRANSCRIPTION -eq 1 ]; then
        python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" -t $BATCH_FLAGS
      else
        python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" $BATCH_FLAGS
      fi
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${GREEN}Completed cataloging drive: $mount_point${NC}"
      echo -e "${GREEN}==================================================${NC}"
      echo
    done
  fi
  
  echo "All drives have been processed."
  echo "Press Enter to continue..."
  read
}

# Function to run shelf drive health check
run_shelf_drive_check() {
  echo -e "${BLUE}Running Shelf Drive Health Check${NC}"
  echo "This test is designed for drives that have been sitting unused for extended periods,"
  echo "checking for issues like stiction, bearing problems, and surface degradation."
  echo
  
  # Drives to ignore
  IGNORE_DRIVES=("/dev/disk/by-label/GMCloud48TB01")
  
  # Drive types to ignore for health check (NVMe, etc.)
  IGNORE_TYPES=("nvme")
  
  # Get disk information directly using lsblk
  echo "Getting disk information..."
  
  # Filter out disks that are mounted to ignored paths
  echo -e "${BLUE}Available disks:${NC}"
  
  # Get all disks (not partitions)
  mapfile -t DISKS < <(lsblk -dno NAME | grep -v loop)
  
  for disk_name in "${DISKS[@]}"; do
    # Check if this disk type should be ignored (NVMe, etc.)
    IGNORE=0
    for ignore_type in "${IGNORE_TYPES[@]}"; do
      if [[ "$disk_name" == "$ignore_type"* ]]; then
        IGNORE=1
        break
      fi
    done
    
    if [ $IGNORE -eq 1 ]; then
      continue  # Skip this disk type entirely
    fi
    
    # Check if this disk has any partitions mounted at ignored locations
    IGNORE=0
    
    # Get all mountpoints for this disk
    mapfile -t MOUNTS < <(lsblk -no MOUNTPOINT /dev/$disk_name | grep -v "^$")
    
    # Check each mount against ignore list
    for mount_point in "${MOUNTS[@]}"; do
      for ignore_mount in "${IGNORE_DRIVES[@]}"; do
        if [ "$mount_point" == "$ignore_mount" ]; then
          IGNORE=1
          break
        fi
      done
      
      if [ $IGNORE -eq 1 ]; then
        break
      fi
    done
    
    # Get disk size and other info
    disk_size=$(lsblk -dno SIZE /dev/$disk_name)
    disk_model=$(lsblk -dno MODEL /dev/$disk_name 2>/dev/null)
    
    # Format model if available
    MODEL_INFO=""
    if [ ! -z "$disk_model" ]; then
      MODEL_INFO=" - Model: $disk_model"
    fi
    
    # Get mount information for display
    MOUNT_INFO=""
    if [ ${#MOUNTS[@]} -gt 0 ]; then
      MOUNT_INFO=" - Mounted at: ${MOUNTS[0]}"
      if [ ${#MOUNTS[@]} -gt 1 ]; then
        MOUNT_INFO="$MOUNT_INFO and ${#MOUNTS[@]} other locations"
      fi
    fi
    
    # Display disk info
    if [ $IGNORE -eq 1 ]; then
      echo "$disk_name - Size: $disk_size$MODEL_INFO - IGNORED (contains excluded mount points)"
    else
      echo "$disk_name - Size: $disk_size$MODEL_INFO$MOUNT_INFO"
    fi
  done
  
  echo
  echo -e "${BLUE}Enter the disk to check (e.g., sda, sdb):${NC}"
  read -e disk_name
  
  if [ -z "$disk_name" ]; then
    echo "No disk specified. Returning to menu."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Build the full path
  disk_path="/dev/$disk_name"
  
  # Check if the disk exists
  if [ ! -b "$disk_path" ]; then
    echo "Error: $disk_path is not a valid block device"
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Check if disk is in the ignore list
  for part in $(lsblk -no NAME,MOUNTPOINT /dev/$disk_name | grep -v "^$disk_name"); do
    part_mount=$(echo $part | awk '{print $2}')
    for ignore_mount in "${IGNORE_DRIVES[@]}"; do
      if [ "$part_mount" == "$ignore_mount" ]; then
        echo "Error: This disk contains an ignored mount point ($part_mount)"
        echo "Press Enter to continue..."
        read
        return
      fi
    done
  done
  
  echo "You are about to run a comprehensive health check on $disk_path."
  echo "This test requires sudo privileges and will take several minutes to complete."
  echo
  echo -e "${YELLOW}Warning: This test will spin down and spin up the drive multiple times.${NC}"
  echo -e "${YELLOW}Make sure no processes are using the drive during the test.${NC}"
  echo
  echo -e "${BLUE}Continue with the test? (y/n)${NC}"
  read -e confirm
  
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    echo "Health check canceled."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Build exclude parameters
  EXCLUDE_PARAMS=""
  if [ ${#IGNORE_DRIVES[@]} -gt 0 ]; then
    EXCLUDE_PARAMS="--exclude ${IGNORE_DRIVES[@]} --"
  fi
  
  # Run the health check script with sudo
  echo "Running health check on $disk_path..."
  sudo "$SCRIPT_DIR/scripts/shelf-drive-check.sh" $EXCLUDE_PARAMS "$disk_path"
  
  echo
  echo "Health check complete."
  echo "Press Enter to continue..."
  read
}

# Function to perform full process (catalog + health check) on all drives
full_process() {
  echo -e "${GREEN}=====================================================${NC}"
  echo -e "${GREEN}     FULL PROCESS: CATALOG + HEALTH CHECK DRIVES     ${NC}"
  echo -e "${GREEN}=====================================================${NC}"
  echo
  
  # Drives to ignore
  IGNORE_DRIVES=("/media/GMCloud48TB01")
  
  # Drive types to ignore for health check (NVMe, etc.)
  IGNORE_TYPES=("nvme")
  
  # First, detect all mounted drives
  echo "Detecting mounted drives..."
  MOUNTED_DRIVES=()
  DRIVE_LABELS=()
  DRIVE_DEVS=()
  CUSTOM_LABELS=()
  SKIP_HEALTH_ARRAY=()
  TRANSCRIBE_ARRAY=()
  DUPLICATES_CHOICE=1  # Default choice for duplicates (1=replace, 2=create new, 3=skip)
  
  # Get all mount points in /media
  MOUNT_POINTS=$(mount | grep "/media/" | awk '{print $3}')
  
  if [ -z "$MOUNT_POINTS" ]; then
    echo "No external drives detected in /media/"
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Filter and prepare drives for cataloging
  echo -e "\n${BLUE}Drives available for processing:${NC}"
  i=1
  for mount in $MOUNT_POINTS; do
    # Check if this mount should be ignored
    IGNORE=0
    for ignore_mount in "${IGNORE_DRIVES[@]}"; do
      if [ "$mount" == "$ignore_mount" ]; then
        echo "Ignoring $mount (in exclude list)"
        IGNORE=1
        break
      fi
    done
    
    if [ $IGNORE -eq 1 ]; then
      continue
    fi
    
    # Get drive info
    drive_name=$(basename "$mount")
    size=$(df -h "$mount" | awk 'NR==2 {print $2}')
    used=$(df -h "$mount" | awk 'NR==2 {print $5}')
    
    # Try to find device name
    device=$(mount | grep "$mount" | awk '{print $1}')
    device_short=$(basename "$device")
    parent_device=${device_short%%[0-9]*}
    
    echo "$i) $mount ($drive_name) - Size: $size, Used: $used - Device: /dev/$parent_device"
    MOUNTED_DRIVES+=("$mount")
    DRIVE_LABELS+=("$drive_name")  # Use exact drive name without suffix
    DRIVE_DEVS+=("$parent_device")
    ((i++))
  done
  
  echo
  echo -e "${BLUE}Do you want to process all these drives? (y/n)${NC}"
  read -e confirm
  
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    echo "Operation canceled."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Check if any drives are already in database
  echo "Checking for existing drives in database..."
  python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" drives
  
  # Ask about how to handle duplicate drives
  echo
  echo -e "${BLUE}How should duplicate drive entries be handled?${NC}"
  echo "1) Replace existing entries (keeps same drive ID)"
  echo "2) Create new entries (results in duplicates)"
  echo "3) Skip duplicate drives (only catalog new drives)"
  read -e duplicate_choice
  
  # Set default choice based on user input (default to 1 if invalid)
  if [[ "$duplicate_choice" =~ ^[1-3]$ ]]; then
    DUPLICATES_CHOICE=$duplicate_choice
  else
    echo "Invalid choice, using default (replace existing entries)"
    DUPLICATES_CHOICE=1
  fi
  
  # Ask for processing method for cataloging
  echo
  echo -e "${BLUE}Select cataloging method:${NC}"
  echo "1) Serial cataloging (one drive at a time, safer)"
  echo "2) Parallel cataloging (2 drives simultaneously, faster)"
  read -e process_method
  
  # Set up parallel processing if selected
  PARALLEL=0
  if [[ "$process_method" == "2" ]]; then
    PARALLEL=1
    echo "Selected parallel cataloging"
  else
    echo "Selected serial cataloging (default)"
  fi
  
  # Global transcription setting
  echo
  echo -e "${BLUE}Do you want to enable audio transcription for all drives? (y/n):${NC}"
  read -e global_transcribe
  ENABLE_GLOBAL_TRANSCRIPTION=0
  
  if [[ "$global_transcribe" =~ ^[Yy] ]]; then
    ENABLE_GLOBAL_TRANSCRIPTION=1
    echo "Transcription will be enabled for all drives"
  else
    echo
    echo -e "${BLUE}Do you want to enable transcription for specific drives? (y/n):${NC}"
    read -e specific_transcribe
    if [[ "$specific_transcribe" =~ ^[Yy] ]]; then
      SPECIFIC_TRANSCRIPTION=1
      echo "You'll be asked about transcription for each drive individually"
    else
      SPECIFIC_TRANSCRIPTION=0
      echo "Transcription will be disabled for all drives"
    fi
  fi
  
  # Collect all labels and drive-specific settings before processing
  echo
  echo -e "${YELLOW}Let's set up labels and settings for all drives before processing:${NC}"
  echo
  
  for i in "${!MOUNTED_DRIVES[@]}"; do
    mount_point="${MOUNTED_DRIVES[$i]}"
    default_label="${DRIVE_LABELS[$i]}"
    device="${DRIVE_DEVS[$i]}"
    
    echo -e "$((i+1))) ${BLUE}Drive: $mount_point${NC}"
    echo -e "   ${BLUE}Enter label for this drive (default: $default_label):${NC}"
    read -e custom_label
    
    if [ -z "$custom_label" ]; then
      CUSTOM_LABELS+=("$default_label")
      echo "   Using default label: $default_label"
    else
      CUSTOM_LABELS+=("$custom_label")
      echo "   Using custom label: $custom_label"
    fi
    
    # Check if this drive type should skip health check
    SKIP_HEALTH=0
    for ignore_type in "${IGNORE_TYPES[@]}"; do
      if [[ "$device" == "$ignore_type"* ]]; then
        echo "   Will skip health check for this drive (type: $device)"
        SKIP_HEALTH=1
        break
      fi
    done
    SKIP_HEALTH_ARRAY+=($SKIP_HEALTH)
    
    # Individual transcription settings if not using global setting
    if [ $ENABLE_GLOBAL_TRANSCRIPTION -eq 1 ]; then
      TRANSCRIBE_ARRAY+=(1)
      echo "   Transcription: ENABLED (global setting)"
    elif [ $SPECIFIC_TRANSCRIPTION -eq 1 ]; then
      echo -e "   ${BLUE}Enable audio transcription for this drive? (y/n):${NC}"
      read -e drive_transcribe
      if [[ "$drive_transcribe" =~ ^[Yy] ]]; then
        TRANSCRIBE_ARRAY+=(1)
        echo "   Transcription: ENABLED"
      else
        TRANSCRIBE_ARRAY+=(0)
        echo "   Transcription: DISABLED"
      fi
    else
      TRANSCRIBE_ARRAY+=(0)
      echo "   Transcription: DISABLED (global setting)"
    fi
    
    echo
  done
  
  # Confirm before starting the walkaway process
  echo -e "${YELLOW}Ready to start walkaway processing for all drives.${NC}"
  echo -e "${BLUE}For duplicate drives: $([ "$DUPLICATES_CHOICE" -eq 1 ] && echo "Replace existing entries" || [ "$DUPLICATES_CHOICE" -eq 2 ] && echo "Create new entries" || echo "Skip drives")${NC}"
  echo -e "${BLUE}Start processing? (y/n)${NC}"
  read -e start_confirm
  
  if [[ ! "$start_confirm" =~ ^[Yy] ]]; then
    echo "Operation canceled."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Prepare log directory
  LOG_DIR="$HOME/vaultkeeper_logs"
  mkdir -p "$LOG_DIR"
  
  # PHASE 1: RUN ALL HEALTH CHECKS IN SERIES FIRST (safer for spin-up tests)
  echo
  echo -e "${GREEN}=====================================================${NC}"
  echo -e "${GREEN}     PHASE 1: RUNNING DRIVE HEALTH CHECKS (SERIAL)   ${NC}"
  echo -e "${GREEN}=====================================================${NC}"
  echo
  
  for i in "${!MOUNTED_DRIVES[@]}"; do
    device="${DRIVE_DEVS[$i]}"
    mount_point="${MOUNTED_DRIVES[$i]}"
    label="${CUSTOM_LABELS[$i]}"
    SKIP_HEALTH=${SKIP_HEALTH_ARRAY[$i]}
    
    echo
    echo -e "${GREEN}==================================================${NC}"
    echo -e "${BLUE}Health check for Drive #$((i+1)): $mount_point (Label: $label)${NC}"
    echo -e "${GREEN}==================================================${NC}"
    
    if [ $SKIP_HEALTH -eq 1 ]; then
      echo "Skipping health check for $device (drive type in ignore list)"
    else
      # Build exclude parameters
      EXCLUDE_PARAMS=""
      if [ ${#IGNORE_DRIVES[@]} -gt 0 ]; then
        EXCLUDE_PARAMS="--exclude ${IGNORE_DRIVES[@]} --"
      fi
      
      # Run health check
      echo "Running health check on /dev/$device..."
      sudo "$SCRIPT_DIR/scripts/shelf-drive-check.sh" $EXCLUDE_PARAMS "/dev/$device"
      
      echo
      echo -e "${GREEN}Health check completed for drive #$((i+1)): $mount_point${NC}"
    fi
  done
  
  # PHASE 2: CATALOG ALL DRIVES (can be parallel)
  echo
  echo -e "${GREEN}=====================================================${NC}"
  if [ $PARALLEL -eq 1 ]; then
    echo -e "${GREEN}     PHASE 2: CATALOGING DRIVES (PARALLEL)         ${NC}"
  else
    echo -e "${GREEN}     PHASE 2: CATALOGING DRIVES (SERIAL)           ${NC}"
  fi
  echo -e "${GREEN}=====================================================${NC}"
  echo
  
  # Build the batch flag for duplicate handling
  BATCH_FLAGS="--batch-mode --duplicate-choice $DUPLICATES_CHOICE"
  
  if [ $PARALLEL -eq 1 ]; then
    # Parallel processing (2 drives at a time)
    # For true parallel processing, we'll launch all processes at once
    # and use a separate loop to monitor them
    
    echo "Starting parallel processing of drives..."
    
    # Start a progress status file to track overall completion
    echo "0" > "$LOG_DIR/total_completed"
    total_drives=${#MOUNTED_DRIVES[@]}
    echo "$total_drives" > "$LOG_DIR/total_drives"
    
    # Array to store all PIDs
    declare -a CATALOG_PIDS=()
    declare -a MONITOR_PIDS=()
    
    # First, start all processes simultaneously (2 at a time)
    for i in "${!MOUNTED_DRIVES[@]}"; do
      # Process in pairs, limiting to 2 at a time
      if [ $((i % 2)) -eq 0 ]; then
        # If we have two or more running already, wait for one to finish
        if [ ${#CATALOG_PIDS[@]} -ge 2 ]; then
          echo "Maximum of 2 processes already running, waiting for one to complete..."
          wait -n ${CATALOG_PIDS[@]}
          
          # Remove the finished PID from our array (this is complicated in bash)
          # We'll simply rebuild the array with running processes
          NEW_PIDS=()
          for pid in "${CATALOG_PIDS[@]}"; do
            if kill -0 $pid 2>/dev/null; then
              NEW_PIDS+=($pid)
            fi
          done
          CATALOG_PIDS=("${NEW_PIDS[@]}")
        fi
      fi
      
      # Process current drive
      mount_point="${MOUNTED_DRIVES[$i]}"
      label="${CUSTOM_LABELS[$i]}"
      do_transcribe=${TRANSCRIBE_ARRAY[$i]}
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${BLUE}CATALOGING Drive #$((i+1)): $mount_point (Label: $label)${NC}"
      if [ $do_transcribe -eq 1 ]; then
        echo -e "${BLUE}Transcription: ENABLED${NC}"
      else
        echo -e "${BLUE}Transcription: DISABLED${NC}"
      fi
      echo -e "${GREEN}==================================================${NC}"
      
      # Create log file
      LOG_FILE="$LOG_DIR/drive_$(echo "$mount_point" | tr '/' '_').log"
      
      # Start catalog in background
      echo "Launching cataloging process in background..."
      echo "Logging output to: $LOG_FILE"
      
      if [ $do_transcribe -eq 1 ]; then
        (python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" -t $BATCH_FLAGS > "$LOG_FILE" 2>&1) &
      else
        (python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" $BATCH_FLAGS > "$LOG_FILE" 2>&1) &
      fi
      CATALOG_PID=$!
      CATALOG_PIDS+=($CATALOG_PID)
      
      # Create a progress monitoring loop for this drive
      (
        drive_num=$((i+1))
        drive_label="$label"
        drive_log="$LOG_FILE"
        catalog_pid=$CATALOG_PID
        
        echo -e "${BLUE}Started monitoring for Drive #${drive_num} ($drive_label)${NC}"
        
        while true; do
          if [ -f "$drive_log" ]; then
            # Extract the latest progress information
            PROGRESS=$(tail -n 100 "$drive_log" | grep -E "Progress:|Processing directory:|Processed [0-9]+ R3D files|Generated thumbnail for:|Extracted media info for:" | tail -n 1)
            if [ ! -z "$PROGRESS" ]; then
              echo -e "${BLUE}Drive #${drive_num} ($drive_label):${NC} $PROGRESS"
            fi
          fi
          
          # Check if the process is still running
          if ! kill -0 $catalog_pid 2>/dev/null; then
            echo -e "${GREEN}Drive #${drive_num} ($drive_label) process completed${NC}"
            
            # Update completion counter
            completed=$(cat "$LOG_DIR/total_completed")
            completed=$((completed + 1))
            echo "$completed" > "$LOG_DIR/total_completed"
            
            # Calculate and display overall progress
            total=$(cat "$LOG_DIR/total_drives")
            percent=$((completed * 100 / total))
            echo -e "${YELLOW}Overall progress: ${completed}/${total} drives completed (${percent}%)${NC}"
            
            break
          fi
          
          sleep 5
        done
      ) &
      MONITOR_PID=$!
      MONITOR_PIDS+=($MONITOR_PID)
    done
    
    # Wait for all catalog processes to complete
    echo
    echo -e "${YELLOW}All drives are being processed in parallel with a max of 2 concurrent processes.${NC}"
    echo -e "${YELLOW}Progress updates are displayed above. You can continue using the menu.${NC}"
    echo -e "${YELLOW}When all drives complete, a summary will be shown.${NC}"
    
    # Create a simple completion check that doesn't block the terminal
    (
      # Wait for all catalog processes to finish
      for pid in "${CATALOG_PIDS[@]}"; do
        wait $pid
      done
      
      # All done!
      echo -e "\n${GREEN}===============================================${NC}"
      echo -e "${GREEN}Full process complete! All drives processed.${NC}"
      echo -e "${GREEN}===============================================${NC}"
      
      # Clean up monitor processes
      for pid in "${MONITOR_PIDS[@]}"; do
        kill $pid 2>/dev/null || true
      done
    ) &
    
    echo
    echo -e "${GREEN}Returning to main menu. Processing continues in background.${NC}"
    
  else
    # Serial processing for cataloging
    for i in "${!MOUNTED_DRIVES[@]}"; do
      mount_point="${MOUNTED_DRIVES[$i]}"
      label="${CUSTOM_LABELS[$i]}"
      do_transcribe=${TRANSCRIBE_ARRAY[$i]}
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${BLUE}CATALOGING Drive #$((i+1)): $mount_point (Label: $label)${NC}"
      if [ $do_transcribe -eq 1 ]; then
        echo -e "${BLUE}Transcription: ENABLED${NC}"
      else
        echo -e "${BLUE}Transcription: DISABLED${NC}"
      fi
      echo -e "${GREEN}==================================================${NC}"
      
      # Catalog the drive with predetermined settings
      echo "Starting cataloging..."
      
      if [ $do_transcribe -eq 1 ]; then
        python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" -t $BATCH_FLAGS
      else
        python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" $BATCH_FLAGS
      fi
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${GREEN}Completed cataloging drive: $mount_point${NC}"
      echo -e "${GREEN}==================================================${NC}"
      echo
    done
  fi
  
  echo "All drives have been processed (health checks and cataloging)!"
  echo "Press Enter to return to main menu..."
  read
}

# Function to clean up duplicate drive entries
cleanup_duplicates() {
  echo "Running duplicate drive cleanup utility..."
  python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" cleanup
  echo "Press Enter to continue..."
  read
}

# Function to process transcriptions
process_transcriptions() {
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}     Audio Transcription Processing      ${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo
  
  # Ask for drive ID (optional)
  echo -e "${BLUE}Enter drive ID to process specific drive (leave empty for all pending files):${NC}"
  read -e drive_id
  
  # Select Whisper model
  echo -e "${BLUE}Select Whisper model size:${NC}"
  echo "1) Base (default, good balance between speed and accuracy)"
  echo "2) Tiny (fastest, lower accuracy)"
  echo "3) Small (better accuracy, slower)"
  echo "4) Medium (high accuracy, much slower)"
  echo "5) Large (best accuracy, very slow)"
  read -e model_choice
  
  # Map choice to model name
  case $model_choice in
    1) model="base" ;;
    2) model="tiny" ;;
    3) model="small" ;;
    4) model="medium" ;;
    5) model="large" ;;
    *) model="base" ;;
  esac
  
  # Select number of parallel workers
  echo -e "${BLUE}Select number of parallel transcription workers (1-4, default: 2):${NC}"
  read -e workers
  
  # Default to 2 workers if input is empty or invalid
  if [ -z "$workers" ] || ! [[ "$workers" =~ ^[1-4]$ ]]; then
    workers=2
  fi
  
  # Show estimated time based on model size
  echo
  echo -e "${YELLOW}Estimated processing time per hour of audio:${NC}"
  case $model in
    tiny) echo "  - Tiny model: ~3-5 minutes per hour of audio" ;;
    base) echo "  - Base model: ~8-12 minutes per hour of audio" ;;
    small) echo "  - Small model: ~15-25 minutes per hour of audio" ;;
    medium) echo "  - Medium model: ~30-45 minutes per hour of audio" ;;
    large) echo "  - Large model: ~60-90 minutes per hour of audio" ;;
  esac
  
  # Confirm before starting walkaway process
  echo
  echo -e "${BLUE}Start walkaway transcription processing? (y/n)${NC}"
  read -e confirm
  
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    echo "Transcription processing canceled."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  # Create log directory
  LOG_DIR="$HOME/vaultkeeper_logs"
  mkdir -p "$LOG_DIR"
  
  # Create log file for this transcription batch
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  LOG_FILE="$LOG_DIR/transcription_${TIMESTAMP}.log"
  
  echo
  echo -e "${GREEN}Starting walkaway transcription processing${NC}"
  echo "Transcription log will be saved to: $LOG_FILE"
  echo "This process will continue until all files are processed."
  echo "You can safely return to the main menu when ready."
  echo
  
  # Build command
  if [ -z "$drive_id" ]; then
    echo "Processing all pending transcriptions with $model model using $workers workers..."
    # Use tee to display output in the console and save to log file
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" transcribe -m "$model" -w "$workers" 2>&1 | tee "$LOG_FILE"
  else
    echo "Processing transcriptions for drive $drive_id with $model model using $workers workers..."
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" transcribe -d "$drive_id" -m "$model" -w "$workers" 2>&1 | tee "$LOG_FILE"
  fi
  
  echo
  echo -e "${GREEN}Transcription processing complete!${NC}"
  echo "Results have been logged to: $LOG_FILE"
  echo
  echo "Here's a summary of the processing log:"
  tail -n 15 "$LOG_FILE"
  echo
  echo "Press Enter to continue..."
  read
}

# Function to view a specific transcription
view_transcription() {
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}     View File Transcription             ${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo
  
  echo -e "${BLUE}Enter file ID:${NC}"
  read -e file_id
  
  if [ -z "$file_id" ]; then
    echo "File ID cannot be empty."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  echo "Displaying transcription for file $file_id..."
  python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" show-transcription "$file_id"
  
  echo "Press Enter to continue..."
  read
}

# Main loop
while true; do
  show_menu
  read choice
  
  case $choice in
    1) initialize_db ;;
    2) catalog_drive ;;
    3) batch_catalog_drives ;;
    4) list_drives ;;
    5) search_files ;;
    6) create_project ;;
    7) add_files_to_project ;;
    8) generate_qr ;;
    9) run_shelf_drive_check ;;
    10) full_process ;;
    11) cleanup_duplicates ;;
    12) process_transcriptions ;;
    13) search_transcriptions ;;
    14) view_transcription ;;
    15) echo "Goodbye!"; exit 0 ;;
    *) echo "Invalid option. Press Enter to continue..."; read ;;
  esac
done