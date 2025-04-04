#!/bin/bash
# VaultKeeper CLI Menu Interface

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/.venv/bin/activate"

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
  echo "  12) Exit"
  echo
  echo -e "${YELLOW}Enter your choice [1-12]:${NC} "
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
  
  if [ -z "$label" ]; then
    echo "Cataloging drive at $mount_point..."
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point"
  else
    echo "Cataloging drive at $mount_point with label $label..."
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label"
  fi
  
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
  
  # Catalog each drive
  for i in "${!MOUNTED_DRIVES[@]}"; do
    mount_point="${MOUNTED_DRIVES[$i]}"
    default_label="${DRIVE_LABELS[$i]}"
    
    echo
    echo -e "${BLUE}Enter label for $mount_point (default: $default_label):${NC}"
    read -e custom_label
    
    label=${custom_label:-$default_label}
    
    echo
    echo "========================================="
    echo "Cataloging drive at: $mount_point"
    echo "Using label: $label"
    echo "========================================="
    
    python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label"
    
    echo "Finished cataloging $label"
    echo
  done
  
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
  
  # Collect all labels first
  echo
  echo -e "${YELLOW}Let's set up labels for all drives before processing:${NC}"
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
    
    echo
  done
  
  # Confirm before starting
  echo -e "${YELLOW}Ready to start processing all drives with the labels shown above.${NC}"
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
  
  # Confirm before starting cataloging
  echo -e "${BLUE}Ready to start cataloging all drives? (y/n)${NC}"
  read -e catalog_confirm
  
  if [[ ! "$catalog_confirm" =~ ^[Yy] ]]; then
    echo "Cataloging canceled, health checks were completed."
    echo "Press Enter to continue..."
    read
    return
  fi
  
  if [ $PARALLEL -eq 1 ]; then
    # Parallel processing (2 drives at a time)
    i=0
    while [ $i -lt ${#MOUNTED_DRIVES[@]} ]; do
      # Process first drive
      mount_point="${MOUNTED_DRIVES[$i]}"
      label="${CUSTOM_LABELS[$i]}"
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${BLUE}CATALOGING Drive #$((i+1)): $mount_point (Label: $label)${NC}"
      echo -e "${GREEN}==================================================${NC}"
      
      # Create log file
      LOG_FILE_1="$LOG_DIR/drive_$(echo "$mount_point" | tr '/' '_').log"
      
      # Start catalog in background
      echo "Starting cataloging in background..."
      echo "Logging output to: $LOG_FILE_1"
      (python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label" > "$LOG_FILE_1" 2>&1) &
      CATALOG_PID_1=$!
      
      # Check if we have a second drive to process
      j=$((i+1))
      if [ $j -lt ${#MOUNTED_DRIVES[@]} ]; then
        mount_point2="${MOUNTED_DRIVES[$j]}"
        label2="${CUSTOM_LABELS[$j]}"
        
        echo
        echo -e "${GREEN}==================================================${NC}"
        echo -e "${BLUE}CATALOGING Drive #$((j+1)): $mount_point2 (Label: $label2)${NC}"
        echo -e "${GREEN}==================================================${NC}"
        
        # Create second log file
        LOG_FILE_2="$LOG_DIR/drive_$(echo "$mount_point2" | tr '/' '_').log"
        
        # Start second catalog in background
        echo "Starting cataloging in background..."
        echo "Logging output to: $LOG_FILE_2"
        (python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point2" -l "$label2" > "$LOG_FILE_2" 2>&1) &
        CATALOG_PID_2=$!
        
        # Wait for both catalog processes to complete
        echo "Waiting for both catalog processes to complete..."
        wait $CATALOG_PID_1
        echo "Catalog for Drive #$((i+1)) completed"
        wait $CATALOG_PID_2
        echo "Catalog for Drive #$((j+1)) completed"
        
        # Show logs
        echo "Catalog log for Drive #$((i+1)):"
        if [ -f "$LOG_FILE_1" ]; then
          cat "$LOG_FILE_1"
        else
          echo "Log file not found"
        fi
        
        echo "Catalog log for Drive #$((j+1)):"
        if [ -f "$LOG_FILE_2" ]; then
          cat "$LOG_FILE_2"
        else
          echo "Log file not found"
        fi
        
        # Clean up log files
        rm -f "$LOG_FILE_1" "$LOG_FILE_2"
        
        # Increment by 2 since we processed 2 drives
        i=$((i+2))
      else
        # Only one drive left, process it normally
        wait $CATALOG_PID_1
        echo "Catalog log for Drive #$((i+1)):"
        if [ -f "$LOG_FILE_1" ]; then
          cat "$LOG_FILE_1"
        else
          echo "Log file not found"
        fi
        
        # Clean up log file
        rm -f "$LOG_FILE_1"
        
        # Increment counter
        i=$((i+1))
      fi
      
      echo
      echo -e "${BLUE}Continue to next batch of drives for cataloging? (y/n)${NC}"
      read -e continue
      if [[ ! "$continue" =~ ^[Yy] ]]; then
        echo "Stopping batch processing."
        break
      fi
    done
    
  else
    # Serial processing for cataloging
    for i in "${!MOUNTED_DRIVES[@]}"; do
      mount_point="${MOUNTED_DRIVES[$i]}"
      label="${CUSTOM_LABELS[$i]}"
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${BLUE}CATALOGING Drive #$((i+1)): $mount_point (Label: $label)${NC}"
      echo -e "${GREEN}==================================================${NC}"
      
      # STEP 1: Catalog the drive
      echo "Starting cataloging..."
      python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label"
      
      echo
      echo -e "${GREEN}==================================================${NC}"
      echo -e "${GREEN}Completed cataloging drive: $mount_point${NC}"
      echo -e "${GREEN}==================================================${NC}"
      echo
      echo "Press Enter to continue to next drive..."
      read
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
    12) echo "Goodbye!"; exit 0 ;;
    *) echo "Invalid option. Press Enter to continue..."; read ;;
  esac
done