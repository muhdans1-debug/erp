@echo off
title Askar Supermarket ERP - Fast Launch
color 0A

echo =======================================================
echo     ASKAR SUPERMARKET POS ^& AI ERP - ONE-CLICK LAUNCH
echo =======================================================
echo.

cd /d "%~dp0"

:: 0. ENSURE CONFIGURATION & DEPENDENCIES EXIST
if not exist "%~dp0pos-mvp\.env" (
    if exist "%~dp0pos-mvp\.env.example" (
        echo [INFO] pos-mvp/.env not found. Initializing from .env.example...
        copy "%~dp0pos-mvp\.env.example" "%~dp0pos-mvp\.env" >nul
    ) else if exist "%~dp0.env.example" (
        copy "%~dp0.env.example" "%~dp0pos-mvp\.env" >nul
    )
)

if not exist "%~dp0pos-mvp\node_modules" (
    echo [INFO] First time launch detected. Installing dependencies...
    call npm install --no-audit --prefer-offline
)

:: 0B. ENFORCE 24/7 SERVER MODE (PREVENT LAPTOP SLEEP & LID CLOSE SUSPEND)
echo [0/5] Enforcing 24/7 Store Server Mode (Preventing Laptop Sleep)...
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-dc 0 >nul 2>&1
powercfg /change hibernate-timeout-dc 0 >nul 2>&1
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 >nul 2>&1
powercfg /setdcvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 >nul 2>&1
powercfg /setactive SCHEME_CURRENT >nul 2>&1
echo       Laptop sleep and lid suspend are DISABLED. System will stay online 24/7.

:: 1. CHECK UNIFIED BACKEND & WS EVENT BUS (PORT 3000)
echo [1/5] Checking Unified Fastify Backend & WS Bus on port 3000...
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo       Unified Backend is already running on http://localhost:3000
) else (
    echo       Starting Unified Backend Server (REST + WebSocket /ws)...
    start "Askar ERP Backend (Fastify + WS)" cmd /c "cd /d %~dp0pos-mvp && npm run server"
    ping 127.0.0.1 -n 3 >nul
)

:: 2. CHECK VITE FRONTEND POS (PORT 5173)
echo [2/5] Checking Vite Frontend POS on port 5173...
netstat -ano | findstr :5173 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo       Vite POS Frontend is already running on http://localhost:5173
) else (
    echo       Starting Vite POS Frontend in background...
    start "Askar POS Frontend (Vite)" cmd /c "cd /d %~dp0pos-mvp && npm run dev:web"
    ping 127.0.0.1 -n 3 >nul
)

:: 3. CHECK ADMIN BACKOFFICE DASHBOARD (PORT 5177)
echo [3/5] Checking Admin Back-Office Dashboard on port 5177...
netstat -ano | findstr :5177 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo       Admin Dashboard is already running on http://localhost:5177
) else (
    echo       Starting Admin Dashboard Back-Office...
    start "Askar Admin Dashboard" cmd /c "cd /d %~dp0askar-admin-dashboard && npm run dev"
    ping 127.0.0.1 -n 2 >nul
)

:: 4. CHECK SUNMI / ANDROID SMART POS VIA ADB (PORTABLE DETECTION)
echo [4/5] Checking Sunmi/F100 Terminal via ADB...
set ADB_PATH=
if exist "%~dp0platform-tools\adb.exe" set ADB_PATH=%~dp0platform-tools\adb.exe
if not defined ADB_PATH (
    where adb.exe >nul 2>&1
    if %errorlevel% equ 0 set ADB_PATH=adb.exe
)
if not defined ADB_PATH (
    if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set ADB_PATH=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
)
if not defined ADB_PATH (
    if exist "C:\platform-tools\adb.exe" set ADB_PATH=C:\platform-tools\adb.exe
)

if not defined ADB_PATH goto skip_adb
if not exist "%ADB_PATH%" goto skip_adb

"%ADB_PATH%" devices 2>nul | findstr /R "device$" >nul
if %errorlevel% neq 0 (
    echo       [Note] No USB Android POS terminal detected. (LAN/Wi-Fi mode active).
    goto skip_adb
)
echo       Smart POS Terminal detected via USB!
echo       Configuring reverse port forwards (3000, 5173)...
"%ADB_PATH%" reverse tcp:3000 tcp:3000
"%ADB_PATH%" reverse tcp:5173 tcp:5173
echo       Launching POS app on device...
"%ADB_PATH%" shell am start -n com.retail.pos/.MainActivity >nul 2>&1
echo       Smart POS screen is ready!

:skip_adb

:: 5. OPEN DESKTOP BROWSER
echo [5/5] Opening Web POS / Dashboard...
start http://localhost:5173
start http://localhost:5177

echo.
echo =======================================================
echo   SYSTEM IS READY:
echo   - Local POS Register: http://localhost:5173
echo   - Admin Back-Office:  http://localhost:5177
echo   - Unified Backend:    http://localhost:3000
echo   - WebSocket Bus:      ws://localhost:3000/ws
echo   - Manager PIN:        9999
echo =======================================================
echo.
ping 127.0.0.1 -n 6 >nul
exit
