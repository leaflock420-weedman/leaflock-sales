@echo off
title LeafLock Sales Desktop
set ROOT=%~dp0
set PORT=8787
set URL=http://127.0.0.1:%PORT%/

:: Start local server in background
powershell -NoProfile -Command ^
  "$port=%PORT%; $root='%ROOT%';" ^
  "$inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue;" ^
  "if (-not $inUse) {" ^
  "  Start-Process powershell -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File','\"$root\start-crm.ps1\"';" ^
  "  Start-Sleep -Seconds 2;" ^
  "}"

set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe

if exist "%EDGE%" (
  start "" "%EDGE%" --app=%URL% --window-size=1280,900
  exit /b 0
)
if exist "%CHROME%" (
  start "" "%CHROME%" --app=%URL% --window-size=1280,900
  exit /b 0
)

start "" %URL%
echo Opened in default browser. Install Edge or Chrome for a proper app window.
pause