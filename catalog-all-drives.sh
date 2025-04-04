#!/bin/bash
# Batch script to catalog all mounted drives in the USB dock

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/.venv/bin/activate"

echo "===== VaultKeeper Batch Drive Cataloging ====="
echo

# List of drives and labels
declare -A drives=(
    ["/media/graetzy/ACTIVUS"]="ACTIVUS_7TB_Archive"
    ["/media/graetzy/MHConf2023"]="MHConf2023_7TB_Archive"
    ["/media/graetzy/GMArchive191206"]="GMArchive191206_5TB_Archive"
)

# Check if any drives are already in process
echo "Checking for existing drives in database..."
python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" drives

# Catalog each drive
for mount_point in "${!drives[@]}"; do
    label="${drives[$mount_point]}"
    
    # Check if mount point exists
    if [ -d "$mount_point" ]; then
        echo
        echo "========================================="
        echo "Cataloging drive at: $mount_point"
        echo "Using label: $label"
        echo "========================================="
        
        python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" catalog "$mount_point" -l "$label"
        
        echo "Finished cataloging $label"
        echo
    else
        echo "Mount point $mount_point does not exist, skipping."
    fi
done

echo "All drives have been processed."
echo "To view drives, run: ./vaultkeeper-menu.sh and select '3) List All Drives'"