"""
Drive health checking functionality for VaultKeeper.

This module provides functions for checking the health of drives,
especially those that have been in storage for extended periods.
"""

import json
import os
import re
import subprocess
import tempfile
import time
from typing import Any, Dict, List, Optional, Tuple

# Default timeout for commands in seconds
DEFAULT_TIMEOUT = 300


def run_command(cmd: List[str], timeout: int = DEFAULT_TIMEOUT) -> Tuple[str, str, int]:
    """Run a command and return stdout, stderr, and return code.
    
    Args:
        cmd: Command to run as a list of strings
        timeout: Timeout in seconds
        
    Returns:
        Tuple of (stdout, stderr, return_code)
    """
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", f"Command timed out after {timeout} seconds", 1
    except Exception as e:
        return "", str(e), 1


def check_smart_status(device_path: str) -> Dict[str, Any]:
    """Check SMART status of a drive.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        
    Returns:
        Dictionary with SMART information
    """
    results = {
        "smart_status": "Unknown",
        "reallocated_sectors": None,
        "pending_sectors": None,
        "uncorrectable_sectors": None,
        "power_on_hours": None,
    }
    
    # Try with -d sat option first (for USB-connected SATA drives)
    stdout, stderr, rc = run_command(["smartctl", "-d", "sat", "-a", device_path])
    
    # If that fails, try without the -d sat option
    if rc != 0:
        stdout, stderr, rc = run_command(["smartctl", "-a", device_path])
        
    # Process SMART output
    if rc == 0 or rc == 4:  # rc=4 means failed SMART commands but output was produced
        # Extract overall health
        health_match = re.search(r"SMART overall-health self-assessment test result: (\w+)", stdout)
        if health_match:
            results["smart_status"] = health_match.group(1)
            
        # Extract key attributes
        attr_map = {
            "Reallocated_Sector_Ct": "reallocated_sectors",
            "Current_Pending_Sector": "pending_sectors",
            "Offline_Uncorrectable": "uncorrectable_sectors",
            "Power_On_Hours": "power_on_hours",
        }
        
        for line in stdout.split("\n"):
            for attr, result_key in attr_map.items():
                if attr in line:
                    try:
                        value = int(re.search(r"\d+", line.split()[-1]).group())
                        results[result_key] = value
                    except (AttributeError, IndexError, ValueError):
                        pass
                        
    return results


def check_drive_spinup(device_path: str) -> Tuple[float, bool]:
    """Test drive spin-up time after spindown.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        
    Returns:
        Tuple of (spin-up time in seconds, whether slow spin-up was detected)
    """
    # Spin down the drive
    run_command(["hdparm", "-y", device_path])
    time.sleep(3)  # Wait for the drive to spin down
    
    # Measure spin-up time
    start_time = time.time()
    run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=1M", "count=1"])
    spin_up_time = time.time() - start_time
    
    # Anything over 5 seconds is considered slow
    slow_spinup = spin_up_time > 5
    
    return spin_up_time, slow_spinup


def check_rotation_stability(device_path: str) -> Tuple[float, bool]:
    """Check the rotational stability of the drive.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        
    Returns:
        Tuple of (stability variation percentage, whether instability was detected)
    """
    speeds = []
    for _ in range(5):
        stdout, _, _ = run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=64M", "count=8", "iflag=direct"])
        
        # Extract speed from dd output
        speed_match = re.search(r"(\d+\.?\d*) MB/s", stdout)
        if speed_match:
            speeds.append(float(speed_match.group(1)))
        time.sleep(1)
        
    if len(speeds) < 2:
        return 0.0, False
        
    # Calculate variation as a percentage
    avg_speed = sum(speeds) / len(speeds)
    max_variation = max(abs(speed - avg_speed) / avg_speed * 100 for speed in speeds)
    
    # Variation over 20% indicates instability
    unstable = max_variation > 20
    
    return max_variation, unstable


def check_drive_surface(device_path: str) -> Dict[str, bool]:
    """Check drive surface by sampling blocks from different areas.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        
    Returns:
        Dictionary with test results
    """
    # Get drive size
    stdout, _, _ = run_command(["blockdev", "--getsize64", device_path])
    size = int(stdout.strip())
    
    results = {
        "start_test_passed": False,
        "middle_test_passed": False,
        "end_test_passed": False,
    }
    
    # Test start sectors
    _, _, rc = run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=1M", "count=10"])
    results["start_test_passed"] = (rc == 0)
    
    # Test middle sectors
    mid_point = size // 2
    mid_skip = mid_point // (1024 * 1024)  # Convert to MB
    _, _, rc = run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=1M", "count=10", "skip=" + str(mid_skip)])
    results["middle_test_passed"] = (rc == 0)
    
    # Test end sectors
    end_point = size - (10 * 1024 * 1024)  # 10MB from the end
    end_skip = end_point // (1024 * 1024)
    _, _, rc = run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=1M", "count=10", "skip=" + str(end_skip)])
    results["end_test_passed"] = (rc == 0)
    
    return results


