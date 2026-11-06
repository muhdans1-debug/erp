@echo off
title Askar Supermarket ERP - Setup PM2 Background Service
color 0B

echo ========================================================
echo   ASKAR SUPERMARKET ERP - PM2 BACKGROUND SERVICE SETUP
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Ensure .env exists before starting
if not exist "%~dp0pos-mvp\.env" (
    if exist "%~dp0pos-mvp\.env.example" (
        copy "%~dp0pos-mvp\.env.example" "%~dp0pos-mvp\.env" >nul
    ) else if exist "%~dp0.env.example" (
        copy "%~dp0.env.example" "%~dp0pos-mvp\.env" >nul
    )
)

:: 2. Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required! Please install Node.js LTS from https://nodejs.org
    pause
    exit /b 1
)

:: 3. Check and install PM2 globally if not present
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/4] Installing PM2 and Windows startup tools globally...
    call npm install -g pm2 pm2-windows-startup
) else (
    echo [1/4] PM2 is already installed.
)

:: 4. Stop existing instances cleanly to avoid duplicates
echo [2/4] Resetting PM2 service registrations...
call pm2 delete all 2>nul

:: 5. Launch services natively via Node launchers
echo [3/4] Registering and launching background services...
cd /d "%~dp0pos-mvp"
call pm2 start server.js --name "askar-api"
if exist "updater.js" (
    call pm2 start updater.js --name "askar-updater"
)
call pm2 start start-pos.cjs --name "askar-pos"

cd /d "%~dp0askar-admin-dashboard"
call pm2 start start-dashboard.cjs --name "askar-dash"

cd /d "%~dp0"

:: 6. Save PM2 list so services boot on Windows power-on
echo [4/4] Saving PM2 state for automatic Windows boot startup...
call pm2 save
call pm2-startup install 2>nul

echo.
echo ========================================================
echo   ALL SERVICES ARE NOW RUNNING SILENTLY IN BACKGROUND!
echo.
echo   Check status:     pm2 status
echo   View live logs:   pm2 logs askar-api
echo.
echo   Cashier POS:      http://localhost:5173
echo   Admin Dashboard:  http://localhost:5177
echo   Fastify API:      http://localhost:3000
echo ========================================================
echo.
pause
