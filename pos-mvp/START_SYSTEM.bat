@echo off
title Askar Supermarket ERP - System Launcher
color 0A

echo =======================================================
echo     ASKAR SUPERMARKET POS ^& AI ERP - ONE-CLICK LAUNCH
echo =======================================================
echo.

:: 0. LOCATE ERP REPOSITORY ROOT
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

echo [ERROR] Could not find Askar ERP repository directory!
pause
exit /b 1

:dir_ready
cd /d "%ERP_DIR%"
echo [INFO] Working directory: %ERP_DIR%

:: 0B. PREVENT LAPTOP SLEEP / LID CLOSE SUSPEND
echo [0/5] Ensuring 24/7 Store Server Mode - Laptop Sleep Disabled...
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-dc 0 >nul 2>&1
powercfg /change hibernate-timeout-dc 0 >nul 2>&1
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 >nul 2>&1
powercfg /setdcvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1

:: 1. CHECK & LAUNCH FASTIFY BACKEND (PORT 3000)
echo [1/5] Checking Unified Fastify Backend on port 3000...
curl.exe -s -o nul --connect-timeout 1 http://127.0.0.1:3000/api/sync/status
if %errorlevel% equ 0 goto backend_running
echo       Starting Unified Backend Server on port 3000...
start "Askar ERP Backend - Port 3000" cmd /k "cd /d ""%ERP_DIR%pos-mvp"" && node server.js"
ping 127.0.0.1 -n 3 >nul
goto backend_done

:backend_running
echo       Unified Backend is ALIVE on http://localhost:3000

:backend_done

:: 2. CHECK & LAUNCH VITE CASHIER POS FRONTEND (PORT 5173)
echo [2/5] Checking Vite Cashier POS on port 5173...
curl.exe -s -o nul --connect-timeout 1 http://127.0.0.1:5173
if %errorlevel% equ 0 goto pos_running
echo       Starting Cashier POS Frontend on port 5173...
start "Askar POS Register - Port 5173" cmd /k "cd /d ""%ERP_DIR%pos-mvp"" && node start-pos.cjs"
ping 127.0.0.1 -n 3 >nul
goto pos_done

:pos_running
echo       Cashier POS is ALIVE on http://localhost:5173

:pos_done

:: 3. CHECK & LAUNCH ADMIN BACK-OFFICE DASHBOARD (PORT 5177)
echo [3/5] Checking Admin Back-Office Dashboard on port 5177...
curl.exe -s -o nul --connect-timeout 1 http://127.0.0.1:5177/admin/
if %errorlevel% equ 0 goto dash_running
echo       Starting Admin Dashboard Back-Office on port 5177...
start "Askar Admin Dashboard - Port 5177" cmd /k "cd /d ""%ERP_DIR%askar-admin-dashboard"" && node start-dashboard.cjs"
ping 127.0.0.1 -n 3 >nul
goto dash_done

:dash_running
echo       Admin Dashboard is ALIVE on http://localhost:5177/admin/

:dash_done

:: 4. CHECK SUNMI TERMINAL VIA ADB
echo [4/5] Checking Sunmi Terminal via ADB...
set "ADB_PATH="
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set "ADB_PATH=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not defined ADB_PATH (
    where adb.exe >nul 2>&1
    if %errorlevel% equ 0 set "ADB_PATH=adb.exe"
)

if not defined ADB_PATH goto adb_missing

"%ADB_PATH%" devices 2>nul | findstr /C:"device" | findstr /V "List" >nul
if %errorlevel% neq 0 goto adb_no_device

echo       Smart POS Terminal detected via USB!
echo       Configuring reverse port forwards for 3000 and 5173...
"%ADB_PATH%" reverse tcp:3000 tcp:3000 >nul 2>&1
"%ADB_PATH%" reverse tcp:5173 tcp:5173 >nul 2>&1
echo       Launching POS app on device...
"%ADB_PATH%" shell am start -n com.retail.pos/.MainActivity >nul 2>&1
echo       Sunmi POS screen is ready!
goto adb_done

:adb_no_device
echo       [Note] No USB Android terminal detected. Operating in Wi-Fi LAN Mode.
goto adb_done

:adb_missing
echo       [Note] ADB not in standard path. Operating in Wi-Fi LAN Mode.

:adb_done

:: 5. LAUNCH WEB POS & ADMIN DASHBOARD IN BROWSER
echo [5/5] Launching Store Browser Interfaces...
start http://localhost:5173
start http://localhost:5177/admin/

echo.
echo =======================================================
echo   ALL SYSTEMS ONLINE AND READY:
echo   - Cashier POS Register:  http://localhost:5173
echo   - Admin Back-Office:     http://localhost:5177/admin/
echo   - Backend Bridge API:    http://localhost:3000
echo   - WebSocket Event Bus:   ws://localhost:3000/ws
echo   - Manager PIN:           9999
echo =======================================================
echo.
echo Leave the service windows open in the background.
ping 127.0.0.1 -n 6 >nul
exit
