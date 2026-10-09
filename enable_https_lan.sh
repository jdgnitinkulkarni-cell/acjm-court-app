#!/usr/bin/env bash
# ACJM Court App - Ubuntu LAN Server - ENABLE HTTPS (fixes the mic/voice-typing button)
#
# Chrome (and Edge) only allow microphone access - which the "voice typing"
# mic button on the forms uses - on a "secure context": a site loaded over
# HTTPS, or http://localhost. Because this app is served as plain
# http://SERVER-IP on the LAN, Chrome silently blocks the mic and the page
# shows "Not secure" in the address bar.
#
# This script does NOT need internet access (no apt/download involved - it
# only uses openssl, which is already on every Ubuntu install) so it will
# work even on networks that block security.ubuntu.com / dl.google.com.
#
# It creates a self-signed certificate for this server's LAN IP and adds an
# HTTPS (port 443) block to the existing Nginx site, alongside the existing
# plain HTTP on port 80 (left as-is, for anything that doesn't need the mic).
#
# One-time step required on EVERY client PC's Chrome: the first time they
# open https://SERVER-IP, Chrome will show "Your connection is not private"
# because the certificate is self-signed, not from a public certificate
# authority. Click "Advanced" -> "Proceed to SERVER-IP (unsafe)" once; after
# that, the mic button works normally on that browser.
#
# Usage:
#   chmod +x enable_https_lan.sh
#   ./enable_https_lan.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="/etc/ssl/acjm-court-app"
NGINX_CONF="/etc/nginx/sites-available/acjm-court-app"

if ! command -v nginx >/dev/null 2>&1; then
  echo "ERROR: nginx is not installed. Run ./install_ubuntu_lan.sh first."
  exit 1
fi

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "${SERVER_IP:-}" ]; then
  SERVER_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')"
fi
if [ -z "${SERVER_IP:-}" ]; then
  echo "ERROR: could not detect this PC's LAN IP. Run 'hostname -I' and re-run"
  echo "this script after checking your network connection."
  exit 1
fi

echo "=============================================="
echo " ACJM Court App - Enable HTTPS on the LAN"
echo "=============================================="
echo "Detected server IP: $SERVER_IP"
echo

echo "[1/3] Generating a self-signed certificate (valid 10 years) for $SERVER_IP..."
sudo mkdir -p "$CERT_DIR"
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout "$CERT_DIR/acjm.key" \
  -out "$CERT_DIR/acjm.crt" \
  -subj "/CN=${SERVER_IP}" \
  -addext "subjectAltName=IP:${SERVER_IP},IP:127.0.0.1,DNS:localhost" \
  2>/dev/null
sudo chmod 600 "$CERT_DIR/acjm.key"

echo
echo "[2/3] Updating Nginx to serve HTTPS on port 443 (HTTP on port 80 still works)..."
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

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name _;

    ssl_certificate     ${CERT_DIR}/acjm.crt;
    ssl_certificate_key ${CERT_DIR}/acjm.key;

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

sudo nginx -t
sudo systemctl reload nginx

echo
echo "[3/3] Opening firewall port 443 (only if ufw is active)..."
if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -qi "Status: active"; then
  sudo ufw allow 443/tcp
else
  echo "ufw is not active, no firewall changes needed."
fi

echo
echo "=============================================="
echo " HTTPS is ready."
echo
echo " On every client PC, open Chrome and go to:"
echo "   https://${SERVER_IP}"
echo
echo " The FIRST time, Chrome will warn 'Your connection is not private'"
echo " (this is expected - it's a self-signed certificate, not from a"
echo " public certificate authority). Click:"
echo "   Advanced  ->  Proceed to ${SERVER_IP} (unsafe)"
echo " Do this once per browser. After that, the mic / voice-typing button"
echo " will work normally on that PC."
echo
echo " Plain http://${SERVER_IP} (no mic) still works too, unchanged."
echo "=============================================="
echo
echo " Need the mic working RIGHT NOW on a PC without doing the above?"
echo " Quick per-browser workaround (no server change, redo if the IP"
echo " changes):"
echo "   1. On that PC, open chrome://flags/#unsafely-treat-insecure-origin-as-secure"
echo "   2. Enter:  http://${SERVER_IP}"
echo "   3. Set the flag to Enabled, click Relaunch."
echo "=============================================="