def check_stiction(device_path: str) -> Dict[str, Any]:
    """Test for stiction issues with multiple spin-up cycles.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        
    Returns:
        Dictionary with test results
    """
    results = {
        "spin_up_times": [],
        "slow_spinups_detected": 0,
    }
    
    for _ in range(3):
        # Spin down the drive
        run_command(["hdparm", "-y", device_path])
        time.sleep(3)  # Wait for the drive to spin down
        
        # Measure spin-up time
        start_time = time.time()
        run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=512k", "count=1"])
        spin_up_time = time.time() - start_time
        
        results["spin_up_times"].append(spin_up_time)
        
        if spin_up_time > 5:
            results["slow_spinups_detected"] += 1
            
    return results


def check_sustained_performance(device_path: str) -> float:
    """Test sustained read performance.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        
    Returns:
        Sustained read speed in MB/s
    """
    stdout, _, _ = run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=1M", "count=1000"])
    
    # Extract speed from dd output
    speed_match = re.search(r"(\d+\.?\d*) MB/s", stdout)
    if speed_match:
        return float(speed_match.group(1))
    return 0.0


def check_temperature(device_path: str) -> Optional[float]:
    """Check drive temperature.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        
    Returns:
        Temperature in Celsius or None if not available
    """
    # Try hddtemp
    stdout, _, rc = run_command(["hddtemp", device_path])
    
    if rc == 0:
        temp_match = re.search(r"(\d+\.?\d*)\s*°C", stdout)
        if temp_match:
            return float(temp_match.group(1))
            
    # Try smartctl as a fallback
    stdout, _, rc = run_command(["smartctl", "-d", "sat", "-A", device_path])
    
    if rc == 0 or rc == 4:
        for line in stdout.split("\n"):
            if "Temperature" in line:
                try:
                    temp = int(re.search(r"\d+", line.split()[-1]).group())
                    return float(temp)
                except (AttributeError, IndexError, ValueError):
                    pass
                    
    return None


def check_random_reads(device_path: str, num_points: int = 10) -> Dict[str, Any]:
    """Test random reads across the drive.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        num_points: Number of random points to test
        
    Returns:
        Dictionary with test results
    """
    # Get drive size
    stdout, _, _ = run_command(["blockdev", "--getsize64", device_path])
    size = int(stdout.strip())
    
    results = {
        "total_points": num_points,
        "successful_reads": 0,
        "failed_points": [],
    }
    
    # Use Python's random module for better randomness
    import random
    
    for i in range(num_points):
        # Generate a random point in MB units
        max_mb = size // (1024 * 1024)
        random_point = random.randint(0, max_mb - 10)  # Leave room for reading 5MB
        
        _, _, rc = run_command(
            ["dd", "if=" + device_path, "of=/dev/null", "bs=1M", "count=5", "skip=" + str(random_point)]
        )
        
        if rc == 0:
            results["successful_reads"] += 1
        else:
            results["failed_points"].append(random_point)
            
    return results


