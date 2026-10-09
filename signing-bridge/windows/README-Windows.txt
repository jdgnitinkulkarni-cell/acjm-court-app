NyayDwar Sign Bridge (Windows)
==============================

What it does
  Lets you digitally sign NyayDwar PDFs with your DSC (Class 3) USB token.
  Your token PIN is typed only in the bridge's own window on your computer;
  it is never sent to the browser or to the NyayDwar server.

Before you start
  1. Install the software / driver of your DSC token (for example
     WD ProxKey, ePass2003, mToken) - the same one you use for other
     signing - and insert the token.
  2. Token-based signing works on Windows only (for now).

Install (once, no administrator rights needed)
  1. Extract (unzip) this whole ZIP file.
  2. Double-click install.bat.
  3. A desktop icon "NyayDwar Sign Bridge" is created. Open it and click
     "Check token" to see that your certificate is detected.

Signing
  In NyayDwar, open a PDF and click "Digitally Sign" -> "Sign with DSC token".
  The first time, the browser asks "Open NyayDwar Sign Bridge?" - tick
  "Always allow ..." and click Open. Choose your certificate, type the
  token PIN and click Sign. NyayDwar keeps the signed copy and downloads
  one for you.

Remove
  Double-click uninstall.bat.

For the Administrator
  * bridge\bridge-config.json : trusted NyayDwar addresses, extra token
    driver paths ("pkcs11_libraries"), default reason / location.
  * The source code is in the NyayDwar application folder "signing-bridge";
    build_packages.sh rebuilds the Windows, Ubuntu and Mac packages.
