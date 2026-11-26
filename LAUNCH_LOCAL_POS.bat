@echo off
title ASKAR SUPERMARKET - LOCAL CASHIER POS (SUNMI TERMINAL APP)
color 0A
cls

echo ====================================================================
echo   ASKAR SUPERMARKET ERP - LOCAL CASHIER POS (SUNMI TERMINAL)
echo   Counter Checkout, Barcode Scanner, Quick Grid, Khata & Receipts
echo ====================================================================
echo.

:: 0. Locate ERP directory
set "ERP_DIR=%~dp0"
if exist "%ERP_DIR%pos-mvp\server.js" goto dir_ready
if exist "%ERP_DIR%erp\pos-mvp\server.js" (
    set "ERP_DIR=%ERP_DIR%erp\"
    goto dir_ready
)
if exist "C:\Users\ACER\Desktop\erp\pos-mvp\server.js" (
    set "ERP_DIR=C:\Users\ACER\Desktop\erp\"
    goto dir_ready
)

:dir_ready
cd /d "%ERP_DIR%"

:: 1. Ensure Master POS Server is active on Port 3000
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [NOTICE] Master Server is starting in background...
    start "Askar POS Autonomous Watchdog" /min cmd /c "node %ERP_DIR%pos-mvp\services\watchdogDaemon.js"
    timeout /t 3 /nobreak >nul
)

:: 2. Launch Local Sunmi POS in Chrome Dedicated App Mode
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

echo Launching Local Sunmi POS Register at http://localhost:3000/ ...

if exist %CHROME_PATH% (
    start "" %CHROME_PATH% --app=http://localhost:3000/ --start-maximized --enable-gpu-rasterization --force-gpu-rasterization --ignore-gpu-blocklist --enable-zero-copy
) else (
    start http://localhost:3000/
)

exit
