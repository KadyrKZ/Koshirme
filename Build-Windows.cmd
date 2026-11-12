@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\apps\student-desktop\scripts\build-windows.ps1"
if errorlevel 1 (
 echo Build failed. See the error above.
 pause
 exit /b 1
)
echo Build completed. See apps\student-desktop\release
pause
