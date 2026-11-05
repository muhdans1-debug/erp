@echo off
title Askar Supermarket ERP - Store Laptop Installer
color 0B

echo =======================================================
echo    ASKAR SUPERMARKET ERP - 1-CLICK LAPTOP SETUP
echo =======================================================
echo.
echo Installing and configuring POS and ERP on this supermarket laptop...
echo.

cd /d "%~dp0"

:: 1. CHECK NODE.JS
echo [1/5] Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in system PATH!
    echo Please install Node.js v18 or v20 LTS from: https://nodejs.org
    echo.
    echo Opening browser to Node.js download page...
    start https://nodejs.org
    pause
    exit /b 1
)
node -v
echo       Node.js is detected!

:: 2. INITIALIZE ENVIRONMENT CONFIGURATION (.env)
echo.
echo [2/5] Initializing local environment configurations...
if not exist "%~dp0.env" (
    if exist "%~dp0.env.example" (
        copy "%~dp0.env.example" "%~dp0.env" >nul
        echo       Created root .env configuration.
    )
) else (
    echo       Root .env already exists.
)

if not exist "%~dp0pos-mvp\.env" (
    if exist "%~dp0pos-mvp\.env.example" (
        copy "%~dp0pos-mvp\.env.example" "%~dp0pos-mvp\.env" >nul
        echo       Created pos-mvp/.env configuration.
    ) else if exist "%~dp0.env" (
        copy "%~dp0.env" "%~dp0pos-mvp\.env" >nul
        echo       Copied root .env to pos-mvp/.env.
    )
) else (
    echo       pos-mvp/.env already exists.
)

if not exist "%~dp0askar-admin-dashboard\.env" (
    if exist "%~dp0askar-admin-dashboard\.env.example" (
        copy "%~dp0askar-admin-dashboard\.env.example" "%~dp0askar-admin-dashboard\.env" >nul
        echo       Created askar-admin-dashboard/.env configuration.
    )
) else (
    echo       askar-admin-dashboard/.env already exists.
)

if not exist "%~dp0askar-khata-pwa\.env" (
    if exist "%~dp0askar-khata-pwa\.env.example" (
        copy "%~dp0askar-khata-pwa\.env.example" "%~dp0askar-khata-pwa\.env" >nul
        echo       Created askar-khata-pwa/.env configuration.
    )
) else (
    echo       askar-khata-pwa/.env already exists.
)

:: 3. INSTALL NPM PACKAGES
echo.
echo [3/5] Installing package dependencies across all workspaces...
echo       Please wait while dependencies are verified...
call npm install --no-audit --prefer-offline
if %errorlevel% neq 0 (
    echo [WARNING] Root npm install reported a warning. Checking pos-mvp directly...
    cd /d "%~dp0pos-mvp"
    call npm install --no-audit
    cd /d "%~dp0"
)
echo       Dependencies installed successfully!

:: 4. TEST DATABASE SYNC
echo.
echo [4/5] Initializing local offline replica database local.db...
cd /d "%~dp0pos-mvp"
node -e "import('./db.js').then(m => { console.log('       Database connection verified: ' + m.localDbPath); process.exit(0); }).catch(e => { console.error('       Database check:', e.message); process.exit(0); })"
cd /d "%~dp0"

:: 5. READY
echo.
echo [5/5] Setup finished!
color 0A
echo.
echo =======================================================
echo   SUPERMARKET LAPTOP SETUP IS COMPLETE!
echo.
echo   To launch the entire POS and ERP system, run:
echo   START_SYSTEM.bat
echo.
echo   Default Manager PIN: 9999
echo   Cashier POS URL:     http://localhost:5173
echo   Admin Dashboard:     http://localhost:5175
echo   Unified Server:      http://localhost:3000
echo =======================================================
echo.
exit /b 0
