@echo off
cd /d "%~dp0"

:: 1. Run instant check on watched Excel files (exits in 50ms if unchanged)
"C:\Python314\python.exe" sales_watcher.py --check

:: 2. Ensure live background daemon is also running
tasklist /FI "IMAGENAME eq pythonw.exe" 2>NUL | find /I /N "pythonw.exe" >NUL
if "%ERRORLEVEL%"=="1" (
    start "" /b "C:\Python314\pythonw.exe" sales_watcher.py
)

exit /b 0
