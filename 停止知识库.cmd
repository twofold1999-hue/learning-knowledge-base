@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listeners = Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue; foreach ($listener in $listeners) { Stop-Process -Id $listener.OwningProcess -Force }"
echo Knowledge-base local server stopped.
timeout /t 2 >nul
