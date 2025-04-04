#!/bin/bash
# VaultKeeper installation script

set -e

# Check if running as root and get sudo if needed
if [ "$EUID" -ne 0 ]; then
  echo "Some operations require root privileges."
  echo "You may be prompted for your password."
fi

# Determine OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$NAME
elif [ -f /etc/lsb-release ]; then
  . /etc/lsb-release
  OS=$DISTRIB_ID
elif [ "$(uname)" == "Darwin" ]; then
  OS="macOS"
else
  OS="Unknown"
fi

echo "Detected OS: $OS"

# Function to install system dependencies
install_system_deps() {
  echo "Installing system dependencies..."
  
  if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv ffmpeg \
      sqlite3 libsqlite3-dev libbluetooth-dev libevdev2 \
      smartmontools hdparm fio hddtemp lm-sensors
      
  elif [[ "$OS" == *"Fedora"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
    sudo dnf install -y python3 python3-pip ffmpeg \
      sqlite sqlite-devel bluez-libs libevdev \
      smartmontools hdparm fio hddtemp lm_sensors
      
  elif [[ "$OS" == "macOS" ]]; then
    if ! command -v brew &> /dev/null; then
      echo "Homebrew not found. Please install Homebrew first:"
      echo "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      exit 1
    fi
    
    brew install python ffmpeg sqlite smartmontools hdparm fio
    
  else
    echo "Unsupported OS: $OS"
    echo "Please install the required dependencies manually:"
    echo "- Python 3.8+"
    echo "- pip"
    echo "- ffmpeg"
    echo "- sqlite3"
    echo "- smartmontools (smartctl)"
    echo "- hdparm"
    echo "- fio"
    echo "- hddtemp"
    exit 1
  fi
  
  echo "System dependencies installed."
}

# Create virtual environment
create_venv() {
  echo "Creating Python virtual environment..."
  
  # Determine installation directory
  INSTALL_DIR="$HOME/.vaultkeeper"
  mkdir -p "$INSTALL_DIR"
  
  # Create virtual environment
  python3 -m venv "$INSTALL_DIR/venv"
  
  echo "Virtual environment created at $INSTALL_DIR/venv"
}

# Install Python packages
install_python_deps() {
  echo "Installing Python dependencies..."
  
  # Activate virtual environment
  source "$HOME/.vaultkeeper/venv/bin/activate"
  
  # Install packages
  pip install --upgrade pip
  pip install -e .
  
  if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
    pip install evdev
  fi
  
  echo "Python dependencies installed."
}

# Create directories
create_dirs() {
  echo "Creating directories..."
  
  mkdir -p "$HOME/.vaultkeeper/data"
  mkdir -p "$HOME/.vaultkeeper/labels"
  mkdir -p "$HOME/.vaultkeeper/thumbnails"
  
  echo "Directories created."
}

# Create symlinks
create_symlinks() {
  echo "Creating symlinks..."
  
  mkdir -p "$HOME/.local/bin"
  
  # Create symlink to the CLI script
  ln -sf "$HOME/.vaultkeeper/venv/bin/vaultkeeper" "$HOME/.local/bin/vaultkeeper"
  
  echo "Symlinks created."
  echo "Make sure $HOME/.local/bin is in your PATH."
  
  # Check if .local/bin is in PATH
  if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo "Adding $HOME/.local/bin to PATH in .bashrc"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    
    # Also add to .zshrc if it exists
    if [ -f "$HOME/.zshrc" ]; then
      echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
    fi
  fi
}

# Set up udev rules for NIIMBOT printer on Linux
setup_udev_rules() {
  if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]] || [[ "$OS" == *"Fedora"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
    echo "Setting up udev rules for NIIMBOT printer..."
    
    # Create udev rules
    echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="0416", ATTRS{idProduct}=="5011", MODE="0666", GROUP="plugdev"' | sudo tee /etc/udev/rules.d/99-niimbot.rules > /dev/null
    
    # Create udev rules for Eyoyo scanner
    echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="0c2e", ATTRS{idProduct}=="0eef", MODE="0666", GROUP="plugdev"' | sudo tee /etc/udev/rules.d/99-eyoyo-scanner.rules > /dev/null
    
    # Reload udev rules
    sudo udevadm control --reload-rules
    sudo udevadm trigger
    
    echo "udev rules set up."
  fi
}

# Initialize database
init_database() {
  echo "Initializing database..."
  
  # Activate virtual environment
  source "$HOME/.vaultkeeper/venv/bin/activate"
  
  # Run database initialization
  python -c "from vaultkeeper.core.models import init_db; init_db('$HOME/.vaultkeeper/data/vaultkeeper.db')"
  
  echo "Database initialized."
}

# Main installation
echo "Starting VaultKeeper installation..."

install_system_deps
create_venv
install_python_deps
create_dirs
create_symlinks
setup_udev_rules
init_database

echo ""
echo "VaultKeeper installation complete!"
echo ""
echo "To start using VaultKeeper, open a new terminal and run:"
echo "vaultkeeper --help"
echo ""
echo "For more information, see the documentation at:"
echo "https://github.com/yourusername/vaultkeeper"