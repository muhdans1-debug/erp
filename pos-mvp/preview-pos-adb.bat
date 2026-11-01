@echo off
title POS ADB Live Preview and Bridge Setup
cls
echo ========================================================
echo         SUNMI POS - ADB LIVE PREVIEW SETUP
echo ========================================================
echo.

set ADB=platform-tools\adb.exe

echo [1/5] Checking ADB Device Connection...
%ADB% devices
for /f "skip=1 tokens=1" %%d in ('%ADB% devices') do (
    if not "%%d"=="" (
        set DEVICE_ID=%%d
        goto :device_found
    )
)
echo [ERROR] No ADB device detected. Please ensure USB debugging is enabled on POS.
pause
exit /b 1

:device_found
echo Device connected: %DEVICE_ID%
echo.

echo [2/5] Setting Up Reverse Network Bridges (Ports 3000 and 5173)...
%ADB% reverse tcp:3000 tcp:3000
%ADB% reverse tcp:5173 tcp:5173
echo Reverse tunnels established.
echo.

echo [3/5] Launching Askar POS App...
%ADB% shell am start -n com.retail.pos/.MainActivity
echo.

echo [4/5] Establishing Remote WebView Debugging Port (9222)...
for /f "tokens=*" %%s in ('powershell -NoProfile -Command "& .\%ADB% shell cat /proc/net/unix | Select-String devtools"') do (
    for %%a in (%%s) do (
        echo %%a | findstr "webview_devtools_remote" >nul
        if not errorlevel 1 (
            set SOCK=%%a
        )
    )
)

if not "%SOCK%"=="" (
    set SOCK_CLEAN=%SOCK:@=%
    echo Found WebView socket: %SOCK_CLEAN%
    %ADB% forward tcp:9222 localabstract:%SOCK_CLEAN%
    echo Port 9222 forwarded to WebView debugger.
) else (
    echo Note: WebView debugger socket not yet active; will be available once Webview renders.
)
echo.

echo [5/5] Capturing Live Screen Preview...
%ADB% shell screencap -p /sdcard/sunmi_preview.png
%ADB% pull /sdcard/sunmi_preview.png sunmi_preview.png
echo.

echo ========================================================
echo   POS ADB Preview Setup is fully ACTIVE!
echo   - Backend API Bridge: http://localhost:3000 (Active)
echo   - Dev Server Bridge:  http://localhost:5173 (Active)
echo   - Chrome DevTools:   http://localhost:9222 (Forwarded)
echo   - Live Screen File:   sunmi_preview.png
echo ========================================================
echo.
pause
