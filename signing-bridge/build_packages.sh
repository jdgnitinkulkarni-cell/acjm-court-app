#!/usr/bin/env bash
# Builds the NyayDwar Sign Bridge packages for Windows, Ubuntu and macOS
# (portable Python + signing libraries + bridge) on any Linux machine with
# internet access (GitHub + PyPI). Output: ../backend/downloads/
#   NyayDwar-Sign-Bridge-Windows.zip, NyayDwar-Sign-Bridge-Ubuntu.tar.gz, NyayDwar-Sign-Bridge-Mac.tar.gz
# Usage: bash build_packages.sh [windows|ubuntu|mac|all]   (default: all)
# PY_CACHE=<folder> re-uses already downloaded Python archives.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$HERE/../backend/downloads"
WHAT="${1:-all}"
REL="${PBS_RELEASE:-20260929}"; PYV="${PBS_PYTHON:-3.12.14}"
BASE="https://github.com/astral-sh/python-build-standalone/releases/download/$REL"
CACHE="${PY_CACHE:-$HOME/.cache/nyaydwar-bridge-build}"
mkdir -p "$OUT_DIR" "$CACHE"

fetch_python() {  # $1 = target triple ; prints path of the archive
  local f="cpython-$PYV+$REL-$1-install_only_stripped.tar.gz"
  if [ ! -s "$CACHE/$f" ]; then curl -fsSL -o "$CACHE/$f" "$BASE/${f//+/%2B}"; fi
  echo "$CACHE/$f"
}
add_libs() {  # $1 = site-packages dir ; rest = pip platform flags
  local target="$1"; shift
  pip3 install --quiet --disable-pip-version-check --target "$target" "$@" --python-version 3.12 \
    --implementation cp --abi cp312 --only-binary=:all: -r "$HERE/requirements.txt"
}
copy_bridge() {  # $1 = package dir
  mkdir -p "$1/bridge"
  cp "$HERE/nyaydwar_sign_bridge.py" "$HERE/signcore.py" "$HERE/bridge-config.json" "$HERE/nyaydwar.ico" "$HERE/nyaydwar.png" "$HERE/nyaydwar.icns" "$1/bridge/"
}

if [ "$WHAT" = all ] || [ "$WHAT" = windows ]; then
  W="$(mktemp -d)"; P="$W/NyayDwar-Sign-Bridge"; mkdir -p "$P"
  echo "Windows: Python + libraries ..."
  tar xzf "$(fetch_python x86_64-pc-windows-msvc)" -C "$P"
  add_libs "$P/python/Lib/site-packages" --platform win_amd64
  copy_bridge "$P"
  cp "$HERE/windows/install.bat" "$HERE/windows/uninstall.bat" "$HERE/windows/README-Windows.txt" "$P/"
  (cd "$W" && python3 -c "import shutil; shutil.make_archive('pkg', 'zip', '.', 'NyayDwar-Sign-Bridge')")
  cp "$W/pkg.zip" "$OUT_DIR/NyayDwar-Sign-Bridge-Windows.zip"; rm -rf "$W"
  echo "  -> NyayDwar-Sign-Bridge-Windows.zip"
fi

if [ "$WHAT" = all ] || [ "$WHAT" = ubuntu ]; then
  W="$(mktemp -d)"; P="$W/NyayDwar-Sign-Bridge"; mkdir -p "$P"
  echo "Ubuntu: Python + libraries ..."
  tar xzf "$(fetch_python x86_64-unknown-linux-gnu)" -C "$P"
  add_libs "$P/python/lib/python3.12/site-packages" --platform manylinux2014_x86_64 --platform manylinux_2_17_x86_64 --platform manylinux_2_28_x86_64
  copy_bridge "$P"
  cp "$HERE/linux/install.sh" "$HERE/linux/uninstall.sh" "$HERE/linux/README-Ubuntu.txt" "$P/"
  chmod +x "$P/install.sh" "$P/uninstall.sh"
  tar czf "$OUT_DIR/NyayDwar-Sign-Bridge-Ubuntu.tar.gz" -C "$W" NyayDwar-Sign-Bridge; rm -rf "$W"
  echo "  -> NyayDwar-Sign-Bridge-Ubuntu.tar.gz"
fi

if [ "$WHAT" = all ] || [ "$WHAT" = mac ]; then
  W="$(mktemp -d)"; P="$W/NyayDwar-Sign-Bridge"; mkdir -p "$P"
  echo "macOS: Python (Apple Silicon + Intel) + libraries ..."
  mkdir -p "$W/a" "$W/i"
  tar xzf "$(fetch_python aarch64-apple-darwin)" -C "$W/a"; mv "$W/a/python" "$P/python-arm64"
  tar xzf "$(fetch_python x86_64-apple-darwin)" -C "$W/i"; mv "$W/i/python" "$P/python-x86_64"
  add_libs "$P/python-arm64/lib/python3.12/site-packages" --platform macosx_11_0_arm64 --platform macosx_10_13_universal2 --platform macosx_10_9_universal2 --platform macosx_11_0_universal2
  add_libs "$P/python-x86_64/lib/python3.12/site-packages" --platform macosx_10_13_x86_64 --platform macosx_10_9_x86_64 --platform macosx_10_13_universal2 --platform macosx_10_9_universal2
  copy_bridge "$P"
  cp "$HERE/mac/install.command" "$HERE/mac/uninstall.command" "$HERE/mac/README-Mac.txt" "$P/"
  chmod +x "$P/install.command" "$P/uninstall.command"
  tar czf "$OUT_DIR/NyayDwar-Sign-Bridge-Mac.tar.gz" -C "$W" NyayDwar-Sign-Bridge; rm -rf "$W"
  echo "  -> NyayDwar-Sign-Bridge-Mac.tar.gz"
fi
echo "Done. Packages are in $OUT_DIR"
