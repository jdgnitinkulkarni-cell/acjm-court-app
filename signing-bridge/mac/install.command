#!/bin/bash
# NyayDwar Sign Bridge — install for the current macOS user (no administrator password needed).
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/NyayDwarSignBridge"
APP="$HOME/Applications/NyayDwar Sign Bridge.app"
case "$(uname -m)" in arm64) PYDIR="python-arm64" ;; *) PYDIR="python-x86_64" ;; esac
echo ""
echo " NyayDwar Sign Bridge - installing for $USER ($(uname -m)) ..."
if [ ! -x "$SRC/$PYDIR/bin/python3" ]; then
  echo " The '$PYDIR' folder is missing. Please extract the whole file first."; exit 1
fi
# The files come from the court's own server: remove the "downloaded from internet" flag.
xattr -dr com.apple.quarantine "$SRC" 2>/dev/null || true
mkdir -p "$DEST" "$HOME/Applications"
rm -rf "$DEST/python" "$DEST/bridge"
cp -R "$SRC/$PYDIR" "$DEST/python"
cp -R "$SRC/bridge" "$DEST/bridge"
cp "$SRC/uninstall.command" "$SRC/README-Mac.txt" "$DEST/"
PY="$DEST/python/bin/python3"
SCRIPT="$DEST/bridge/nyaydwar_sign_bridge.py"
rm -rf "$APP"
osacompile -o "$APP" <<OSA
on open location theURL
	do shell script quoted form of "$PY" & " " & quoted form of "$SCRIPT" & " " & quoted form of theURL & " > /dev/null 2>&1 &"
end open location
on run
	do shell script quoted form of "$PY" & " " & quoted form of "$SCRIPT" & " > /dev/null 2>&1 &"
end run
OSA
PL="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes" "$PL" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string in.nyaydwar.signbridge" "$PL" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier in.nyaydwar.signbridge" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string NyayDwar Sign" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string nyaydwar-sign" "$PL"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PL" 2>/dev/null || true
cp "$SRC/bridge/nyaydwar.icns" "$APP/Contents/Resources/applet.icns" 2>/dev/null || true
codesign --force --deep -s - "$APP" 2>/dev/null || true
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" 2>/dev/null || true
echo " Installed: $APP"
echo ""
echo " Done. In NyayDwar, open a document and click \"Digitally Sign\"."
echo " The first time, the browser asks to open \"NyayDwar Sign Bridge\" - tick \"Always allow\" and click Open."
echo " Open \"NyayDwar Sign Bridge\" from your Applications folder to check that your token is detected."
echo ""
read -n 1 -s -r -p " Press any key to close."
