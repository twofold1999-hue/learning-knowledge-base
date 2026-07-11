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

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listeners = Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue; foreach ($listener in $listeners) { Stop-Process -Id $listener.OwningProcess -Force }"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath node -ArgumentList 'scripts/local-server.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Minimized"
exit /b 0
