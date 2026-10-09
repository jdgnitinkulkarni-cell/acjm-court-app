#!/usr/bin/env bash
# ACJM Court App - Ubuntu LAN Server - AUTOSTART setup
#
# Run this ONCE (after install_ubuntu_lan.sh has already been run once
# successfully, i.e. the .venv folder exists). It removes the need to ever
# run install_ubuntu_lan.sh or start_ubuntu_lan.sh manually again:
#
#   - Creates a systemd service ("acjm-backend") that starts the backend
#     automatically every time the server PC boots or reboots, and
#     restarts it automatically if it ever crashes.
#   - Nginx is already set to auto-start on boot from install_ubuntu_lan.sh.
#   - Allows the desktop shortcut (see create_desktop_shortcut.sh) to
#     restart the service without a password prompt.
#
# After running this once, the app is available at http://SERVER-IP as
# soon as the server PC finishes booting - no terminal, no scripts, no
# daily reinstall.
#
# Usage:
#   chmod +x setup_autostart.sh
#   ./setup_autostart.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
VENV_DIR="$APP_DIR/.venv"
RUN_USER="$(whoami)"
PORT="${PORT:-8000}"

echo "=============================================="
echo " ACJM Court App - Autostart Setup"
echo "=============================================="
echo

if [ ! -d "$VENV_DIR" ]; then
  echo "ERROR: $VENV_DIR not found."
  echo "Run ./install_ubuntu_lan.sh once first, then re-run this script."
  exit 1
fi

echo "[1/3] Creating systemd service (acjm-backend)..."
SERVICE_FILE="/etc/systemd/system/acjm-backend.service"
sudo tee "$SERVICE_FILE" > /dev/null << SERVICE_EOF
[Unit]
Description=ACJM Court App backend (FastAPI/uvicorn)
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=-${BACKEND_DIR}/.env
ExecStart=${VENV_DIR}/bin/python -m uvicorn server:app --host 0.0.0.0 --port ${PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo systemctl daemon-reload
sudo systemctl enable acjm-backend
sudo systemctl restart acjm-backend
sudo systemctl enable nginx >/dev/null 2>&1 || true
sudo systemctl restart nginx

echo
echo "[2/3] Allowing the desktop shortcut to restart the app without a password prompt..."
SUDOERS_FILE="/etc/sudoers.d/acjm-court-app"
sudo tee "$SUDOERS_FILE" > /dev/null << SUDOERS_EOF
${RUN_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart acjm-backend, /usr/bin/systemctl restart nginx, /usr/bin/systemctl start acjm-backend, /usr/bin/systemctl start nginx, /usr/bin/systemctl status acjm-backend, /usr/bin/systemctl status nginx
SUDOERS_EOF
sudo chmod 440 "$SUDOERS_FILE"
sudo visudo -cf "$SUDOERS_FILE" >/dev/null

echo
echo "[3/3] Checking status..."
sleep 1
sudo systemctl --no-pager status acjm-backend | head -8

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "=============================================="
echo " Autostart is now configured."
echo
echo " The app will start automatically every time this PC boots."
echo " You do NOT need to run install_ubuntu_lan.sh or start_ubuntu_lan.sh"
echo " again - just leave the PC on, or turn it on each morning."
echo
echo " Open now at:  http://127.0.0.1  (on this PC)"
if [ -n "${SERVER_IP:-}" ]; then
echo "               http://${SERVER_IP}  (on client PCs)"
fi
echo
echo " Useful commands:"
echo "   sudo systemctl status acjm-backend    # is it running?"
echo "   sudo systemctl restart acjm-backend   # manually restart"
echo "   journalctl -u acjm-backend -f         # live backend logs"
echo "=============================================="
