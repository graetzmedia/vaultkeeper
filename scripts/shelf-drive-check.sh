#!/bin/bash
# shelf-drive-check.sh - Comprehensive health check for long-stored drives
# Usage: sudo ./shelf-drive-check.sh /dev/sdX

# List of drives to ignore
IGNORE_DRIVES=()

if [[ "$1" == "--exclude" ]]; then
  shift
  while [[ "$1" != "--" && $# -gt 0 ]]; do
    IGNORE_DRIVES+=("$1")
    shift
  done
  shift  # Skip the -- separator
fi

if [ $# -ne 1 ]; then
  echo "Usage: $0 [--exclude /dev/sdX1 /dev/sdX2 ... --] /dev/sdX"
  exit 1
fi

DRIVE=$1

# Check if drive is in ignore list
for ignore_drive in "${IGNORE_DRIVES[@]}"; do
  if [ "$DRIVE" == "$ignore_drive" ]; then
    echo "Error: This drive is in the ignore list and cannot be checked"
    exit 1
  fi
done

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

# Try multiple methods to get SMART data through USB
echo "Attempting SMART data retrieval (trying multiple USB passthrough methods)..."
SMART_METHODS=("sat" "sat,auto" "usbjmicron" "usbsunplus" "usbcypress")
SMART_STATUS=1

for METHOD in "${SMART_METHODS[@]}"; do
  echo "Trying SMART method: $METHOD"
  smartctl -d $METHOD -a $DRIVE > /tmp/smart_output.txt 2>/dev/null
  SMART_STATUS=$?
  
  if [ $SMART_STATUS -eq 0 ]; then
    echo "✓ SMART data available using method: $METHOD"
    SMART_METHOD_USED=$METHOD
    break
  fi
done

if [ $SMART_STATUS -eq 0 ]; then
  # Extract key SMART attributes
  echo "Key SMART data:"
  grep "SMART overall-health" /tmp/smart_output.txt || echo "- No overall health assessment"
  grep "Reallocated_Sector_Ct" /tmp/smart_output.txt || echo "- No reallocation count"
  grep "Current_Pending_Sector" /tmp/smart_output.txt || echo "- No pending sectors"
  grep "Offline_Uncorrectable" /tmp/smart_output.txt || echo "- No uncorrectable sectors"
  grep "Power_On_Hours" /tmp/smart_output.txt || echo "- No power-on hours"
  
  # Additional insights from SMART
  HEALTH=$(grep -i "health status" /tmp/smart_output.txt | awk -F': ' '{print $2}')
  if [ -n "$HEALTH" ]; then
    if [ "$HEALTH" == "PASSED" ] || [ "$HEALTH" == "OK" ]; then
      echo "✓ SMART health check: $HEALTH"
    else
      echo "⚠ WARNING: SMART health check shows: $HEALTH"
    fi
  fi
  
  # Look for specific error indicators
  ERRORS=$(grep -i "error" /tmp/smart_output.txt | grep -v "No Errors" | wc -l)
  if [ $ERRORS -gt 0 ]; then
    echo "⚠ WARNING: $ERRORS error-related entries found in SMART data"
  fi
else
  echo "✗ SMART data unavailable through USB connection (tried multiple methods)"
  echo "This is normal for many USB drive enclosures"
  echo "We'll use alternative methods to assess drive health instead"
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

# Alternative temperature check method using drive performance
echo "Test 7: Temperature and Stress Test"
echo "Running intensive operations and monitoring performance changes..."

# Do an intensive read operation and measure performance at start
echo "Initial intensive read..."
START_RESULT=$(dd if=$DRIVE of=/dev/null bs=64M count=16 iflag=direct 2>&1)
START_SPEED=$(echo "$START_RESULT" | grep -o "[0-9.]* MB/s" | awk '{print $1}')
echo "Initial read speed: $START_SPEED MB/s"

# Sleep for a moment to allow drive to potentially heat up
echo "Waiting 10 seconds..."
sleep 10

# Now do another intensive read and compare the performance
echo "Second intensive read..."
END_RESULT=$(dd if=$DRIVE of=/dev/null bs=64M count=16 iflag=direct 2>&1)
END_SPEED=$(echo "$END_RESULT" | grep -o "[0-9.]* MB/s" | awk '{print $1}')
echo "Final read speed: $END_SPEED MB/s"

# Calculate percentage drop
PERF_DIFF=$(echo "scale=2; (($START_SPEED - $END_SPEED) / $START_SPEED) * 100" | bc)
PERF_DIFF_ABS=$(echo "$PERF_DIFF" | tr -d '-')

echo "Performance change: $PERF_DIFF%"

# Infer temperature issues from performance degradation
if (( $(echo "$PERF_DIFF_ABS > 15" | bc -l) )); then
  echo "⚠ WARNING: Significant performance degradation detected under load"
  echo "⚠ WARNING: This may indicate thermal issues or other drive problems"
else
  echo "✓ Drive performance stable under load - no apparent thermal issues"
fi

# Still try to use SMART data if available
if [ $SMART_STATUS -eq 0 ]; then
  TEMP=$(grep -i "temperature" /tmp/smart_output.txt | head -1 | grep -o "[0-9]\+")
  
  if [ -n "$TEMP" ]; then
    echo "Drive temperature from SMART: ${TEMP}°C"
    if (( $(echo "$TEMP > 45" | bc -l) )); then
      echo "⚠ WARNING: Drive temperature is high according to SMART data"
    else
      echo "✓ Drive temperature normal according to SMART data"
    fi
  fi
fi
echo "-----------------------------------------------------"

# Generate a health score based on test results
echo "Computing overall health assessment..."

# Initialize score (100 is perfect)
HEALTH_SCORE=100
ISSUES=()

# Check spin-up time
if (( $(echo "$SPINUP_TIME > 5" | bc -l) )); then
  HEALTH_SCORE=$((HEALTH_SCORE - 15))
  ISSUES+=("Slow spin-up detected (${SPINUP_TIME}s)")
fi

# Check rotational stability
if [ $UNSTABLE -eq 1 ]; then
  HEALTH_SCORE=$((HEALTH_SCORE - 15))
  ISSUES+=("Rotation instability detected")
fi

# Check random read errors
if [ $ERRORS -gt 0 ]; then
  HEALTH_SCORE=$((HEALTH_SCORE - $ERRORS * 10))
  ISSUES+=("$ERRORS surface errors detected during random sampling")
fi

# Check multiple spin-ups
if [ $SLOW_SPINUPS -gt 0 ]; then
  HEALTH_SCORE=$((HEALTH_SCORE - $SLOW_SPINUPS * 5))
  ISSUES+=("$SLOW_SPINUPS slow spin-ups detected during stiction test")
fi

# Check sustained performance
if (( $(echo "$SUSTAINED_SPEED < 50" | bc -l) )); then
  HEALTH_SCORE=$((HEALTH_SCORE - 10))
  ISSUES+=("Poor sustained performance (${SUSTAINED_SPEED} MB/s)")
fi

# Check temperature/performance degradation
if (( $(echo "$PERF_DIFF_ABS > 15" | bc -l) )); then
  HEALTH_SCORE=$((HEALTH_SCORE - 10))
  ISSUES+=("Performance degradation of ${PERF_DIFF_ABS}% under load")
fi

# Add SMART issues if available
if [ $SMART_STATUS -eq 0 ] && [ -n "$HEALTH" ] && [ "$HEALTH" != "PASSED" ] && [ "$HEALTH" != "OK" ]; then
  HEALTH_SCORE=$((HEALTH_SCORE - 20))
  ISSUES+=("SMART health check failed")
fi

# Make sure score doesn't go negative
if [ $HEALTH_SCORE -lt 0 ]; then
  HEALTH_SCORE=0
fi

# Determine health rating
if [ $HEALTH_SCORE -ge 90 ]; then
  HEALTH_RATING="Excellent"
  RATING_COLOR="\033[0;32m" # Green
elif [ $HEALTH_SCORE -ge 75 ]; then
  HEALTH_RATING="Good"
  RATING_COLOR="\033[0;32m" # Green
elif [ $HEALTH_SCORE -ge 50 ]; then
  HEALTH_RATING="Fair - Usable with caution"
  RATING_COLOR="\033[1;33m" # Yellow
elif [ $HEALTH_SCORE -ge 25 ]; then
  HEALTH_RATING="Poor - Use only for non-critical data"
  RATING_COLOR="\033[0;31m" # Red
else
  HEALTH_RATING="Critical - NOT recommended for use"
  RATING_COLOR="\033[0;31m" # Red
fi

# Generate summary
echo "====================================================="
echo "                  SUMMARY REPORT                     "
echo "====================================================="
echo "Drive: $DRIVE ($MODEL, $SIZE_GB GB)"
echo "-----------------------------------------------------"
echo -e "Health Score: $HEALTH_SCORE/100 - ${RATING_COLOR}$HEALTH_RATING\033[0m"
echo "-----------------------------------------------------"

if [ ${#ISSUES[@]} -eq 0 ]; then
  echo "✓ No issues detected"
else
  echo "Issues detected:"
  for i in "${!ISSUES[@]}"; do
    echo "⚠ ${ISSUES[$i]}"
  done
fi

echo "-----------------------------------------------------"
echo "Performance metrics:"
echo "- Spin-up time: ${SPINUP_TIME}s"
echo "- Sustained read speed: ${SUSTAINED_SPEED} MB/s"
echo "- Performance stability: ${PERF_DIFF}% change under load"
echo "-----------------------------------------------------"
echo "Recommendations:"

if [ $HEALTH_SCORE -ge 75 ]; then
  echo "✓ This drive appears reliable for continued use"
  echo "✓ Suitable for all types of storage including critical data (with backups)"
elif [ $HEALTH_SCORE -ge 50 ]; then
  echo "⚠ Use with caution - suitable for non-critical archives"
  echo "⚠ Monitor the drive for further degradation"
  echo "⚠ Do not use as the sole copy of important data"
else
  echo "❌ This drive shows significant issues"
  echo "❌ Recommended actions:"
  echo "   - Recover any important data immediately"
  echo "   - Do not trust for any important storage"
  echo "   - Consider retiring the drive"
fi

echo "-----------------------------------------------------"
echo "For ALL drives, regardless of health:"
echo "- Always maintain multiple backups of important data"
echo "- Periodically verify data integrity"
echo "- Re-check drive health every 6 months or after long storage"
echo "====================================================="