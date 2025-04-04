# Health Check Guide for Long-Stored Hard Drives

This guide provides methods to assess the health of hard drives that have been sitting unused for extended periods, using open source tools that work even when SMART data isn't available through USB docks.

## Common Issues with Shelf-Stored Drives

Drives that have been sitting inactive for long periods often experience:

1. **Stiction** - mechanical parts sticking together
2. **Lubricant pooling or drying** - uneven distribution of lubricants
3. **Magnetic degradation** - weakening of magnetic domains
4. **Bearing issues** - causing wobble or excessive heat
5. **Electronics degradation** - capacitor aging or contact oxidation

## Prerequisites

Install the necessary tools (Ubuntu/Debian):

```bash
sudo apt update
sudo apt install hdparm smartmontools fio hddtemp lm-sensors e2fsprogs ntfs-3g bc pv
```

## 1. All-in-One Script for Shelf-Stored Drive Health Check

Save this as `shelf-drive-check.sh`:

```bash
#!/bin/bash
# shelf-drive-check.sh - Comprehensive health check for long-stored drives
# Usage: sudo ./shelf-drive-check.sh /dev/sdX

if [ $# -ne 1 ]; then
  echo "Usage: $0 /dev/sdX"
  exit 1
fi

DRIVE=$1

# Verify the drive exists
if [ ! -b "$DRIVE" ]; then
  echo "Error: $DRIVE is not a valid block device"
  exit 1
fi

SIZE=$(blockdev --getsize64 $DRIVE)
SIZE_GB=$(echo "scale=2; $SIZE / (1024*1024*1024)" | bc)
MODEL=$(lsblk -no MODEL $DRIVE 2>/dev/null || echo "Unknown")

echo "====================================================="
echo "  SHELF-STORED DRIVE HEALTH CHECK"
echo "====================================================="
echo "Drive: $DRIVE"
echo "Model: $MODEL"
echo "Size: $SIZE_GB GB"
echo "-----------------------------------------------------"

# Try to get SMART data even though it might not work through USB
echo "Attempting SMART data retrieval (may not work over USB)..."
smartctl -d sat -a $DRIVE > /tmp/smart_output.txt 2>/dev/null
SMART_STATUS=$?

if [ $SMART_STATUS -eq 0 ]; then
  echo "✓ SMART data available"
  grep "SMART overall-health" /tmp/smart_output.txt
  grep "Reallocated_Sector_Ct" /tmp/smart_output.txt
  grep "Current_Pending_Sector" /tmp/smart_output.txt
  grep "Offline_Uncorrectable" /tmp/smart_output.txt
  grep "Power_On_Hours" /tmp/smart_output.txt
else
  echo "✗ SMART data unavailable through USB connection"
fi
echo "-----------------------------------------------------"

# Test 1: Check initial spin-up
echo "Test 1: Initial Spin-Up Time"
echo "Spinning down drive..."
hdparm -y $DRIVE > /dev/null 2>&1
sleep 3
echo "Measuring spin-up time..."
TIMEFORMAT=%R
SPINUP_TIME=$( { time dd if=$DRIVE of=/dev/null bs=1M count=1 2>/dev/null; } 2>&1 )
echo "First access after spindown took: ${SPINUP_TIME} seconds"

if (( $(echo "$SPINUP_TIME > 5" | bc -l) )); then
  echo "⚠ WARNING: Slow spin-up detected, possible stiction issue"
else
  echo "✓ Spin-up time normal"
fi
echo "-----------------------------------------------------"

# Test 2: Rotational stability check
echo "Test 2: Rotational Stability"
echo "Reading large sequential blocks to check for stable rotation..."

PREV_SPEED=0
UNSTABLE=0

for i in {1..5}; do
  echo -n "Test $i: "
  RESULT=$(dd if=$DRIVE of=/dev/null bs=64M count=8 iflag=direct 2>&1)
  SPEED=$(echo "$RESULT" | grep -o "[0-9.]* MB/s" | awk '{print $1}')
  echo "$SPEED MB/s"
  
  if [ $i -gt 1 ]; then
    DIFF=$(echo "scale=2; ($SPEED - $PREV_SPEED) / $PREV_SPEED * 100" | bc)
    if (( $(echo "sqrt($DIFF*$DIFF) > 20" | bc -l) )); then
      UNSTABLE=1
      echo "⚠ WARNING: Speed changed by ${DIFF}% - possible rotation instability"
    fi
  fi
  PREV_SPEED=$SPEED
  sleep 1
done

if [ $UNSTABLE -eq 0 ]; then
  echo "✓ Rotational stability appears normal"
fi
echo "-----------------------------------------------------"

# Test 3: Check drive across its extent
echo "Test 3: Drive Surface Sampling"
echo "Sampling blocks from start, middle, and end of drive..."

# Start sectors
echo -n "Testing start (first 10MB)... "
if dd if=$DRIVE of=/dev/null bs=1M count=10 2>/dev/null; then
  echo "✓ OK"
else
  echo "✗ FAILED - Drive may have issues at start sectors"
fi

# Middle sectors
MID_POINT=$(($SIZE / 2))
MID_SKIP=$(($MID_POINT / (1024*1024)))
echo -n "Testing middle (~${MID_SKIP}MB offset)... "
if dd if=$DRIVE of=/dev/null bs=1M count=10 skip=$MID_SKIP 2>/dev/null; then
  echo "✓ OK"
else
  echo "✗ FAILED - Drive may have issues at middle sectors"
fi

# End sectors
END_POINT=$(($SIZE - (10 * 1024 * 1024)))
END_SKIP=$(($END_POINT / (1024*1024)))
echo -n "Testing end (~${END_SKIP}MB offset)... "
if dd if=$DRIVE of=/dev/null bs=1M count=10 skip=$END_SKIP 2>/dev/null; then
  echo "✓ OK"
else
  echo "✗ FAILED - Drive may have issues at end sectors"
fi
echo "-----------------------------------------------------"

# Test 4: Random reads for surface issues
echo "Test 4: Random Surface Sampling"
echo "Reading from random locations to check for surface issues..."

ERRORS=0
for i in {1..10}; do
  # Generate a truly random point across the drive
  RANDOM_POINT=$((RANDOM * 32768 % (SIZE / (1024*1024))))
  echo -n "Random read at ${RANDOM_POINT}MB... "
  if dd if=$DRIVE of=/dev/null bs=1M count=5 skip=$RANDOM_POINT 2>/dev/null; then
    echo "✓ OK"
  else
    echo "✗ FAILED - Drive may have surface issues at this location"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "✓ No errors detected in random samples"
else
  echo "⚠ WARNING: $ERRORS errors detected in random sampling"
fi
echo "-----------------------------------------------------"

# Test 5: Stiction test with multiple spin-ups
echo "Test 5: Stiction/Motor Test"
echo "Testing drive motor with multiple spin-up cycles..."

SLOW_SPINUPS=0
for i in {1..3}; do
  hdparm -y $DRIVE > /dev/null 2>&1
  sleep 3
  echo -n "Spin-up test $i: "
  TIMEFORMAT=%R
  SPINUP_TIME=$( { time dd if=$DRIVE of=/dev/null bs=512k count=1 2>/dev/null; } 2>&1 )
  echo "${SPINUP_TIME} seconds"
  if (( $(echo "$SPINUP_TIME > 5" | bc -l) )); then
    echo "⚠ WARNING: Slow spin-up detected"
    SLOW_SPINUPS=$((SLOW_SPINUPS + 1))
  fi
done

if [ $SLOW_SPINUPS -eq 0 ]; then
  echo "✓ Drive motor and spin-up appear normal"
elif [ $SLOW_SPINUPS -eq 1 ]; then
  echo "⚠ WARNING: One slow spin-up detected - monitor closely"
else
  echo "⚠ WARNING: Multiple slow spin-ups detected - possible stiction issue"
fi
echo "-----------------------------------------------------"

# Test 6: Sustained performance
echo "Test 6: Sustained Read Performance"
echo "Testing sustained read speed (important for media work)..."

SUSTAINED_RESULT=$(dd if=$DRIVE of=/dev/null bs=1M count=1000 2>&1)
SUSTAINED_SPEED=$(echo "$SUSTAINED_RESULT" | grep -o "[0-9.]* MB/s" | awk '{print $1}')

echo "Sustained read speed: $SUSTAINED_SPEED MB/s"
if (( $(echo "$SUSTAINED_SPEED < 50" | bc -l) )); then
  echo "⚠ WARNING: Drive has poor sustained performance"
else
  echo "✓ Sustained performance acceptable"
fi
echo "-----------------------------------------------------"

# Check temperature if possible
echo "Test 7: Temperature Check"
TEMP=$(hddtemp $DRIVE 2>/dev/null | grep -o "[0-9.]* °C" || echo "Not available")
echo "Drive temperature: $TEMP"
if [[ "$TEMP" != "Not available" ]]; then
  TEMP_VAL=$(echo $TEMP | grep -o "[0-9.]*")
  if (( $(echo "$TEMP_VAL > 45" | bc -l) )); then
    echo "⚠ WARNING: Drive temperature is high"
  else
    echo "✓ Drive temperature normal"
  fi
fi
echo "-----------------------------------------------------"

# Summary
echo "SUMMARY:"
echo "Several tests were performed on drive $DRIVE ($MODEL, $SIZE_GB GB)"
echo ""
echo "Next steps:"
echo "- If any tests failed, consider the drive potentially unreliable"
echo "- For media work, ensure both sustained reads and writes meet requirements"
echo "- For important data, always maintain multiple backups"
echo "- Consider running a more thorough badblocks test if time permits"
echo "====================================================="
```

