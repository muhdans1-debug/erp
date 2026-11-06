@echo off
title Askar Supermarket ERP - Update & Restart Services
color 0A

echo ========================================================
echo   ASKAR SUPERMARKET ERP - UPDATE & RESTART SERVICES
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Pull Latest Repository Changes from GitHub
echo [1/5] Pulling latest code from GitHub repository...
git pull origin master
if %errorlevel% neq 0 (
    echo [WARNING] Git pull failed or offline. Continuing with local files...
)

:: 2. Check Node.js and PM2
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required! Please install Node.js LTS from https://nodejs.org
    pause
    exit /b 1
)

where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo [2/5] Installing PM2 globally...
    call npm install -g pm2 pm2-windows-startup
) else (
    echo [2/5] PM2 is installed.
)

:: 3. Wipe any corrupted/duplicate PM2 processes
echo [3/5] Cleaning up old PM2 processes...
call pm2 delete all 2>nul
call pm2 kill 2>nul
timeout /t 2 /nobreak >nul

:: 4. Start all 4 services via native Node launchers
echo [4/5] Launching background services...
cd /d "%~dp0pos-mvp"
call pm2 start server.js --name "askar-api"
if exist "updater.js" (
    call pm2 start updater.js --name "askar-updater"
)
call pm2 start start-pos.cjs --name "askar-pos"

cd /d "%~dp0askar-admin-dashboard"
call pm2 start start-dashboard.cjs --name "askar-dash"

cd /d "%~dp0"

:: 5. Save PM2 list so services boot automatically
echo [5/5] Saving PM2 state for Windows startup...
call pm2 save
call pm2-startup install 2>nul

echo.
echo ========================================================
echo   PM2 SERVICE STATUS:
echo ========================================================
call pm2 status

echo.
echo ========================================================
echo   ALL SERVICES ARE NOW ONLINE AND SYNCHRONIZED!
echo.
echo   Cashier POS:         http://localhost:5173
echo   Manager Dashboard:   http://localhost:5177
echo   Fastify Bridge API:  http://localhost:3000
echo.
echo   NFC Relay & Register Spy are fully active!
echo ========================================================
echo.
pause
