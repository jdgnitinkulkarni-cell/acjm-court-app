#!/usr/bin/env bash
set -uo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if systemctl list-unit-files 2>/dev/null | grep -q '^acjm-backend.service'; then
  sudo -n systemctl restart acjm-backend nginx 2>/dev/null \
    || sudo systemctl restart acjm-backend nginx
else
  # Autostart not set up yet - fall back to running it directly in a terminal
  x-terminal-emulator -e "$APP_DIR/start_ubuntu_lan.sh" 2>/dev/null \
    || gnome-terminal -- "$APP_DIR/start_ubuntu_lan.sh" 2>/dev/null \
    || xterm -e "$APP_DIR/start_ubuntu_lan.sh" &
  sleep 3
fi

# Wait for the backend to answer, then open the browser
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:8000/api/courts/default >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

xdg-open "http://127.0.0.1" >/dev/null 2>&1 &