Make it executable and run it:

```bash
chmod +x shelf-drive-check.sh
sudo ./shelf-drive-check.sh /dev/sdX  # Replace sdX with your drive
```

## 2. Individual Tests and Checks

### Spin-Up and Stiction Test

```bash
# Force drive to standby mode
sudo hdparm -y /dev/sdX

# Wait a few seconds, then time the spin-up
time sudo hdparm -t /dev/sdX

# If it takes more than 5-10 seconds, there may be stiction issues
```

### Rotational Stability Check

```bash
# Check for consistent speeds
for i in {1..5}; do
  echo "Test $i:"
  sudo dd if=/dev/sdX of=/dev/null bs=64M count=8 iflag=direct 2>&1 | grep -i "bytes"
  sleep 2
done
```

### Drive Surface Sampling

```bash
# Test start, middle, and end of drive
sudo dd if=/dev/sdX of=/dev/null bs=1M count=10
sudo dd if=/dev/sdX of=/dev/null bs=1M count=10 skip=$(($(blockdev --getsize64 /dev/sdX) / 2 / 1024 / 1024))
sudo dd if=/dev/sdX of=/dev/null bs=1M count=10 skip=$(($(blockdev --getsize64 /dev/sdX) / 1024 / 1024 - 20))
```

### Lubricant Distribution Test

