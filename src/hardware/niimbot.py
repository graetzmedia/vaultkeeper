"""
NIIMBOT printer integration for VaultKeeper.

This module provides functions for interacting with NIIMBOT label printers.
"""

import os
import pathlib
import platform
import subprocess
import time
from typing import Dict, List, Optional, Tuple, Union

# Default printer types
PRINTER_B1 = "b1"  # NIIMBOT B1 (20-50mm labels)
PRINTER_D101 = "d101"  # NIIMBOT D101 (10-25mm labels)


class NiimbotPrinter:
    """Interface for NIIMBOT Bluetooth label printer."""
    
    def __init__(self, printer_type: str = PRINTER_B1, device_id: Optional[str] = None):
        """Initialize the printer interface.
        
        Args:
            printer_type: Printer type (b1 or d101)
            device_id: Optional specific device ID or address
        """
        self.printer_type = printer_type.lower()
        self.device_id = device_id
        self.platform = platform.system()
        self.connected = False
        
        # Validate printer type
        if self.printer_type not in [PRINTER_B1, PRINTER_D101]:
            raise ValueError(f"Unsupported printer type: {printer_type}")
            
        # Auto-detect printer if device_id not provided
        if not self.device_id:
            self._auto_detect_printer()
            
    def _auto_detect_printer(self):
        """Automatically detect connected NIIMBOT printer."""
        printers = self.discover_printers()
        
        if printers:
            # Use the first detected printer
            self.device_id = printers[0]["id"]
            print(f"Auto-detected NIIMBOT printer: {printers[0]['name']} ({self.device_id})")
    
    def discover_printers(self) -> List[Dict[str, str]]:
        """Discover available NIIMBOT printers.
        
        Returns:
            List of dictionaries with printer information
        """
        printers = []
        
        try:
            if self.platform == "Linux":
                # Use BlueZ tools on Linux
                stdout, _, _ = run_command(["bluetoothctl", "devices"])
                
                for line in stdout.strip().split("\n"):
                    if "NIIMBOT" in line or "niimbot" in line:
                        parts = line.strip().split(" ", 2)
                        if len(parts) >= 3:
                            printers.append({
                                "id": parts[1],
                                "name": parts[2],
                                "type": "bluetooth"
                            })
                            
                # Also check USB-connected printers
                stdout, _, _ = run_command(["lsusb"])
                
                for line in stdout.strip().split("\n"):
                    if "NIIMBOT" in line or "niimbot" in line:
                        printers.append({
                            "id": line.split(" ")[1],
                            "name": line,
                            "type": "usb"
                        })
                        
            elif self.platform == "Darwin":
                # macOS - use system_profiler
                stdout, _, _ = run_command(["system_profiler", "SPBluetoothDataType"])
                
                device_section = False
                current_device = {}
                
                for line in stdout.strip().split("\n"):
                    if ":" not in line:
                        continue
                        
                    if "Bluetooth" in line and ":" in line:
                        device_section = True
                        current_device = {}
                    elif line.strip().startswith("Address:"):
                        if device_section:
                            current_device["id"] = line.split(":", 1)[1].strip()
                    elif line.strip().startswith("Name:"):
                        if device_section:
                            name = line.split(":", 1)[1].strip()
                            current_device["name"] = name
                            
                            if "NIIMBOT" in name or "niimbot" in name:
                                current_device["type"] = "bluetooth"
                                printers.append(current_device.copy())
                                
                # Also check USB devices
                stdout, _, _ = run_command(["system_profiler", "SPUSBDataType"])
                
                for line in stdout.strip().split("\n"):
                    if "NIIMBOT" in line or "niimbot" in line:
                        printers.append({
                            "id": "usb-niimbot",
                            "name": line.strip(),
                            "type": "usb"
                        })
            
            elif self.platform == "Windows":
                # Windows - use PowerShell to get Bluetooth devices
                stdout, _, _ = run_command(
                    ["powershell", "-Command", "Get-PnpDevice -Class Bluetooth"]
                )
                
                for line in stdout.strip().split("\n"):
                    if "NIIMBOT" in line or "niimbot" in line:
                        printers.append({
                            "id": "windows-niimbot",
                            "name": line.strip(),
                            "type": "bluetooth"
                        })
                        
                # Also check USB devices
                stdout, _, _ = run_command(
                    ["powershell", "-Command", "Get-PnpDevice -Class USB"]
                )
                
                for line in stdout.strip().split("\n"):
                    if "NIIMBOT" in line or "niimbot" in line:
                        printers.append({
                            "id": "usb-niimbot",
                            "name": line.strip(),
                            "type": "usb"
                        })
        except Exception as e:
            print(f"Error discovering printers: {e}")
            
        return printers
    
    def connect(self) -> bool:
        """Connect to the printer.
        
        Returns:
            True if connection was successful, False otherwise
        """
        if not self.device_id:
            print("No printer device ID specified or detected")
            return False
            
        try:
            if self.platform == "Linux":
                # Check if already connected
                stdout, _, _ = run_command(
                    ["bluetoothctl", "info", self.device_id]
                )
                
                if "Connected: yes" in stdout:
                    self.connected = True
                    return True
                    
                # Try to connect
                stdout, _, _ = run_command(
                    ["bluetoothctl", "connect", self.device_id]
                )
                
                if "Connection successful" in stdout:
                    self.connected = True
                    return True
                    
            elif self.platform == "Darwin":
                # For macOS, we'll assume the printer is already paired
                # macOS doesn't have a reliable CLI for connecting to Bluetooth devices
                self.connected = True
                return True
                
            elif self.platform == "Windows":
                # For Windows, we'll assume the printer is already paired
                # Windows doesn't have a reliable CLI for connecting to Bluetooth devices
                self.connected = True
                return True
                
        except Exception as e:
            print(f"Error connecting to printer: {e}")
            
        return False
    
    def print_image(self, image_path: str) -> bool:
        """Print an image to the NIIMBOT printer.
        
        Args:
            image_path: Path to the image file
            
        Returns:
            True if printing was successful, False otherwise
        """
        # Validate image file
        if not os.path.exists(image_path):
            print(f"Image file not found: {image_path}")
            return False
            
        # Try to connect if not already connected
        if not self.connected and not self.connect():
            print("Could not connect to printer")
            return False
            
        # For direct printing, we need to use the niimprint Python library
        # This is now included in the vaultkeeper repository
        try:
            # Use built-in niimprint script
            niimprint_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                "niimprint"
            )
            
            # Construct the command based on printer type
            label_width = "30mm" if self.printer_type == PRINTER_D101 else "50mm"
            
            cmd = [
                "python", "-m", "niimprint",
                image_path,
                "-m", "print",
                "-w", label_width
            ]
            
            if self.device_id:
                cmd.extend(["-d", self.device_id])
                
            # Run in the niimprint directory
            original_dir = os.getcwd()
            os.chdir(niimprint_path)
            
            try:
                stdout, stderr, returncode = run_command(cmd)
                
                if returncode == 0:
                    print(f"Successfully printed {image_path}")
                    return True
                else:
                    print(f"Printing failed: {stderr}")
                    return False
            finally:
                os.chdir(original_dir)
                
        except Exception as e:
            print(f"Error printing image: {e}")
            return False
    
    def print_batch(self, image_paths: List[str]) -> Tuple[int, int]:
        """Print multiple images in a batch.
        
        Args:
            image_paths: List of paths to images
            
        Returns:
            Tuple of (success_count, total_count)
        """
        success_count = 0
        total_count = len(image_paths)
        
        for path in image_paths:
            if self.print_image(path):
                success_count += 1
                
        return success_count, total_count


