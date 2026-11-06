@echo off
:: Self-elevation to Administrator prompt (UAC)
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process '%~f0' -Verb runAs"
    exit /b
)

title Askar POS Firewall & Network Setup
echo ========================================================
echo   CONFIGURING WINDOWS FIREWALL FOR ASKAR POS LAN SYNC
echo ========================================================
echo.

:: 1. Inbound rules for Fastify Backend (Port 3000 TCP and UDP)
netsh advfirewall firewall delete rule name="Askar POS Server (Port 3000 TCP)" >nul 2>&1
netsh advfirewall firewall add rule name="Askar POS Server (Port 3000 TCP)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1

netsh advfirewall firewall delete rule name="Askar POS Server (Port 3000 UDP)" >nul 2>&1
netsh advfirewall firewall add rule name="Askar POS Server (Port 3000 UDP)" dir=in action=allow protocol=UDP localport=3000 profile=any >nul 2>&1
echo [OK] Port 3000 (Fastify API - TCP/UDP) allowed through Windows Firewall.

:: 2. Inbound rules for Hardware / NFC Bridge (Port 8080 TCP and UDP)
netsh advfirewall firewall delete rule name="Askar POS Bridge (Port 8080 TCP)" >nul 2>&1
netsh advfirewall firewall add rule name="Askar POS Bridge (Port 8080 TCP)" dir=in action=allow protocol=TCP localport=8080 profile=any >nul 2>&1

netsh advfirewall firewall delete rule name="Askar POS Bridge (Port 8080 UDP)" >nul 2>&1
netsh advfirewall firewall add rule name="Askar POS Bridge (Port 8080 UDP)" dir=in action=allow protocol=UDP localport=8080 profile=any >nul 2>&1
echo [OK] Port 8080 (WebSocket Hub - TCP/UDP) allowed through Windows Firewall.

:: 3. Inbound rules for Admin Dashboard (Port 5177 TCP)
netsh advfirewall firewall delete rule name="Askar Admin Dashboard (Port 5177 TCP)" >nul 2>&1
netsh advfirewall firewall add rule name="Askar Admin Dashboard (Port 5177 TCP)" dir=in action=allow protocol=TCP localport=5177 profile=any >nul 2>&1
echo [OK] Port 5177 (Admin Dashboard - TCP) allowed through Windows Firewall.

:: 4. Switch network connection profiles to Private for device discovery
powershell -Command "Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private" >nul 2>&1
echo [OK] Network adapters switched to Private profile for local device discovery.

echo.
echo ========================================================
echo   SETUP COMPLETED SUCCESSFULLY!
echo ========================================================
echo.
echo All Sunmi and Feitian POS terminals on your Wi-Fi router
echo can now connect to this computer on port 3000.
echo.
pause