Lubricants can pool or dry up when drives sit unused. This test exercises the mechanical system:

```bash
# Install fio if needed: sudo apt install fio
sudo fio --name=lube-test --filename=/dev/sdX --direct=1 --rw=randread \
  --bs=4k --size=500m --io_size=2g --ioengine=libaio --iodepth=1 \
  --numjobs=1 --runtime=120 --time_based
```

### Temperature Monitoring

Long-stored drives can develop bearing issues that manifest as abnormal heating:

```bash
# Read a large portion while monitoring temperature
sudo dd if=/dev/sdX of=/dev/null bs=1M count=10000 & 
sudo watch -n 5 "sudo hddtemp /dev/sdX"

# If temperature rises above 45°C or increases rapidly, there may be issues
```

### File System Integrity Check

```bash
# For ext4 file systems (read-only check)
sudo e2fsck -nf /dev/sdX1  # Use the partition, not the whole device

# For NTFS file systems
sudo ntfsfix -n /dev/sdX1

# For HFS+/APFS (Mac)
sudo fsck_hfs -n /dev/sdX1
```

### Media-Specific Workflow Test

Since you work in video production, test if the drive can handle media workflows:

```bash
# Mount the drive first
mkdir -p /mnt/test
sudo mount /dev/sdX1 /mnt/test

# Test sustained write speed (crucial for video work)
sudo dd if=/dev/zero of=/mnt/test/test_file bs=1M count=5000 oflag=direct status=progress

# Test sustained read speed
sudo dd if=/mnt/test/test_file of=/dev/null bs=1M status=progress

# Clean up
rm /mnt/test/test_file
sudo umount /mnt/test
```

## 3. What to Look For

When evaluating a shelf-stored drive, pay attention to:

1. **Spin-up time**: Should be under 5 seconds; longer times suggest mechanical issues
2. **Consistent speeds**: Large variations (>20%) between consecutive tests suggest problems
3. **Strange noises**: Clicking, grinding, or excessive seeking sounds indicate issues
4. **Failed reads**: Any failed reads during sampling indicate surface issues
5. **Temperature**: Excessive or rapidly increasing temperature suggests bearing problems
6. **Sustained performance**: Media work requires consistent throughput

## 4. Recovery Strategy

If issues are detected:

1. **Make a copy first**: If the drive contains important data, make a copy before further testing
2. **Try power cycling**: Some stiction issues resolve after several power cycles
3. **Extended use**: Sometimes drives need "exercise" after long storage - keep them running for a few hours
4. **Climate considerations**: If the drive was stored in a damp environment, allow it to acclimate in a dry environment before testing

## 5. For Critical Data Recovery

If the drive contains irreplaceable data and shows signs of issues:

1. Stop all testing immediately
2. Consider professional data recovery services
3. Do not attempt to "repair" the drive yourself
4. Keep the drive powered off until recovery attempts begin

Remember that these tests provide indicators of health, but even drives that pass all tests can fail unexpectedly. Always maintain backups of important data across multiple drives.
