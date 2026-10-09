@echo off
setlocal enabledelayedexpansion
echo ==============================================
echo  ACJM Court App - Windows TEST install
echo  (For local testing only - not for production)
echo ==============================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    set "PYEXE=py"
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        set "PYEXE=python"
    ) else (
        echo ERROR: Python was not found on this PC.
        echo Install Python 3.10 or newer from https://www.python.org/downloads/
        echo IMPORTANT: during install, tick "Add python.exe to PATH".
        echo Then re-run this script.
        pause
        exit /b 1
    )
)

where node >nul 2>nul
if not %errorlevel%==0 (
    echo ERROR: Node.js was not found on this PC.
    echo Install the LTS version from https://nodejs.org/ and re-run this script.
    pause
    exit /b 1
)

echo Using Python launcher: %PYEXE%
echo.

echo [1/3] Creating Python virtual environment...
cd /d "%~dp0backend"
%PYEXE% -m venv .venv
if not exist ".venv\Scripts\activate.bat" (
    echo ERROR: Failed to create the virtual environment.
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat

echo.
echo [2/3] Installing backend Python packages (FastAPI, uvicorn, reportlab)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed. Check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo [3/3] Installing and building the frontend (this can take a few minutes)...
cd /d "%~dp0frontend"
call npm install --legacy-peer-deps
if errorlevel 1 (
    echo ERROR: npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
)
call npm run build
if errorlevel 1 (
    echo ERROR: npm run build failed. See the errors above.
    pause
    exit /b 1
)

echo.
echo ==============================================
echo  Install complete.
echo  Double-click start_windows.bat to launch the app.
echo ==============================================
pause
