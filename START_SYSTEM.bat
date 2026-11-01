@echo off
title Askar Supermarket ERP - Fast Launch
color 0A

echo =======================================================
echo     ASKAR SUPERMARKET POS ^& AI ERP - ONE-CLICK LAUNCH
echo =======================================================
echo.

cd /d "%~dp0"

:: 1. CHECK LOCAL RJ45 UI BRIDGE (PORT 8080)
echo [1/5] Checking Local RJ45 Bridge on port 8080...
netstat -ano | findstr :8080 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo       RJ45 Bridge is already running on ws://0.0.0.0:8080
) else (
    echo       Starting Local RJ45 Bridge in background...
    start "Askar Local RJ45 Bridge" cmd /c "cd /d %~dp0askar-local-bridge && node server.js"
    ping 127.0.0.1 -n 2 >nul
)

:: 2. CHECK BACKEND (PORT 3000)
echo [2/5] Checking Fastify Backend on port 3000...
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo       Backend is already running on http://localhost:3000
) else (
    echo       Starting Backend Server in background...
    start "Askar ERP Backend (Fastify)" cmd /c "cd /d %~dp0pos-mvp && npm run server"
    ping 127.0.0.1 -n 3 >nul
)

:: 3. CHECK VITE DEV SERVER (PORT 5173)
echo [3/5] Checking Vite Frontend on port 5173...
netstat -ano | findstr :5173 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo       Vite Frontend is already running on http://localhost:5173
) else (
    echo       Starting Vite Frontend in background...
    start "Askar POS Frontend (Vite)" cmd /c "cd /d %~dp0pos-mvp && npm run dev:web"
    ping 127.0.0.1 -n 3 >nul
)

:: 4. CHECK SUNMI TERMINAL VIA ADB
echo [4/5] Checking Sunmi Terminal via ADB...
set ADB_PATH=C:\Users\ACER\Downloads\platform-tools-latest-windows\platform-tools\adb.exe
if not exist "%ADB_PATH%" (
    where adb.exe >nul 2>&1
    if %errorlevel% equ 0 set ADB_PATH=adb.exe
)

if not exist "%ADB_PATH%" goto skip_adb
"%ADB_PATH%" devices 2>nul | findstr /R "device$" >nul
if %errorlevel% neq 0 (
    echo       [Note] No USB Sunmi device detected. Plug in USB if needed.
    goto skip_adb
)
echo       Sunmi D2mini detected!
echo       Configuring reverse port forwards (3000, 5173, 8080)...
"%ADB_PATH%" reverse tcp:3000 tcp:3000
"%ADB_PATH%" reverse tcp:5173 tcp:5173
"%ADB_PATH%" reverse tcp:8080 tcp:8080
echo       Launching POS app on device...
"%ADB_PATH%" shell am start -n com.retail.pos/.MainActivity >nul 2>&1
echo       Sunmi POS screen is ready!

:skip_adb

:: 5. OPEN DESKTOP BROWSER
echo [5/5] Opening Web POS / Dashboard...
start http://localhost:5173

echo.
echo =======================================================
echo   SYSTEM IS READY:
echo   - Local POS:        http://localhost:5173
echo   - Local Backend:    http://localhost:3000
echo   - RJ45 UI Bridge:   ws://192.168.88.10:8080
echo   - Admin Dashboard:  http://localhost:5175
echo   - Khata PWA:        http://localhost:5174
echo   - Manager PIN:      9999
echo =======================================================
echo.
ping 127.0.0.1 -n 6 >nul
exit
