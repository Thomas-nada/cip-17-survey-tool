@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH. Please install Node.js and npm first.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [INFO] Dependencies not found. Installing...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
) else (
  echo [INFO] Dependencies already installed. Skipping install.
)

echo [INFO] Starting backend + frontend...
start "" "http://localhost:5173"
call npm run dev:full

endlocal
