#!/usr/bin/env bash
DEST="$HOME/.local/share/nyaydwar-sign-bridge"
rm -f "$HOME/.local/share/applications/nyaydwar-sign-bridge.desktop"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
rm -f "$DESKTOP_DIR/nyaydwar-sign-bridge.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
rm -rf "$DEST"
echo "NyayDwar Sign Bridge removed."
