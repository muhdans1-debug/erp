@echo off
title Askar Supermarket ERP - Fast Launch
color 0A

echo =======================================================
echo     ASKAR SUPERMARKET POS ^& AI ERP - ONE-CLICK LAUNCH
echo =======================================================
echo.

cd /d "%~dp0"

:: 1. CHECK UNIFIED BACKEND & WS EVENT BUS (PORT 3000)
echo [1/4] Checking Unified Fastify Backend & WS Bus on port 3000...
netstat -ano | findstr :3000 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo       Unified Backend is already running on http://localhost:3000
) else (
    echo       Starting Unified Backend Server (REST + WebSocket /ws)...
    start "Askar ERP Backend (Fastify + WS)" cmd /c "cd /d %~dp0pos-mvp && npm run server"
    ping 127.0.0.1 -n 3 >nul
)

:: 2. CHECK VITE DEV SERVER (PORT 5173)
echo [2/4] Checking Vite Frontend on port 5173...
netstat -ano | findstr :5173 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo       Vite Frontend is already running on http://localhost:5173
) else (
    echo       Starting Vite Frontend in background...
    start "Askar POS Frontend (Vite)" cmd /c "cd /d %~dp0pos-mvp && npm run dev:web"
    ping 127.0.0.1 -n 3 >nul
)

:: 3. CHECK SUNMI TERMINAL VIA ADB
echo [3/4] Checking Sunmi Terminal via ADB...
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
echo       Configuring reverse port forwards (3000, 5173)...
"%ADB_PATH%" reverse tcp:3000 tcp:3000
"%ADB_PATH%" reverse tcp:5173 tcp:5173
echo       Launching POS app on device...
"%ADB_PATH%" shell am start -n com.retail.pos/.MainActivity >nul 2>&1
echo       Sunmi POS screen is ready!

:skip_adb

:: 4. OPEN DESKTOP BROWSER
echo [4/4] Opening Web POS / Dashboard...
start http://localhost:5173

echo.
echo =======================================================
echo   SYSTEM IS READY:
echo   - Local POS:        http://localhost:5173
echo   - Unified Backend:  http://localhost:3000
echo   - WebSocket Bus:    ws://localhost:3000/ws
echo   - Admin Dashboard:  http://localhost:5175
echo   - Khata PWA:        http://localhost:5174
echo   - Manager PIN:      9999
echo =======================================================
echo.
ping 127.0.0.1 -n 6 >nul
exit
