#!/usr/bin/env bash
# NyayDwar Sign Bridge — install for the current Ubuntu / Linux user (no sudo needed).
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/nyaydwar-sign-bridge"
APPS="$HOME/.local/share/applications"
echo ""
echo " NyayDwar Sign Bridge - installing for $USER ..."
if [ ! -x "$SRC/python/bin/python3" ]; then
  echo " The 'python' folder is missing. Please extract the whole file first, then run install.sh again."; exit 1
fi
mkdir -p "$DEST" "$APPS"
cp -a "$SRC/python" "$SRC/bridge" "$SRC/uninstall.sh" "$SRC/README-Ubuntu.txt" "$DEST/"
PY="$DEST/python/bin/python3"
cat > "$APPS/nyaydwar-sign-bridge.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=NyayDwar Sign Bridge
Comment=Digitally sign NyayDwar documents with your DSC token
Exec="$PY" "$DEST/bridge/nyaydwar_sign_bridge.py" %u
Icon=$DEST/bridge/nyaydwar.png
Terminal=false
Categories=Office;
MimeType=x-scheme-handler/nyaydwar-sign;
DESK
chmod +x "$APPS/nyaydwar-sign-bridge.desktop"
xdg-mime default nyaydwar-sign-bridge.desktop x-scheme-handler/nyaydwar-sign 2>/dev/null || true
update-desktop-database "$APPS" 2>/dev/null || true
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP_DIR" ]; then
  cp "$APPS/nyaydwar-sign-bridge.desktop" "$DESKTOP_DIR/"
  chmod +x "$DESKTOP_DIR/nyaydwar-sign-bridge.desktop"
  gio set "$DESKTOP_DIR/nyaydwar-sign-bridge.desktop" metadata::trusted true 2>/dev/null || true
fi
echo " Installed in: $DEST"
echo ""
echo " Done. In NyayDwar, open a document and click \"Digitally Sign\"."
echo " The first time, the browser asks to open \"xdg-open\" / NyayDwar Sign Bridge - allow it (tick \"Always allow\")."
echo " The \"NyayDwar Sign Bridge\" icon (menu / desktop) lets you check that your token is detected."
