#!/usr/bin/env python3
"""
CSV to XLSX converter script using pandas.
"""

import os
import sys
import io
import pandas as pd

def convert_csv_to_xlsx(csv_data, delimiter=","):
    """
    Convert CSV data to XLSX format using pandas.
    
    Args:
        csv_data (str): CSV content as a string
        delimiter (str): CSV delimiter character
        
    Returns:
        bytes: The XLSX file content as bytes
    """
    try:
        # Read CSV data into a pandas DataFrame
        df = pd.read_csv(io.StringIO(csv_data), delimiter=delimiter)
        
        # Create an in-memory Excel writer
        output = io.BytesIO()
        
        # Write the data to an Excel file
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Sheet1', index=False)
        
        # Get the Excel file content
        output.seek(0)
        return output.getvalue()
        
    except Exception as e:
        sys.stderr.write(f"Error converting CSV to XLSX: {str(e)}")
        return None

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