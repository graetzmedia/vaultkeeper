#!/usr/bin/env python3
"""
CSV to XLSX converter script that uses the Go csv2xlsx tool.
"""

import os
import sys
import tempfile
import subprocess
from pathlib import Path

# Get the path to the csv2xlsx binary
SCRIPT_DIR = Path(__file__).parent.absolute()
CSV2XLSX_BIN = SCRIPT_DIR / "csv2xlsx"

def convert_csv_to_xlsx(csv_data, delimiter=","):
    """
    Convert CSV data to XLSX format using the csv2xlsx Go tool.
    
    Args:
        csv_data (str): CSV content as a string
        delimiter (str): CSV delimiter character
        
    Returns:
        bytes: The XLSX file content as bytes
    """
    # Create temporary files for input and output
    debug_dir = Path(SCRIPT_DIR) / "debug"
    debug_dir.mkdir(exist_ok=True)
    debug_csv = debug_dir / "debug_input.csv"
    
    # Log the CSV data for debugging
    with open(debug_csv, 'w') as f:
        f.write(csv_data)
    
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as temp_csv:
        temp_csv_path = temp_csv.name
        temp_csv.write(csv_data.encode('utf-8'))
    
    temp_xlsx_path = temp_csv_path.replace('.csv', '.xlsx')
    debug_xlsx = debug_dir / "debug_output.xlsx"
    
    try:
        # Run the csv2xlsx tool
        cmd = [
            str(CSV2XLSX_BIN),
            "-f", temp_csv_path,
            "-o", temp_xlsx_path,
            "-d", delimiter
        ]
        
        # Log the command for debugging
        with open(debug_dir / "debug_cmd.log", 'w') as f:
            f.write(' '.join(cmd))
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Log the command output
        with open(debug_dir / "debug_output.log", 'w') as f:
            f.write(f"Return code: {result.returncode}\n")
            f.write(f"Stdout: {result.stdout}\n")
            f.write(f"Stderr: {result.stderr}\n")
        
        if result.returncode != 0:
            sys.stderr.write(f"Error running csv2xlsx: {result.stderr}")
            return None
            
        # Read the resulting XLSX file
        with open(temp_xlsx_path, 'rb') as xlsx_file:
            xlsx_data = xlsx_file.read()
        
        # Copy the XLSX file for debugging
        with open(debug_xlsx, 'wb') as f:
            f.write(xlsx_data)
            
        return xlsx_data
        
    except Exception as e:
        sys.stderr.write(f"Exception during conversion: {str(e)}")
        return None
        
    finally:
        # Clean up temporary files
        if os.path.exists(temp_csv_path):
            os.unlink(temp_csv_path)
        if os.path.exists(temp_xlsx_path):
            os.unlink(temp_xlsx_path)

if __name__ == "__main__":
    # Simple command-line interface for testing
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input.csv> <output.xlsx> [delimiter]")
        sys.exit(1)
        
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    delimiter = sys.argv[3] if len(sys.argv) > 3 else ","
    
    with open(input_file, 'r') as f:
        csv_data = f.read()
    
    xlsx_data = convert_csv_to_xlsx(csv_data, delimiter)
    
    if xlsx_data:
        with open(output_file, 'wb') as f:
            f.write(xlsx_data)
        print(f"Conversion successful. Output saved to {output_file}")
    else:
        print("Conversion failed.")
        sys.exit(1)