@echo off
cd /d "%~dp0\.."
call SETUP_PM2_BACKGROUND_SERVICE.bat
exit /b %errorlevel%
