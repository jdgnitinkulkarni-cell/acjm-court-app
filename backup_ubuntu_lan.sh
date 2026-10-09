#!/usr/bin/env bash
# ACJM Court App - Ubuntu LAN Server - BACKUP script
#
# Makes a timestamped copy of the app's data file (all courts, staff, pleas,
# applications, pursis, surety bonds, laws, complainants, etc.) into a
# "backups" folder. Run this regularly, and especially before any update.
#
# Usage:
#   chmod +x backup_ubuntu_lan.sh
#   ./backup_ubuntu_lan.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_FILE="$APP_DIR/backend/local_data.json"
BACKUP_DIR="$APP_DIR/backups"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"

if [ ! -f "$DATA_FILE" ]; then
  echo "No data file found at: $DATA_FILE"
  echo "Nothing to back up yet."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
DEST="$BACKUP_DIR/local_data_${TIMESTAMP}.json"
cp -p "$DATA_FILE" "$DEST"

echo "Backup created:"
echo "  $DEST"
echo
echo "All backups in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"
