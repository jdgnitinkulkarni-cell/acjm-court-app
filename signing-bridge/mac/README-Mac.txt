NyayDwar Sign Bridge (macOS 11 or later — Apple Silicon and Intel)
==================================================================

What it does
  Lets you digitally sign NyayDwar PDFs with your DSC (Class 3) USB token.
  Your token PIN is typed only in the bridge's own window on your Mac;
  it is never saved, and never sent to the browser or to the NyayDwar server.

Before you start
  Install the macOS driver of your DSC token (for example WD ProxKey for
  Mac, ePass2003 for Mac) and insert the token.

Install (once)
  1. Double-click the downloaded file to extract it.
  2. In the extracted folder, RIGHT-click "install.command" and choose Open
     (macOS asks because the file is not from the App Store; click Open).
  3. Open "NyayDwar Sign Bridge" from your Applications folder (in your home
     folder) - its window has a "Check token" button.

Signing
  In NyayDwar click "Digitally Sign" -> "Sign with DSC Token". The first time
  the browser asks to open "NyayDwar Sign Bridge" - tick "Always allow" and
  click Open. Choose the certificate, type the token PIN and click Sign.

If your token is not found
  Add the full path of your token's PKCS#11 driver (.dylib file) to
  "pkcs11_libraries" in
  ~/Library/Application Support/NyayDwarSignBridge/bridge/bridge-config.json

Remove
  Double-click uninstall.command (right-click > Open the first time).
