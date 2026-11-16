@echo off
title ASKAR SUPERMARKET - MASTER SYSTEM LAUNCHER
color 0A
cls

echo ====================================================================
echo   ASKAR SUPERMARKET ERP - MASTER CONTROLLER & 0ms POS ENGINE
echo   Compliant with Bahrain NBR VAT Regulations (Article 53)
echo ====================================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js 20+ from https://nodejs.org
    pause
    exit /b 1
)

:: 2. Ensure working directory is project root
cd /d "%~dp0"

echo [1/3] Activating Windows 24/7 Keep-Awake Retail Power Profile...
powercfg /change standby-timeout-ac 0 >nul 2>nul
powercfg /change monitor-timeout-ac 0 >nul 2>nul

echo [2/3] Launching Master Fastify POS Server (Port 3000)...
start "Askar POS Master Server" /min cmd /c "node pos-mvp/server.js"

echo Waiting for server to initialize...
timeout /t 3 /nobreak >nul

echo [3/3] Opening Askar POS in Dedicated App Mode...
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if exist %CHROME_PATH% (
    start "" %CHROME_PATH% --app=http://localhost:3000 --start-maximized
) else (
    start http://localhost:3000
)

echo.
echo ====================================================================
echo   SYSTEM READY & OPERATIONAL!
echo   ------------------------------------------------------------
echo   Local Terminal (Main Counter):  http://localhost:3000
echo   Handhelds / Sunmi Terminals:    http://192.168.8.7:3000
echo   Manager Back-Office:            http://192.168.8.7:3000/admin/
echo   Cloudflare Failover Edge:       https://askar-edge-api.layali-askar-pos.workers.dev
echo ====================================================================
echo.
echo Leave this window open or minimize it. Do not close unless shutting down for the night.
pause
