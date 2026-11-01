@echo off
title Askar Supermarket - Master Back-Office PC
cls
echo ========================================================
echo       ASKAR SUPERMARKET - MASTER BACK-OFFICE PC
echo ========================================================
echo.
echo [1/3] Detecting Local Wi-Fi IPv4 Address...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
echo Current Local IP:%IP%
echo.
echo [2/3] Initializing Central SQLite Database...
call npx prisma db update
echo.
echo [3/3] Starting Fastify Sync Server (Listening on 0.0.0.0:3000)...
start "Fastify Master Sync Engine" cmd /k "node server.js"
echo.
echo Starting Web Dashboard (Listening on 0.0.0.0:5173)...
start "Back-Office Manager Web UI" cmd /k "npx vite --port 5173 --host 0.0.0.0"
timeout /t 2 /nobreak >nul
start http://localhost:5173/?view=dashboard
echo.
echo ========================================================
echo   Master Back-Office PC is now ACTIVE!
echo.
echo   Local Dashboard:   http://localhost:5173/?view=dashboard
echo   Network Dashboard: http:%IP%:5173/?view=dashboard
echo.
echo   Point your SUNMI POS terminal to:
echo   http:%IP%:3000
echo ========================================================
echo.
pause