def quick_health_check(device_path: str, verbose: bool = False) -> Dict[str, Any]:
    """Perform a quick health check on a drive.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        verbose: Whether to output verbose information
        
    Returns:
        Dictionary with test results
    """
    results = {
        "device_path": device_path,
        "check_type": "QUICK",
    }
    
    # Start with basic info
    if verbose:
        print("Gathering basic drive information...")
        
    # Get drive model and size
    stdout, _, _ = run_command(["lsblk", "-dno", "MODEL,SIZE", device_path])
    if stdout.strip():
        parts = stdout.strip().split()
        if len(parts) >= 1:
            results["model"] = parts[0]
        if len(parts) >= 2:
            results["size"] = parts[1]
            
    # Check SMART status
    if verbose:
        print("Checking SMART status...")
        
    smart_results = check_smart_status(device_path)
    results.update(smart_results)
    
    # Simple spin-up test
    if verbose:
        print("Testing drive spin-up...")
        
    spin_up_time, slow_spinup = check_drive_spinup(device_path)
    results["spin_up_time"] = spin_up_time
    
    # Check drive temperature
    if verbose:
        print("Checking drive temperature...")
        
    temp = check_temperature(device_path)
    if temp is not None:
        results["temperature_c"] = temp
        
    # Test sustained read performance
    if verbose:
        print("Testing sustained read performance...")
        
    speed = check_sustained_performance(device_path)
    results["read_speed_mbs"] = speed
    
    # Make basic health assessment
    results["passed"] = True
    recommendation = []
    
    if results.get("smart_status") != "PASSED":
        results["passed"] = False
        recommendation.append("SMART status indicates potential problems")
        
    if results.get("reallocated_sectors", 0) > 0:
        results["passed"] = False
        recommendation.append(f"Found {results.get('reallocated_sectors')} reallocated sectors")
        
    if results.get("pending_sectors", 0) > 0:
        results["passed"] = False
        recommendation.append(f"Found {results.get('pending_sectors')} pending sectors")
        
    if results.get("uncorrectable_sectors", 0) > 0:
        results["passed"] = False
        recommendation.append(f"Found {results.get('uncorrectable_sectors')} uncorrectable sectors")
        
    if slow_spinup:
        results["passed"] = False
        recommendation.append("Slow spin-up detected - possible stiction issues")
        
    if results.get("temperature_c", 0) > 45:
        recommendation.append("Drive temperature is high")
        
    if results.get("read_speed_mbs", 0) < 50:
        recommendation.append("Read performance is below recommended levels for media work")
        
    if recommendation:
        results["recommendation"] = "; ".join(recommendation)
    else:
        results["recommendation"] = "Drive appears healthy"
        
    return results


def full_health_check(device_path: str, verbose: bool = False) -> Dict[str, Any]:
    """Perform a comprehensive health check on a drive.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        verbose: Whether to output verbose information
        
    Returns:
        Dictionary with test results
    """
    # Start with quick health check
    results = quick_health_check(device_path, verbose)
    results["check_type"] = "FULL"
    
    # Additional tests
    test_results = {}
    
    # Check rotational stability
    if verbose:
        print("Testing rotational stability...")
        
    stability_variation, unstable = check_rotation_stability(device_path)
    results["rotation_stability"] = stability_variation
    test_results["rotation_test"] = {
        "variation_percent": stability_variation,
        "unstable": unstable,
    }
    
    # Check drive surface
    if verbose:
        print("Testing drive surface in multiple locations...")
        
    surface_results = check_drive_surface(device_path)
    test_results["surface_test"] = surface_results
    
    # Test for stiction with multiple spin-ups
    if verbose:
        print("Testing for stiction with multiple spin-up cycles...")
        
    stiction_results = check_stiction(device_path)
    test_results["stiction_test"] = stiction_results
    results["spin_up_time"] = sum(stiction_results["spin_up_times"]) / len(stiction_results["spin_up_times"])
    
    # Check random reads
    if verbose:
        print("Testing random reads across the drive...")
        
    random_read_results = check_random_reads(device_path)
    test_results["random_read_test"] = random_read_results
    
    # Store detailed test results as JSON
    results["test_results"] = json.dumps(test_results)
    
    # Update health assessment
    recommendation = []
    if "recommendation" in results:
        recommendation = results["recommendation"].split("; ")
        
    if unstable:
        results["passed"] = False
        recommendation.append(f"Rotation instability detected ({stability_variation:.1f}% variation)")
        
    if not all(surface_results.values()):
        results["passed"] = False
        failed_areas = [area.replace("_test_passed", "") for area, passed in surface_results.items() if not passed]
        recommendation.append(f"Surface issues detected in: {', '.join(failed_areas)}")
        
    if stiction_results["slow_spinups_detected"] > 1:
        results["passed"] = False
        recommendation.append(f"Multiple slow spin-ups detected ({stiction_results['slow_spinups_detected']}/3)")
        
    if random_read_results["successful_reads"] < random_read_results["total_points"]:
        results["passed"] = False
        recommendation.append(
            f"Random read errors: {random_read_results['total_points'] - random_read_results['successful_reads']} of {random_read_results['total_points']}"
        )
        
    results["recommendation"] = "; ".join(recommendation) if recommendation else "Drive appears healthy"
    
    return results


