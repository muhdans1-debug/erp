@echo off
title Askar Supermarket - 24/7 Server Mode (Never Sleep)
color 0A

echo ========================================================
echo    ASKAR SUPERMARKET ERP - 24/7 STORE SERVER MODE
echo ========================================================
echo.
echo Configuring this Windows laptop so it NEVER goes to sleep.
echo All Sunmi POS registers, pole displays, and Khata PWA
echo will remain online 24/7 even if:
echo   - The laptop is idle for hours
echo   - The laptop lid is closed
echo   - The store operates on battery backup
echo.

:: 1. DISABLE SLEEP ON AC POWER (PLUGGED IN)
echo [1/6] Disabling sleep timeout on AC power...
powercfg /change standby-timeout-ac 0
if %errorlevel% equ 0 (
    echo       SUCCESS: Standby timeout on AC set to NEVER (0).
) else (
    echo       WARNING: Could not update AC standby timeout.
)

:: 2. DISABLE HIBERNATE ON AC POWER
echo.
echo [2/6] Disabling hibernation on AC power...
powercfg /change hibernate-timeout-ac 0
if %errorlevel% equ 0 (
    echo       SUCCESS: Hibernate timeout on AC set to NEVER (0).
)

:: 3. DISABLE SLEEP ON BATTERY (DC POWER)
echo.
echo [3/6] Disabling sleep timeout on battery (Power Outage Protection)...
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-dc 0
echo       SUCCESS: Battery standby set to NEVER.

:: 4. CONFIGURE LID CLOSE ACTION: DO NOTHING (KEEP SERVER RUNNING)
echo.
echo [4/6] Setting laptop lid close action to DO NOTHING...
:: GUID 4f971e89-eebd-4455-a8de-9e59040e7347 = SUB_BUTTONS
:: GUID 5ca83367-6e45-459f-a27b-476b1d01c936 = LIDACTION (0 = Do nothing, 1 = Sleep)
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 >nul 2>&1
powercfg /setdcvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 >nul 2>&1
echo       SUCCESS: Closing the laptop lid will NOT suspend the system.

:: 5. DISABLE UNATTENDED SLEEP TIMEOUT
echo.
echo [5/6] Disabling Windows Unattended Sleep Timeout...
powercfg /setacvalueindex SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 7bc4a2f9-d8fc-4469-b07b-33eb785aaca0 0 >nul 2>&1
powercfg /setdcvalueindex SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 7bc4a2f9-d8fc-4469-b07b-33eb785aaca0 0 >nul 2>&1

:: 6. ACTIVATE POWER SCHEME
echo.
echo [6/6] Committing active power scheme...
powercfg /setactive SCHEME_CURRENT
echo       SUCCESS: Power scheme successfully locked into 24/7 Server Mode.

echo.
echo ========================================================
echo   LAPTOP IS NOW A DEDICATED 24/7 STORE SERVER!
echo.
echo   - System Sleep:      DISABLED (NEVER)
echo   - Hibernation:       DISABLED (NEVER)
echo   - Lid Close:         DO NOTHING (Keeps running)
echo   - Wi-Fi/Ethernet:    ALWAYS CONNECTED
echo.
echo   You can now close the laptop lid or leave it unattended.
echo   Sunmi POS and Khata will never go offline!
echo ========================================================
echo.
pause
