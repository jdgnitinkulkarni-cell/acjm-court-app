#!/usr/bin/env bash
# ACJM Court App - Ubuntu LAN Server - UPDATE script
#
# Use this every time you receive a NEW version of the app (new frontend
# build, updated backend code, etc.) instead of deleting the live folder
# and reinstalling from scratch. It copies the new files IN, while always
# protecting:
#   - backend/local_data.json   (all courts/staff/pleas/applications data)
#   - .venv/                    (already-installed Python packages)
#   - backups/                  (your data backups)
#
# It also takes a fresh backup automatically before touching anything,
# reinstalls Python packages only if requirements.txt actually changed,
# and restarts the running service (or tells you how to if you're not
# using the systemd service yet).
#
# Usage:
#   1. Get the new version onto this PC and unzip it somewhere, e.g.:
#        unzip ~/Downloads/ACJM-Court-App-Ubuntu-LAN-v2.zip -d ~/acjm-update
#      (the unzipped folder should look the same as this one: it should
#      contain a "backend" folder and a "frontend" folder)
#   2. Run:
#        ./update_ubuntu_lan.sh ~/acjm-update/ACJM-Court-App-Ubuntu-LAN
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${1:-}"

if [ -z "$SOURCE_DIR" ]; then
  echo "Usage: ./update_ubuntu_lan.sh /path/to/new/ACJM-Court-App-Ubuntu-LAN"
  echo
  echo "That path should be the unzipped folder of the new version you were"
  echo "given - it should contain a 'backend' folder and a 'frontend' folder."
  exit 1
fi
SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd)"

if [ ! -d "$SOURCE_DIR/backend" ] || [ ! -d "$SOURCE_DIR/frontend" ]; then
  echo "ERROR: $SOURCE_DIR doesn't look like an ACJM Court App folder"
  echo "(expected a 'backend' and a 'frontend' subfolder in there)."
  exit 1
fi

if [ "$SOURCE_DIR" = "$APP_DIR" ]; then
  echo "ERROR: source and live app folder are the same path. Unzip the new"
  echo "version somewhere else first (e.g. ~/acjm-update), then re-run."
  exit 1
fi

echo "=============================================="
echo " ACJM Court App - Update"
echo "   Live app:  $APP_DIR"
echo "   New files: $SOURCE_DIR"
echo "=============================================="
echo

echo "[1/5] Backing up current data before touching anything..."
if [ -x "$APP_DIR/backup_ubuntu_lan.sh" ]; then
  "$APP_DIR/backup_ubuntu_lan.sh" || true
else
  mkdir -p "$APP_DIR/backups"
  cp -p "$APP_DIR/backend/local_data.json" \
    "$APP_DIR/backups/local_data_$(date +%Y-%m-%d_%H-%M-%S)_pre_update.json" 2>/dev/null || true
fi

REQ_HASH_BEFORE="$(md5sum "$APP_DIR/backend/requirements.txt" 2>/dev/null | awk '{print $1}')"

echo
echo "[2/5] Copying in the new files (data, backups and installed packages are protected)..."
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude 'backend/local_data.json' \
    --exclude 'backend/.env' \
    --exclude '.venv/' \
    --exclude 'backups/' \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    "$SOURCE_DIR"/ "$APP_DIR"/
else
  echo "rsync not found, installing it (one-time, no internet needed beyond this)..."
  sudo apt install -y rsync
  rsync -a --delete \
    --exclude 'backend/local_data.json' \
    --exclude 'backend/.env' \
    --exclude '.venv/' \
    --exclude 'backups/' \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    "$SOURCE_DIR"/ "$APP_DIR"/
fi

echo
echo "[3/5] Checking whether Python dependencies changed..."
REQ_HASH_AFTER="$(md5sum "$APP_DIR/backend/requirements.txt" 2>/dev/null | awk '{print $1}')"
if [ -d "$APP_DIR/.venv" ] && [ "$REQ_HASH_BEFORE" != "$REQ_HASH_AFTER" ]; then
  echo "requirements.txt changed - updating packages..."
  # shellcheck disable=SC1091
  source "$APP_DIR/.venv/bin/activate"
  python -m pip install -r "$APP_DIR/backend/requirements.txt"
  deactivate
else
  echo "No change to requirements.txt - skipping."
fi

echo
echo "[4/5] Restarting the app..."
if systemctl list-unit-files 2>/dev/null | grep -q '^acjm-backend.service'; then
  sudo systemctl restart acjm-backend
  sudo systemctl restart nginx >/dev/null 2>&1 || true
  echo "Restarted via systemd (acjm-backend)."
else
  echo "Autostart isn't set up yet (see setup_autostart.sh)."
  echo "Stop any running start_ubuntu_lan.sh (Ctrl+C) and run it again to pick up the update."
fi

echo
echo "[5/5] Done."
echo "=============================================="
echo " Update applied. Your data (backend/local_data.json) was not touched."
echo " A safety backup was saved into: $APP_DIR/backups/"
echo "=============================================="
