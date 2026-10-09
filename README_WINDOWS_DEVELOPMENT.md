ACJM Court App — Development Copy (for continued work on Windows)
===================================================================

WHAT THIS IS
------------
This is the FULL, complete application, including everything built and
fixed so far (Judge Tab, Deposition module, Order/183-Statement scaffolding,
crash-recovery, etc.) — all cumulative work up to the point this zip was
made. It is a snapshot of the ISOLATED TEST/DEVELOPMENT codebase, not the
live production server.

FIRST-TIME SETUP ON WINDOWS
----------------------------
1. Install Python 3.10+ from https://www.python.org/downloads/
   - IMPORTANT: during install, tick "Add python.exe to PATH".
2. Install Node.js (LTS version) from https://nodejs.org/
3. Double-click  install_windows.bat
   This creates a Python virtual environment, installs backend packages,
   and installs + builds the frontend. It can take several minutes the
   first time. Requires an internet connection.

RUNNING IT
----------
Double-click  start_windows.bat
This starts the app at:
    http://localhost:8000              (Advocate / Staff / Admin)
    http://localhost:8000/judge-desk   (Judge Desk — not linked from the
                                         main page, bookmark it directly)

Press Ctrl+C in the black window to stop the server.

Its data file (backend\local_data.json) is separate from anything on the
Ubuntu server — this is a fully independent, standalone environment.

MAKING CODE CHANGES
--------------------
- Backend code:  backend\server.py  (Python/FastAPI)
- Frontend code: frontend\src\      (React — .jsx files in frontend\src\pages\)

After editing frontend code, you need to rebuild before start_windows.bat
will show the changes:
    cd frontend
    npm run build

After editing backend\server.py, no rebuild is needed — just restart
start_windows.bat (Ctrl+C, then run it again) to pick up the change.

WHEN YOU'RE READY FOR FINAL DEPLOYMENT
----------------------------------------
Do NOT copy this folder directly onto the live Ubuntu server yourself.
Bring this zip (or your updated version of it) back into this chat, and
we'll go through it together the same way we have throughout this
project: review changes, test on the server's isolated port-8001 test
copy first, and only deploy to the real production app
(~/acjm-court-app, port 8000) once you've confirmed everything is working
correctly. This keeps the same safety process that's protected the real
application throughout this whole project.
