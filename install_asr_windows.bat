@echo off
setlocal
echo ==============================================
echo  ACJM Court App - AI Voice Typing install
echo  (AI4Bharat IndicConformer, runs on this PC)
echo ==============================================
echo.
echo  Before continuing you need a free Hugging Face token:
echo   1. Sign up / log in at https://huggingface.co
echo   2. Open https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
echo      and click "Agree and access repository"
echo   3. Create a READ token at https://huggingface.co/settings/tokens
echo.

where py >nul 2>nul
if %errorlevel%==0 (set "PYEXE=py") else (set "PYEXE=python")

cd /d "%~dp0asr_service"
if not exist ".venv\Scripts\activate.bat" (
    echo [1/4] Creating Python virtual environment...
    %PYEXE% -m venv .venv
)
if not exist ".venv\Scripts\activate.bat" (
    echo ERROR: Failed to create the virtual environment.
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat

echo.
echo [2/4] Installing AI packages (large download, can take 10-20 minutes)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed. Check your internet connection and try again.
    pause
    exit /b 1
)

echo.
if exist ".env" (
    findstr /b "HF_TOKEN=" .env >nul 2>nul
    if not errorlevel 1 goto have_token
)
set /p HFTOKEN="[3/4] Paste your Hugging Face READ token and press Enter: "
if "%HFTOKEN%"=="" (
    echo ERROR: A token is required to download the model.
    pause
    exit /b 1
)
>>.env echo HF_TOKEN=%HFTOKEN%
:have_token

echo.
echo [4/4] Downloading and testing the speech model (about 2-3 GB, first time only)...
python -c "import asr_server as a; m=a._load_model(); import sys; sys.exit(0 if m is not None else 1)"
if errorlevel 1 (
    echo.
    echo ERROR: The model could not be loaded. Check the message above.
    echo  - Did you click "Agree and access repository" on the model page?
    echo  - Is the token correct? You can edit asr_service\.env and run this again.
    pause
    exit /b 1
)

echo.
echo ==============================================
echo  AI Voice Typing installed.
echo  From now on start_windows.bat starts it automatically.
echo ==============================================
pause
