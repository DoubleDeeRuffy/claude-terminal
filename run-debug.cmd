@echo off
cd /d "%~dp0"

echo Building renderer...
call npm.cmd run build:renderer
if errorlevel 1 (
    echo build:renderer failed!
    pause
    exit /b 1
)

echo Starting in debug...
call npm start -- --dev
if errorlevel 1 (
    echo build:starting failed!
    pause
    exit /b 1
)

echo run complete!