def stiction_test(device_path: str, verbose: bool = False) -> Dict[str, Any]:
    """Focused test for stiction issues.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        verbose: Whether to output verbose information
        
    Returns:
        Dictionary with test results
    """
    results = {
        "device_path": device_path,
        "check_type": "STICTION",
        "passed": True,
    }
    
    # Run multiple stiction tests
    if verbose:
        print("Running extended stiction test with 5 spin-up cycles...")
        
    spin_up_times = []
    slow_spinups = 0
    
    for i in range(5):
        if verbose:
            print(f"Spin-up test {i+1}/5...")
            
        # Spin down the drive
        run_command(["hdparm", "-y", device_path])
        time.sleep(3)  # Wait for the drive to spin down
        
        # Measure spin-up time
        start_time = time.time()
        run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=512k", "count=1"])
        spin_up_time = time.time() - start_time
        
        spin_up_times.append(spin_up_time)
        
        if spin_up_time > 5:
            slow_spinups += 1
            if verbose:
                print(f"Slow spin-up detected: {spin_up_time:.2f} seconds")
                
        # Longer wait between tests
        time.sleep(5)
        
    # Calculate average and maximum spin-up times
    avg_time = sum(spin_up_times) / len(spin_up_times)
    max_time = max(spin_up_times)
    
    results["spin_up_time"] = avg_time
    results["max_spin_up_time"] = max_time
    results["slow_spinups_detected"] = slow_spinups
    
    # Make assessment
    if slow_spinups > 1:
        results["passed"] = False
        results["recommendation"] = f"Stiction issues detected: {slow_spinups}/5 slow spin-ups"
    elif slow_spinups == 1:
        results["recommendation"] = "Potential stiction issues: 1/5 slow spin-ups - monitor drive closely"
    else:
        results["recommendation"] = "No stiction issues detected"
        
    # Store detailed test results
    results["test_results"] = json.dumps({
        "spin_up_times": spin_up_times,
        "slow_spinups": slow_spinups,
    })
    
    return results


def surface_test(device_path: str, verbose: bool = False) -> Dict[str, Any]:
    """Comprehensive surface test.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        verbose: Whether to output verbose information
        
    Returns:
        Dictionary with test results
    """
    results = {
        "device_path": device_path,
        "check_type": "SURFACE",
        "passed": True,
    }
    
    # Get drive size
    stdout, _, _ = run_command(["blockdev", "--getsize64", device_path])
    size = int(stdout.strip())
    size_gb = size / (1024**3)
    
    if verbose:
        print(f"Testing drive surface ({size_gb:.1f} GB)...")
        
    # Get drive model
    stdout, _, _ = run_command(["lsblk", "-dno", "MODEL", device_path])
    if stdout.strip():
        results["model"] = stdout.strip()
        
    # Define test points (0%, 25%, 50%, 75%, 95%)
    test_points = [
        {"name": "start", "offset_gb": 0, "size_mb": 10},
        {"name": "quarter", "offset_gb": size_gb * 0.25, "size_mb": 10},
        {"name": "middle", "offset_gb": size_gb * 0.5, "size_mb": 10},
        {"name": "three_quarters", "offset_gb": size_gb * 0.75, "size_mb": 10},
        {"name": "end", "offset_gb": size_gb * 0.95, "size_mb": 10},
    ]
    
    test_results = {}
    failed_areas = []
    
    for point in test_points:
        if verbose:
            print(f"Testing {point['name']} area...")
            
        # Convert GB to MB for dd
        offset_mb = int(point["offset_gb"] * 1024)
        
        # Run test
        _, _, rc = run_command([
            "dd", 
            f"if={device_path}", 
            "of=/dev/null", 
            f"bs=1M", 
            f"count={point['size_mb']}", 
            f"skip={offset_mb}"
        ])
        
        # Check result
        passed = (rc == 0)
        test_results[f"{point['name']}_test"] = {
            "offset_gb": point["offset_gb"],
            "size_mb": point["size_mb"],
            "passed": passed,
        }
        
        if not passed:
            results["passed"] = False
            failed_areas.append(point["name"])
            
    # Random sampling
    if verbose:
        print("Performing random sampling across the drive...")
        
    random_results = check_random_reads(device_path, num_points=20)
    test_results["random_sampling"] = random_results
    
    if random_results["successful_reads"] < random_results["total_points"]:
        results["passed"] = False
        failed_points = random_results["total_points"] - random_results["successful_reads"]
        failed_areas.append(f"random ({failed_points}/{random_results['total_points']} failures)")
        
    # Store results
    results["test_results"] = json.dumps(test_results)
    
    # Make assessment
    if failed_areas:
        results["recommendation"] = f"Surface issues detected in: {', '.join(failed_areas)}"
    else:
        results["recommendation"] = "Drive surface appears healthy"
        
    return results


