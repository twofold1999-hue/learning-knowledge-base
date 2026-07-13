@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if exist "node_modules" (
  echo Building the latest web app...
  call npm run build
  if errorlevel 1 (
    echo Build failed. Please check the project dependencies.
    pause
    exit /b 1
  )
) else if not exist "dist\index.html" (
  echo No runnable build was found. Run npm install and npm run build once first.
  pause
  exit /b 1
)

node scripts/local-server-control.mjs start
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%