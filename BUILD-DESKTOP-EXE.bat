@echo off
title Build LeafLock Sales .exe
cd /d "%~dp0desktop-app"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is not installed. This is required ONE TIME to build the .exe.
  echo.
  echo 1. Go to https://nodejs.org and download the LTS version
  echo 2. Install with default options
  echo 3. Double-click this file again
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

echo Installing Electron build tools (first run only, may take a few minutes)...
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

echo Building portable .exe...
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo DONE! Your app is here:
echo %~dp0desktop-app\dist\LeafLock-Sales-Portable.exe
echo.
explorer "%~dp0desktop-app\dist"
pause