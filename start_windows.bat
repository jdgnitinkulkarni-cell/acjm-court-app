@echo off
setlocal
cd /d "%~dp0backend"

if not exist ".venv\Scripts\activate.bat" (
    echo It looks like install_windows.bat hasn't been run yet.
    echo Please double-click install_windows.bat first.
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat

rem One-time install of the PDF helper used for the witness signature strip
python -c "import pypdf" >nul 2>nul || python -m pip install -q pypdf

echo ==============================================
echo  Starting ACJM Court App (local test mode)
echo ==============================================
echo.
echo  Main app (Advocate / Staff / Admin): http://localhost:8000
echo  Judge Desk (not linked from the main page):
echo      http://localhost:8000/judge-desk
echo.
echo  Press Ctrl+C in this window to stop the server.
echo ==============================================
echo.

rem Start the AI voice typing service (only if install_asr_windows.bat was run)
if exist "%~dp0asr_service\.venv\Scripts\activate.bat" start "ACJM Voice AI" /min cmd /c "%~dp0start_asr_windows.bat"

start "" http://localhost:8000
python -m uvicorn server:app --host 127.0.0.1 --port 8000

pause
