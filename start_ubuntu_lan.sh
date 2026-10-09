#!/usr/bin/env bash
# ACJM Court App - Ubuntu LAN Server - START script
#
# Run this every time you want to start the server.
# Keep this terminal window open while client PCs are using the app.
#
# Usage:
#   chmod +x start_ubuntu_lan.sh
#   ./start_ubuntu_lan.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
VENV_DIR="$APP_DIR/.venv"
PORT="${PORT:-8000}"
HOST="0.0.0.0"

if [ ! -d "$VENV_DIR" ]; then
  echo "Virtual environment not found."
  echo "Run ./install_ubuntu_lan.sh first."
  exit 1
fi

# Detect this PC's LAN IP address for the on-screen banner
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "${SERVER_IP:-}" ]; then
  SERVER_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')"
fi

echo "=============================================="
echo " ACJM Court App - Ubuntu LAN Server"
echo "=============================================="
echo
echo "On THIS server PC, open:"
echo "  http://127.0.0.1"
echo
if [ -n "${SERVER_IP:-}" ]; then
  echo "On CLIENT PCs (same LAN/WiFi), open a browser and go to:"
  echo "  http://${SERVER_IP}"
  echo
  echo "(No installation needed on client PCs - browser only.)"
else
  echo "Could not detect this PC's LAN IP automatically."
  echo "Run 'hostname -I' to find it, then open http://<that-ip> on client PCs."
fi
echo
echo "Admin password:      ahmedabad@2026"
echo "Default staff login: Staff / Staff@123"
echo
echo "Keep this terminal window open while client PCs are using the app."
echo "Press CTRL+C to stop the server."
echo "=============================================="
echo

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

if [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_DIR/.env"
  set +a
fi

# Free the port if a previous run is still using it
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
  existing_pid="$(lsof -ti tcp:"$PORT" || true)"
  if [ -n "$existing_pid" ]; then
    kill -9 $existing_pid >/dev/null 2>&1 || true
  fi
fi

# Make sure Nginx (if installed) is running so http://SERVER-IP works without a port
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^nginx.service'; then
  sudo systemctl restart nginx >/dev/null 2>&1 || true
fi

cd "$BACKEND_DIR"
exec python -m uvicorn server:app --host "$HOST" --port "$PORT"
