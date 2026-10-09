@echo off
setlocal
title NyayDwar Sign Bridge - Install
echo.
echo  NyayDwar Sign Bridge - installing for the current Windows user ...
echo  (No administrator rights are needed.)
echo.
set "SRC=%~dp0"
set "DEST=%LOCALAPPDATA%\NyayDwarSignBridge"
if not exist "%SRC%python\pythonw.exe" (
  echo  The "python" folder is missing. Please extract the whole ZIP file first, then run install.bat again.
  pause
  exit /b 1
)
robocopy "%SRC%." "%DEST%" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo  Copying the files failed.
  pause
  exit /b 1
)
reg add "HKCU\Software\Classes\nyaydwar-sign" /ve /d "URL:NyayDwar Sign Bridge" /f >nul
reg add "HKCU\Software\Classes\nyaydwar-sign" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\nyaydwar-sign\DefaultIcon" /ve /d "\"%DEST%\bridge\nyaydwar.ico\"" /f >nul
reg add "HKCU\Software\Classes\nyaydwar-sign\shell\open\command" /ve /d "\"%DEST%\python\pythonw.exe\" \"%DEST%\bridge\nyaydwar_sign_bridge.py\" \"%%1\"" /f >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\NyayDwar Sign Bridge.lnk');$s.TargetPath='%DEST%\python\pythonw.exe';$s.Arguments='\"%DEST%\bridge\nyaydwar_sign_bridge.py\"';$s.IconLocation='%DEST%\bridge\nyaydwar.ico';$s.Save()" >nul 2>&1
echo  Installed in: %DEST%
echo.
echo  Done. Now, in NyayDwar, open a PDF and click "Digitally Sign".
echo  The first time, the browser asks "Open NyayDwar Sign Bridge?" - tick "Always allow" and click Open.
echo.
echo  A desktop icon "NyayDwar Sign Bridge" lets you check that your token is detected.
echo.
pause
