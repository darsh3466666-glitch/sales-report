@echo off
cd /d "%~dp0"
"C:\Python314\python.exe" watcher_supervisor.py
exit /b %ERRORLEVEL%
