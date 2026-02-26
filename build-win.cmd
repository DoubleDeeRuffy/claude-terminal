@echo off
cd /d "%~dp0"

echo Building renderer...
call npm.cmd run build:renderer
if errorlevel 1 (
    echo build:renderer failed!
    pause
    exit /b 1
)

echo Building Windows installer...
call npm.cmd run build:win
if errorlevel 1 (
    echo build:win failed!
    pause
    exit /b 1
)

echo Build complete!
pause