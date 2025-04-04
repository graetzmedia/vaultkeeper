"""
Barcode and QR code scanner integration for VaultKeeper.

This module provides functionality for working with the Eyoyo barcode scanner.
"""

import json
import os
import platform
import threading
import time
from typing import Any, Callable, Dict, Optional

# Default device paths
EYOYO_DEVICE_PATHS = {
    "Linux": "/dev/input/by-id/usb-EYOYO_KEYBOARD_Scanner-event-kbd",
    "Darwin": "/dev/input/eyoyo-scanner",
    "Windows": "COM3",  # Default COM port, may vary
}


class ScannedCodeHandler:
    """Handler for processing scanned QR/barcodes."""
    
    def __init__(self, callback: Callable[[str], None]):
        """Initialize the handler.
        
        Args:
            callback: Function to call when a code is scanned
        """
        self.callback = callback
        self.listening = False
        self.listen_thread = None
        self.platform = platform.system()
        self.device_path = self._get_default_device_path()
        
    def _get_default_device_path(self) -> str:
        """Get the default device path for the current platform.
        
        Returns:
            Default device path
        """
        return EYOYO_DEVICE_PATHS.get(self.platform, "")
        
    def start_listening(self, device_path: Optional[str] = None) -> bool:
        """Start listening for scanned codes.
        
        Args:
            device_path: Optional device path to override default
            
        Returns:
            True if listening started, False otherwise
        """
        if device_path:
            self.device_path = device_path
            
        if not self.device_path:
            print("No device path specified")
            return False
            
        if self.listening:
            print("Already listening")
            return True
            
        # Start listening in a separate thread
        self.listening = True
        self.listen_thread = threading.Thread(target=self._listen_loop)
        self.listen_thread.daemon = True
        self.listen_thread.start()
        
        return True
        
    def stop_listening(self) -> None:
        """Stop listening for scanned codes."""
        self.listening = False
        if self.listen_thread:
            self.listen_thread.join(timeout=1)
            
    def _listen_loop(self) -> None:
        """Main listening loop."""
        if self.platform == "Linux":
            self._listen_linux()
        elif self.platform == "Darwin":
            self._listen_macos()
        elif self.platform == "Windows":
            self._listen_windows()
        else:
            print(f"Unsupported platform: {self.platform}")
            
    def _listen_linux(self) -> None:
        """Listen for scanned codes on Linux."""
        try:
            from evdev import InputDevice, categorize, ecodes
            
            # Check if device exists
            if not os.path.exists(self.device_path):
                print(f"Device not found: {self.device_path}")
                return
                
            device = InputDevice(self.device_path)
            scanned_code = ""
            shift_pressed = False
            
            # Mapping for key codes to characters
            key_mapping = {
                ecodes.KEY_0: "0", ecodes.KEY_1: "1", ecodes.KEY_2: "2",
                ecodes.KEY_3: "3", ecodes.KEY_4: "4", ecodes.KEY_5: "5",
                ecodes.KEY_6: "6", ecodes.KEY_7: "7", ecodes.KEY_8: "8",
                ecodes.KEY_9: "9", ecodes.KEY_A: "a", ecodes.KEY_B: "b",
                ecodes.KEY_C: "c", ecodes.KEY_D: "d", ecodes.KEY_E: "e",
                ecodes.KEY_F: "f", ecodes.KEY_G: "g", ecodes.KEY_H: "h",
                ecodes.KEY_I: "i", ecodes.KEY_J: "j", ecodes.KEY_K: "k",
                ecodes.KEY_L: "l", ecodes.KEY_M: "m", ecodes.KEY_N: "n",
                ecodes.KEY_O: "o", ecodes.KEY_P: "p", ecodes.KEY_Q: "q",
                ecodes.KEY_R: "r", ecodes.KEY_S: "s", ecodes.KEY_T: "t",
                ecodes.KEY_U: "u", ecodes.KEY_V: "v", ecodes.KEY_W: "w",
                ecodes.KEY_X: "x", ecodes.KEY_Y: "y", ecodes.KEY_Z: "z",
                ecodes.KEY_MINUS: "-", ecodes.KEY_EQUAL: "=", ecodes.KEY_SEMICOLON: ";",
                ecodes.KEY_APOSTROPHE: "'", ecodes.KEY_GRAVE: "`", ecodes.KEY_BACKSLASH: "\\",
                ecodes.KEY_COMMA: ",", ecodes.KEY_DOT: ".", ecodes.KEY_SLASH: "/",
                ecodes.KEY_SPACE: " ", ecodes.KEY_TAB: "\t"
            }
            
            # Mapping for shifted keys
            shift_mapping = {
                ecodes.KEY_0: ")", ecodes.KEY_1: "!", ecodes.KEY_2: "@",
                ecodes.KEY_3: "#", ecodes.KEY_4: "$", ecodes.KEY_5: "%",
                ecodes.KEY_6: "^", ecodes.KEY_7: "&", ecodes.KEY_8: "*",
                ecodes.KEY_9: "(", ecodes.KEY_MINUS: "_", ecodes.KEY_EQUAL: "+",
                ecodes.KEY_SEMICOLON: ":", ecodes.KEY_APOSTROPHE: "\"",
                ecodes.KEY_GRAVE: "~", ecodes.KEY_BACKSLASH: "|",
                ecodes.KEY_COMMA: "<", ecodes.KEY_DOT: ">", ecodes.KEY_SLASH: "?"
            }
            
            # Main event loop
            for event in device.read_loop():
                if not self.listening:
                    break
                    
                if event.type == ecodes.EV_KEY:
                    key_event = categorize(event)
                    
                    # Handle shift key
                    if key_event.keycode in ["KEY_LEFTSHIFT", "KEY_RIGHTSHIFT"]:
                        shift_pressed = key_event.keystate == key_event.key_down
                        
                    # Handle key down events
                    elif key_event.keystate == key_event.key_down:
                        key_code = key_event.keycode
                        if isinstance(key_code, list):
                            key_code = key_code[0]
                            
                        # Get the key code as int
                        if isinstance(key_code, str) and key_code.startswith("KEY_"):
                            key_attr = getattr(ecodes, key_code, None)
                            if key_attr is not None:
                                key_code = key_attr
                                
                        # Handle enter key (end of scan)
                        if key_code == ecodes.KEY_ENTER and scanned_code:
                            try:
                                self.callback(scanned_code)
                            except Exception as e:
                                print(f"Error processing scanned code: {e}")
                            scanned_code = ""
                            
                        # Handle other keys
                        elif key_code in key_mapping:
                            if shift_pressed and key_code in shift_mapping:
                                scanned_code += shift_mapping[key_code]
                            else:
                                scanned_code += key_mapping[key_code]
                                
        except ImportError:
            print("evdev module not found. Please install with: pip install evdev")
        except Exception as e:
            print(f"Error listening for scanned codes: {e}")
            
    def _listen_macos(self) -> None:
        """Listen for scanned codes on macOS."""
        # macOS doesn't have a direct way to read from HID devices without extra drivers
        # For macOS, we recommend using a virtual serial port or a custom app
        print("Direct scanner input on macOS is not supported.")
        print("Please configure the scanner in HID keyboard mode.")
        
    def _listen_windows(self) -> None:
        """Listen for scanned codes on Windows."""
        try:
            import serial
            
            # Try to open the serial port
            ser = serial.Serial(self.device_path, 9600, timeout=1)
            scanned_code = ""
            
            while self.listening:
                if ser.in_waiting > 0:
                    # Read a byte
                    byte = ser.read(1)
                    
                    # Convert to character
                    char = byte.decode('utf-8', errors='ignore')
                    
                    # Handle newline/carriage return (end of scan)
                    if char in ['\r', '\n']:
                        if scanned_code:
                            try:
                                self.callback(scanned_code)
                            except Exception as e:
                                print(f"Error processing scanned code: {e}")
                            scanned_code = ""
                    else:
                        scanned_code += char
                        
                # Short sleep to prevent CPU hogging
                time.sleep(0.01)
                
            # Clean up
            ser.close()
            
        except ImportError:
            print("pyserial module not found. Please install with: pip install pyserial")
        except Exception as e:
            print(f"Error listening for scanned codes: {e}")
            print("Please configure the scanner in HID keyboard mode or virtual COM port mode.")


