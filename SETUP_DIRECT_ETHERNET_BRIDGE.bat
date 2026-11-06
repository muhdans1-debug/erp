@echo off
:: Self-elevation to Administrator prompt (UAC)
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process '%~f0' -Verb runAs"
    exit /b
)

title Askar POS Direct RJ45 Ethernet Setup
echo ========================================================
echo   CONFIGURING LAPTOP DIRECT RJ45 ETHERNET TO SUNMI
echo ========================================================
echo.

:: 1. Identify Ethernet adapter name
echo [1/3] Detecting Ethernet adapter on laptop...
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.PhysicalMediaType -match '802.3' -or $_.Name -match 'Ethernet' } | Select-Object -ExpandProperty Name -First 1"') do set ETH_NAME=%%i

if not defined ETH_NAME set ETH_NAME=Ethernet
echo       Found Ethernet adapter: "%ETH_NAME%"

:: 2. Set Static IP 192.168.88.10 on Laptop Ethernet
echo [2/3] Setting Static IP 192.168.88.10 (Subnet: 255.255.255.0)...
netsh interface ip set address name="%ETH_NAME%" static 192.168.88.10 255.255.255.0 >nul 2>&1

:: 3. Set profile to Private and open firewall
echo [3/3] Opening Firewall for Ports 3000, 5177, 8080...
netsh advfirewall firewall delete rule name="Askar Direct Ethernet (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="Askar Direct Ethernet (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1
netsh advfirewall firewall delete rule name="Askar Direct Ethernet (Port 8080)" >nul 2>&1
netsh advfirewall firewall add rule name="Askar Direct Ethernet (Port 8080)" dir=in action=allow protocol=TCP localport=8080 profile=any >nul 2>&1

powershell -Command "Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -match 'Ethernet' } | Set-NetConnectionProfile -NetworkCategory Private" >nul 2>&1

echo.
echo ========================================================
echo   LAPTOP RJ45 DIRECT ETHERNET IS NOW ACTIVE!
echo.
echo   Laptop IP:   192.168.88.10
echo   Subnet:      255.255.255.0
echo   Sunmi IP:    192.168.88.20
echo.
echo   NFC taps on the Sunmi will now stream instantly
echo   across the Ethernet cable directly into your Back-Office!
echo ========================================================
echo.
pause
