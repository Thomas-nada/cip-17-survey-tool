@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH. Please install Node.js and npm first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/5] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [INFO] Created .env from .env.example.
  ) else (
    echo [WARN] .env file not found.
  )
)
echo [INFO] Ensure .env has BLOCKFROST_MAINNET_PROJECT_ID and/or BLOCKFROST_TESTNET_PROJECT_ID.

echo [2/5] Building project...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo [3/5] Starting backend API on http://localhost:8787 ...
start "CIP17 API" cmd /k "cd /d ""%~dp0"" && npm run server"

echo [4/5] Starting preview server on http://localhost:4173 ...
start "Vite Preview" cmd /k "cd /d ""%~dp0"" && npm run preview -- --host --port 4173"

echo [5/5] Opening browser...
timeout /t 3 /nobreak >nul
start "" "http://localhost:4173"

echo.
echo App launched. Close this window any time.
endlocal