class QRCodeProcessor:
    """Processor for QR codes used by VaultKeeper."""
    
    def __init__(self, on_drive_scanned: Optional[Callable[[Dict[str, Any]], None]] = None,
                 on_location_scanned: Optional[Callable[[Dict[str, Any]], None]] = None):
        """Initialize the processor.
        
        Args:
            on_drive_scanned: Function to call when a drive QR code is scanned
            on_location_scanned: Function to call when a location QR code is scanned
        """
        self.on_drive_scanned = on_drive_scanned
        self.on_location_scanned = on_location_scanned
        
    def process_code(self, code: str) -> Optional[Dict[str, Any]]:
        """Process a scanned QR code.
        
        Args:
            code: Scanned QR code content
            
        Returns:
            Parsed QR code data or None if invalid
        """
        # Try to parse as JSON
        try:
            data = json.loads(code)
            
            # Check if it's a VaultKeeper QR code
            if isinstance(data, dict) and "type" in data:
                # Handle different QR code types
                if data["type"] == "drive" and self.on_drive_scanned:
                    self.on_drive_scanned(data)
                    return data
                elif data["type"] == "location" and self.on_location_scanned:
                    self.on_location_scanned(data)
                    return data
                return data
        except json.JSONDecodeError:
            # Not a JSON QR code
            pass
        except Exception as e:
            print(f"Error processing QR code: {e}")
            
        return None


def setup_scanner(on_drive_scanned: Optional[Callable[[Dict[str, Any]], None]] = None,
                 on_location_scanned: Optional[Callable[[Dict[str, Any]], None]] = None,
                 device_path: Optional[str] = None) -> ScannedCodeHandler:
    """Set up a scanner handler with callbacks for VaultKeeper QR codes.
    
    Args:
        on_drive_scanned: Function to call when a drive QR code is scanned
        on_location_scanned: Function to call when a location QR code is scanned
        device_path: Optional device path for the scanner
        
    Returns:
        ScannedCodeHandler instance
    """
    # Create QR code processor
    processor = QRCodeProcessor(on_drive_scanned, on_location_scanned)
    
    # Create scanner handler
    handler = ScannedCodeHandler(processor.process_code)
    
    # Start listening
    if device_path:
        handler.start_listening(device_path)
    else:
        handler.start_listening()
        
    return handler