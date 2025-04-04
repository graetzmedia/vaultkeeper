#!/bin/bash
# VaultKeeper CLI wrapper

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/.venv/bin/activate"
python "$SCRIPT_DIR/scripts/utils/asset-tracker.py" "$@"