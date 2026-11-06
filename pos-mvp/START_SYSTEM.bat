@echo off
cd /d "%~dp0\.."
call START_SYSTEM.bat
exit /b %errorlevel%
