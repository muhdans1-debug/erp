@echo off
cd /d "%~dp0\.."
call SETUP_STORE_LAPTOP.bat
exit /b %errorlevel%
