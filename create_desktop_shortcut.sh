#!/usr/bin/env bash
# ACJM Court App - Ubuntu LAN Server - DESKTOP SHORTCUT
#
# Run this ONCE on the server PC (after setup_autostart.sh). It creates a
# double-clickable icon on the Desktop labelled "Start ACJM Court App".
# Clicking it: (re)starts the backend + nginx, waits for it to come up,
# then opens the app in the default browser. Safe to click any time,
# including if the app is already running.
#
# Usage:
#   chmod +x create_desktop_shortcut.sh
#   ./create_desktop_shortcut.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$APP_DIR/launch_acjm.sh"
DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
mkdir -p "$DESKTOP_DIR"
DESKTOP_FILE="$DESKTOP_DIR/ACJM-Court-App.desktop"
ICON_FILE="$APP_DIR/frontend/build/favicon.ico"

echo "[1/2] Writing launcher script..."
cat > "$LAUNCHER" << 'LAUNCH_EOF'
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
LAUNCH_EOF
chmod +x "$LAUNCHER"

echo "[2/2] Writing desktop icon..."
cat > "$DESKTOP_FILE" << DESKTOP_EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Start ACJM Court App
Comment=Start (or restart) the ACJM Court App server and open it in the browser
Exec=${LAUNCHER}
Icon=${ICON_FILE}
Terminal=false
Categories=Utility;
DESKTOP_EOF
chmod +x "$DESKTOP_FILE"

# Mark the shortcut as trusted so GNOME/Nautilus allows double-click launch
if command -v gio >/dev/null 2>&1; then
  gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
fi

echo
echo "=============================================="
echo " Desktop shortcut created:"
echo "   $DESKTOP_FILE"
echo
echo " Double-click it on the Desktop to (re)start the app and open it"
echo " in the browser. If Ubuntu still shows an 'Allow Launching' /"
echo " 'Untrusted application' prompt the first time, right-click the"
echo " icon -> 'Allow Launching', then double-click again."
echo "=============================================="
