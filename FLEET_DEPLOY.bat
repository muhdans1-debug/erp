@echo off
title Askar Supermarket ERP - Golden USB Fleet Deployer (Store #1)
color 0B

echo ========================================================
echo   ASKAR SUPERMARKET ERP - GOLDEN USB FLEET DEPLOYMENT
echo   Target Machine: Store #1 Master Laptop (24/7 Server)
echo ========================================================
echo.

setlocal enabledelayedexpansion
set "SOURCE_DIR=%~dp0askar-erp-build"
set "TARGET_DIR=C:\AskarERP"

:: 1. CHECK ELEVATION / ADMIN
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Requesting Administrator Privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: 2. DETECT NODE.JS RUNTIME
echo [1/6] Verifying Node.js runtime...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Node.js is not found in system PATH.
    :: Check for offline Node installer on USB drive
    if exist "%~dp0node-v20.msi" (
        echo [INFO] Running offline Node.js installer from Golden USB...
        msiexec /i "%~dp0node-v20.msi" /quiet /norestart
        set "PATH=%PATH%;C:\Program Files\nodejs"
    ) else if exist "%~dp0node.msi" (
        echo [INFO] Running offline Node.js installer from Golden USB...
        msiexec /i "%~dp0node.msi" /quiet /norestart
        set "PATH=%PATH%;C:\Program Files\nodejs"
    ) else (
        echo [ERROR] Please install Node.js v18 or v20 LTS before continuing!
        echo Opening https://nodejs.org ...
        start https://nodejs.org
        pause
        exit /b 1
    )
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo       Node.js Version: %%v detected.

:: 3. COPY CLEAN ARTIFACT TO C:\AskarERP
echo.
echo [2/6] Deploying clean production artifact to %TARGET_DIR%...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

if exist "%SOURCE_DIR%" (
    xcopy "%SOURCE_DIR%" "%TARGET_DIR%\" /E /I /H /Y /Q >nul
    echo       Artifact copied successfully from Golden USB!
) else if exist "%~dp0apps" (
    xcopy "%~dp0apps" "%TARGET_DIR%\apps\" /E /I /H /Y /Q >nul
    if exist "%~dp0package.json" copy "%~dp0package.json" "%TARGET_DIR%\" /Y >nul
    if exist "%~dp0.env" copy "%~dp0.env" "%TARGET_DIR%\" /Y >nul
    echo       Direct workspace tree deployed successfully!
) else (
    echo [ERROR] Could not find askar-erp-build directory on Golden USB!
    pause
    exit /b 1
)

:: Ensure .env is present in target directory
if not exist "%TARGET_DIR%\.env" (
    if exist "%~dp0.env" (
        copy "%~dp0.env" "%TARGET_DIR%\.env" /Y >nul
    ) else if exist "%TARGET_DIR%\.env.example" (
        copy "%TARGET_DIR%\.env.example" "%TARGET_DIR%\.env" /Y >nul
    )
)
if exist "%TARGET_DIR%\.env" (
    if exist "%TARGET_DIR%\apps\api" copy "%TARGET_DIR%\.env" "%TARGET_DIR%\apps\api\.env" /Y >nul
    if exist "%TARGET_DIR%\pos-mvp" copy "%TARGET_DIR%\.env" "%TARGET_DIR%\pos-mvp\.env" /Y >nul
)

:: 4. LOCK LAPTOP 24/7 POWER PLAN (NEVER SLEEP)
echo.
echo [3/6] Locking 24/7 Retail Server Power Plan (Sleep = Never, Lid Close = Run)...
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-dc 0 >nul 2>&1
powercfg /change hibernate-timeout-dc 0 >nul 2>&1
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 >nul 2>&1
powercfg /setdcvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
echo       24/7 Retail Mode engaged!

:: 5. CONFIGURE WINDOWS FIREWALL FOR HARDWARE TERMINALS
echo.
echo [4/6] Opening Windows Firewall for Sunmi hardware terminals...
netsh advfirewall firewall add rule name="Askar ERP Master Port 3000" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1
netsh advfirewall firewall add rule name="Askar ERP mDNS Discovery" dir=in action=allow protocol=UDP localport=5353 profile=any >nul 2>&1
echo       Port 3000 (TCP/WS) and Port 5353 (mDNS) opened.

:: 6. INSTALL / VERIFY PM2 SERVICE SUPERVISOR
echo.
echo [5/6] Verifying PM2 process supervisor...
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo       Installing PM2 globally...
    call npm install -g pm2 pm2-windows-startup >nul 2>&1
) else (
    echo       PM2 is already installed.
)

:: 7. START BACKGROUND SERVICES UNDER PM2
echo.
echo [6/6] Launching Askar ERP services under PM2...
cd /d "%TARGET_DIR%"

call pm2 delete askar-api 2>nul
call pm2 delete askar-erp 2>nul

if exist "%TARGET_DIR%\apps\api\server.js" (
    cd /d "%TARGET_DIR%\apps\api"
    call pm2 start server.js --name "askar-api"
) else if exist "%TARGET_DIR%\pos-mvp\server.js" (
    cd /d "%TARGET_DIR%\pos-mvp"
    call pm2 start server.js --name "askar-api"
) else if exist "%TARGET_DIR%\server.js" (
    call pm2 start server.js --name "askar-api"
)

call pm2 save >nul 2>&1
call pm2-startup install >nul 2>&1

color 0A
echo.
echo ========================================================
echo   [SUCCESS] STORE #1 MASTER LAPTOP DEPLOYED!
echo ========================================================
echo.
echo   Fastify Master Server: http://localhost:3000
echo   Cashier POS Terminal:  http://localhost:3000/pos/
echo   Back-Office Dashboard: http://localhost:3000/admin/
echo.
echo   PM2 Status:            pm2 status
echo   PM2 Live Logs:         pm2 logs askar-api
echo ========================================================
echo.
pause
exit /b 0
