#\!/bin/bash
# VaultKeeper environment activation script

# Set this to the absolute path where VaultKeeper is installed
VAULTKEEPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Activate virtual environment if it exists
if [ -d "$VAULTKEEPER_DIR/.venv" ]; then
    echo "Activating virtual environment..."
    source "$VAULTKEEPER_DIR/.venv/bin/activate"
    
    # Check for required packages
    if \! python -c "import whisper" &> /dev/null; then
        echo "Whisper not found, installing dependencies..."
        pip install openai-whisper
    fi
else
    echo "Error: Virtual environment not found. Please run setup first."
    exit 1
fi

# Run the asset tracker
python "$VAULTKEEPER_DIR/scripts/utils/asset-tracker.py" "$@"
