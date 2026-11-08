@echo off
cd /d "%~dp0"
call start_supervisor.bat
exit /b %ERRORLEVEL%
