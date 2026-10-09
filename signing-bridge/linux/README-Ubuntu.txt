NyayDwar Sign Bridge (Ubuntu / Linux, 64-bit)
=============================================

What it does
  Lets you digitally sign NyayDwar PDFs with your DSC (Class 3) USB token.
  Your token PIN is typed only in the bridge's own window on your computer;
  it is never saved, and never sent to the browser or to the NyayDwar server.

Before you start
  1. Install the Linux driver of your DSC token (for example the WD ProxKey
     Linux package, ePass2003 Linux package) and insert the token.
     WD ProxKey: its own card service must be running (the vendor
     "pcscd_wd"); if the system "pcscd" conflicts with it, the vendor guide
     asks to stop/mask the system pcscd.
  2. Tested on Ubuntu 22.04 / 24.04 (64-bit, Intel/AMD).

Install (once, no sudo needed)
  1. Extract this file:   tar xzf NyayDwar-Sign-Bridge-Ubuntu.tar.gz
  2. Run:                 bash NyayDwar-Sign-Bridge/install.sh
  3. Open "NyayDwar Sign Bridge" from the menu and click "Check token".

Signing
  In NyayDwar click "Digitally Sign" -> "Sign with DSC Token". The first time
  the browser asks to open the link with the NyayDwar Sign Bridge - allow it.
  Choose the certificate, type the token PIN and click Sign.

If your token is not found
  Add the full path of your token's PKCS#11 driver (.so file) to
  "pkcs11_libraries" in ~/.local/share/nyaydwar-sign-bridge/bridge/bridge-config.json

Remove
  bash ~/.local/share/nyaydwar-sign-bridge/uninstall.sh