def performance_test(device_path: str, verbose: bool = False) -> Dict[str, Any]:
    """Comprehensive performance test.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        verbose: Whether to output verbose information
        
    Returns:
        Dictionary with test results
    """
    results = {
        "device_path": device_path,
        "check_type": "PERFORMANCE",
        "passed": True,
    }
    
    # Get drive model
    stdout, _, _ = run_command(["lsblk", "-dno", "MODEL,SIZE", device_path])
    if stdout.strip():
        parts = stdout.strip().split()
        if len(parts) >= 1:
            results["model"] = parts[0]
        if len(parts) >= 2:
            results["size"] = parts[1]
            
    # Test sequential read performance
    if verbose:
        print("Testing sequential read performance...")
        
    test_results = {}
    
    # Run three sequential read tests
    seq_speeds = []
    for i in range(3):
        if verbose:
            print(f"Sequential read test {i+1}/3...")
            
        stdout, _, _ = run_command(["dd", "if=" + device_path, "of=/dev/null", "bs=1M", "count=1000", "iflag=direct"])
        
        # Extract speed from dd output
        speed_match = re.search(r"(\d+\.?\d*) MB/s", stdout)
        if speed_match:
            speed = float(speed_match.group(1))
            seq_speeds.append(speed)
            
    if seq_speeds:
        avg_seq_speed = sum(seq_speeds) / len(seq_speeds)
        results["read_speed_mbs"] = avg_seq_speed
        test_results["sequential_read"] = {
            "speeds": seq_speeds,
            "average": avg_seq_speed,
        }
        
        # Check if speed is acceptable
        if avg_seq_speed < 50:
            results["passed"] = False
            results["recommendation"] = f"Sequential read speed is too low for media work: {avg_seq_speed:.1f} MB/s"
        else:
            results["recommendation"] = f"Drive performance is adequate: {avg_seq_speed:.1f} MB/s sequential read"
            
    # Test random read performance
    if verbose:
        print("Testing random read performance...")
        
    # Use fio if available
    fio_available = subprocess.run(["which", "fio"], capture_output=True).returncode == 0
    
    if fio_available:
        # Create a temporary fio job file
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
            f.write(f"""
            [random-read]
            filename={device_path}
            direct=1
            rw=randread
            bs=4k
            size=1g
            numjobs=1
            time_based=1
            runtime=10
            """)
            fio_job = f.name
            
        try:
            stdout, _, _ = run_command(["fio", "--output-format=json", fio_job])
            
            # Parse fio JSON output
            try:
                fio_results = json.loads(stdout)
                iops = fio_results["jobs"][0]["read"]["iops"]
                test_results["random_read"] = {
                    "iops": iops,
                }
                
                # For media work, random IO is less important than sequential
                if iops < 20:
                    if "recommendation" in results:
                        results["recommendation"] += f"; Random read performance is low: {iops:.1f} IOPS"
                    else:
                        results["recommendation"] = f"Random read performance is low: {iops:.1f} IOPS"
            except (json.JSONDecodeError, KeyError):
                pass
        finally:
            # Clean up temporary file
            os.unlink(fio_job)
            
    # Check for any performance regressions during testing
    if "sequential_read" in test_results:
        speeds = test_results["sequential_read"]["speeds"]
        if len(speeds) > 1:
            first_speed = speeds[0]
            last_speed = speeds[-1]
            
            # Check for speed degradation
            if last_speed < first_speed * 0.8:  # 20% degradation
                results["passed"] = False
                if "recommendation" in results:
                    results["recommendation"] += f"; Performance degradation detected: {first_speed:.1f} -> {last_speed:.1f} MB/s"
                else:
                    results["recommendation"] = f"Performance degradation detected: {first_speed:.1f} -> {last_speed:.1f} MB/s"
                    
    # Store detailed test results
    results["test_results"] = json.dumps(test_results)
    
    return results


def check_drive_health(device_path: str, check_type: str = "quick", verbose: bool = False) -> Dict[str, Any]:
    """Check the health of a drive.
    
    Args:
        device_path: Path to the device (e.g., /dev/sda)
        check_type: Type of health check to perform
        verbose: Whether to output verbose information
        
    Returns:
        Dictionary with test results
    """
    if not os.path.exists(device_path):
        raise ValueError(f"Device path {device_path} does not exist")
        
    if check_type == "quick":
        return quick_health_check(device_path, verbose)
    elif check_type == "full":
        return full_health_check(device_path, verbose)
    elif check_type == "stiction":
        return stiction_test(device_path, verbose)
    elif check_type == "surface":
        return surface_test(device_path, verbose)
    elif check_type == "performance":
        return performance_test(device_path, verbose)
    else:
        raise ValueError(f"Unknown check type: {check_type}")