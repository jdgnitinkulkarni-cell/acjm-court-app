# ACJM Court App - Ubuntu LAN Version (Simple)

## Fixes added 2026-07-02: no more daily reinstall, desktop shortcut, mic fix

**You never need to run `install_ubuntu_lan.sh` more than once.** It only
installs packages; it does not need to be repeated. The scary red `apt`
errors you saw (403 on security.ubuntu.com, TLS failure on dl.google.com)
happen because this network blocks those addresses - they are harmless and
were aborting the script before it did anything, which is fine because
everything was already installed. Running it again daily achieves nothing
except printing those errors.

Run these two scripts **once each**, in order, and you're done permanently:

```bash
chmod +x setup_autostart.sh create_desktop_shortcut.sh enable_https_lan.sh
./setup_autostart.sh          # app starts automatically on every boot, forever
./create_desktop_shortcut.sh  # adds a "Start ACJM Court App" icon on the Desktop
./enable_https_lan.sh         # fixes the mic/voice-typing button (see below)
```

- `setup_autostart.sh` turns the backend into a systemd service that starts
  on boot and restarts itself if it ever crashes. After this, you can just
  leave the PC on (or turn it on each morning) - no script, no terminal.
- `create_desktop_shortcut.sh` adds a Desktop icon that restarts the app and
  opens it in the browser, for a manual one-click restart if ever needed.
- `enable_https_lan.sh` fixes **"mic input not allowed / connection not
  secure"**: Chrome blocks the microphone (used by the voice-typing button)
  on plain `http://` LAN addresses. This adds HTTPS via a self-signed
  certificate. The first time each client PC visits `https://SERVER-IP`,
  Chrome will warn the connection isn't private (expected, since it's a
  self-signed cert) - click **Advanced -> Proceed** once per browser, then
  the mic works normally from then on. See the script's own output for a
  faster (but per-browser, no-cert) workaround using a Chrome flag.

If the server PC has "restore on reboot" / kiosk-reset software that wipes
changes on every restart, that (not this app) is what would force a real
daily reinstall - exclude this app folder, the systemd service, and the
Nginx config from that reset, or disable it.

## Pushing future updates (without deleting anything)

Never delete this folder to install a new version. Instead:

```bash
unzip ~/Downloads/ACJM-Court-App-Ubuntu-LAN-vNEW.zip -d ~/acjm-update
./update_ubuntu_lan.sh ~/acjm-update/ACJM-Court-App-Ubuntu-LAN
```

`update_ubuntu_lan.sh` copies the new files in, backs up your data first,
and always protects `backend/local_data.json`, `backend/.env`, `.venv/` and
`backups/` - so all courts/staff/pleas/applications data and your installed
packages survive every update. It restarts the app automatically if
`setup_autostart.sh` has been run.

---

This is the exact same application as the Windows version (same forms, same
pursis formats, same bulk generation, same PDF print layouts, same Gujarati
and English text, same data file format). Only the way it runs has changed:
one Ubuntu PC now acts as the server, and every other PC on the same
network/WiFi opens it in a browser - no installation on client PCs.

What did NOT change: the FastAPI backend (`backend/server.py`), the built
React frontend (`frontend/build`), the data file (`backend/local_data.json`),
the fonts, and every form/pursis/PDF layout. What changed: the app now binds
to `0.0.0.0` so it is reachable on the LAN, Nginx was added only so client
PCs can use the plain address `http://SERVER-IP` (no port number), and all
Docker/Render/cloud-hosting files were removed.

## 1. Installation (run once, on the server PC)

Open a terminal in this folder and run:

```bash
chmod +x install_ubuntu_lan.sh start_ubuntu_lan.sh backup_ubuntu_lan.sh
./install_ubuntu_lan.sh
```

This installs, all locally on this one PC:
- Python 3 + venv + pip
- The backend's Python packages (FastAPI, uvicorn, reportlab) into `.venv`
- The Gujarati font package (the app also ships its own copy in
  `backend/fonts`, so PDFs work even without this)
- A Chromium-based browser, used headlessly by the backend to produce the
  exact same print layout that Microsoft Edge/Chrome produced on Windows
  (page size, margins, fonts, spacing, alignment). If this cannot be
  installed (no internet on this PC), the app still works and automatically
  falls back to a simplified PDF layout.
- Nginx, configured as a minimal reverse proxy so the app is reachable at
  plain `http://SERVER-IP` with no port number

No cloud service, Docker, or paid service is used anywhere.

## 2. Start the server

```bash
./start_ubuntu_lan.sh
```

