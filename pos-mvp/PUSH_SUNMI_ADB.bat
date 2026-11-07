@echo off
title Push Sunmi Updates via ADB
echo ========================================================
echo   ASKAR ERP - Push Sunmi Updates via ADB
echo ========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push_sunmi_adb.ps1" %*
pause

