@echo off
setlocal
title ACJM Voice AI (IndicConformer)
cd /d "%~dp0asr_service"
if not exist ".venv\Scripts\activate.bat" (
    echo AI voice typing is not installed. Run install_asr_windows.bat first.
    pause
    exit /b 1
)
call .venv\Scripts\activate.bat
echo  ACJM Voice AI running at http://127.0.0.1:8010  (keep this window open)
python -m uvicorn asr_server:app --host 127.0.0.1 --port 8010
pause
