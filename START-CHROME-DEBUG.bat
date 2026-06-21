@echo off
REM Does NOT close your Chrome. Only starts a debug instance if none is listening on 9222.
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Chrome debug port 9222 already active — using your open Chrome.
  exit /b 0
)
echo No debug port found. Start Chrome once with remote debugging:
echo   Right-click Chrome shortcut ^> Properties ^> Target, add at the end:
echo   --remote-debugging-port=9222
echo Then open GoDaddy DNS and run DEPLOY-SALES-DNS.bat