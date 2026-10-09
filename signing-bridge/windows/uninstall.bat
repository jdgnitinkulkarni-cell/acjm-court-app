@echo off
title NyayDwar Sign Bridge - Uninstall
echo.
echo  Removing the NyayDwar Sign Bridge for the current Windows user ...
taskkill /f /fi "WINDOWTITLE eq NyayDwar Sign Bridge" >nul 2>&1
reg delete "HKCU\Software\Classes\nyaydwar-sign" /f >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath ([Environment]::GetFolderPath('Desktop')+'\NyayDwar Sign Bridge.lnk') -Force -ErrorAction SilentlyContinue" >nul 2>&1
del "%USERPROFILE%\Desktop\NyayDwar Sign Bridge.lnk" >nul 2>&1
del "%USERPROFILE%\OneDrive\Desktop\NyayDwar Sign Bridge.lnk" >nul 2>&1
rem program files (portable Python + bridge)
rmdir /s /q "%LOCALAPPDATA%\NyayDwarSignBridge" >nul 2>&1
rem per-user settings: trusted servers, pinned certificates, last certificate used, error log
rmdir /s /q "%APPDATA%\NyayDwarSignBridge" >nul 2>&1
if exist "%LOCALAPPDATA%\NyayDwarSignBridge" (
  echo  Some files are still in use. Close the bridge window and run uninstall.bat again.
) else (
  echo  NyayDwar Sign Bridge has been removed completely.
)
echo.
pause
