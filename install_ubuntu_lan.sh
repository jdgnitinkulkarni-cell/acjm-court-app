#!/usr/bin/env bash
# ACJM Court App - Ubuntu LAN Server - INSTALL script
#
# Run this ONCE on the Ubuntu PC that will act as the server.
# It installs only what this app already needs:
#   - Python 3 (backend: FastAPI + reportlab)
#   - the bundled Gujarati font (already included in backend/fonts, plus a
#     system fallback package)
#   - a Chromium-based browser, used headless by the backend to print the
#     exact same HTML/CSS document layouts that Microsoft Edge/Chrome
#     produced on the Windows version (this is what keeps PDF margins,
#     fonts, spacing and Gujarati/English text pixel-identical). If this
#     step cannot complete (e.g. no internet on this PC), the app still
#     runs and falls back to a simplified PDF layout automatically.
#   - Nginx, only so client PCs can use the plain address http://SERVER-IP
#     with no port number
#
# The React frontend is already built (frontend/build), so Node.js is NOT
# required on the server.
#
# Usage:
#   chmod +x install_ubuntu_lan.sh
#   ./install_ubuntu_lan.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
VENV_DIR="$APP_DIR/.venv"

echo "=============================================="
echo " ACJM Court App - Ubuntu LAN - Install"
echo "=============================================="
echo

echo "[1/6] Installing system packages (python3, venv, pip, Gujarati font, nginx)..."
# Some networks (this court LAN included) block security.ubuntu.com and/or
# dl.google.com. A leftover Google Chrome apt source from a previous run can
# also permanently break "apt update" once it can't be reached. Remove it
# so it's never queried again.
sudo rm -f /etc/apt/sources.list.d/google-chrome.list
# Don't let a blocked/broken repo abort the whole install: apt update
# reports an error for any repo it can't reach, but as long as the main
# Ubuntu repos (archive.ubuntu.com) are reachable - which is all this app
# actually needs - "apt install" below still works fine.
sudo apt update || echo "(Some repositories could not be reached - continuing anyway, the packages needed below don't require them.)"
sudo apt install -y python3 python3-venv python3-pip fonts-lohit-gujr nginx wget

echo
echo "[2/6] Creating Python virtual environment..."
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
else
  echo "Virtual environment already exists, skipping creation."
fi

echo
echo "[3/6] Installing backend Python requirements (FastAPI, uvicorn, reportlab)..."
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$BACKEND_DIR/requirements.txt"
deactivate

echo
echo "[4/6] Installing a Chromium-based browser for exact PDF/print layouts..."
if command -v google-chrome-stable >/dev/null 2>&1 || command -v google-chrome >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1; then
  echo "A Chromium-based browser is already installed, skipping."
else
  TMP_DEB="$(mktemp --suffix=.deb)"
  if wget -q --timeout=10 --tries=1 -O "$TMP_DEB" "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"; then
    sudo apt install -y "$TMP_DEB" || echo "Google Chrome install failed, trying Chromium instead..."
  fi
  rm -f "$TMP_DEB"
  if ! command -v google-chrome-stable >/dev/null 2>&1 && ! command -v google-chrome >/dev/null 2>&1; then
    sudo apt install -y chromium-browser 2>/dev/null || sudo apt install -y chromium 2>/dev/null || sudo snap install chromium 2>/dev/null || true
  fi
fi
if command -v google-chrome-stable >/dev/null 2>&1 || command -v google-chrome >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1; then
  echo "Browser install OK. Exact print/PDF layouts will be used."
else
  echo "WARNING: Could not install a browser automatically (no internet access?)."
  echo "The app will still run, but PDFs will use a simplified fallback layout"
  echo "instead of the exact Windows print layout, until a browser is installed."
  echo "You can install one later and re-run this script, e.g.:"
  echo "  sudo apt install -y chromium-browser"
fi

echo
echo "[5/6] Configuring Nginx so client PCs can use the plain address http://SERVER-IP (no port needed)..."
NGINX_CONF="/etc/nginx/sites-available/acjm-court-app"
sudo tee "$NGINX_CONF" > /dev/null << NGINX_EOF
server {
    listen 80;
    listen [::]:80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_EOF

sudo rm -f