def run_command(cmd: List[str]) -> Tuple[str, str, int]:
    """Run a command and return stdout, stderr, and return code.
    
    Args:
        cmd: Command as a list of strings
        
    Returns:
        Tuple of (stdout, stderr, return_code)
    """
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.stdout, result.stderr, result.returncode
    except Exception as e:
        return "", str(e), 1


def print_label(image_path: str, printer_type: str = PRINTER_B1, device_id: Optional[str] = None) -> bool:
    """Print a label to a NIIMBOT printer.
    
    Args:
        image_path: Path to the image file
        printer_type: Printer type (b1 or d101)
        device_id: Optional specific device ID
        
    Returns:
        True if printing was successful, False otherwise
    """
    try:
        printer = NiimbotPrinter(printer_type, device_id)
        return printer.print_image(image_path)
    except Exception as e:
        print(f"Error printing label: {e}")
        return False


def print_labels(image_paths: List[str], printer_type: str = PRINTER_B1, 
                device_id: Optional[str] = None) -> Tuple[int, int]:
    """Print multiple labels to a NIIMBOT printer.
    
    Args:
        image_paths: List of paths to image files
        printer_type: Printer type (b1 or d101)
        device_id: Optional specific device ID
        
    Returns:
        Tuple of (success_count, total_count)
    """
    try:
        printer = NiimbotPrinter(printer_type, device_id)
        return printer.print_batch(image_paths)
    except Exception as e:
        print(f"Error printing labels: {e}")
        return 0, len(image_paths)