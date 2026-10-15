@echo off
echo ========================================================
echo   TILTMAZE: KINETIC EDITION - 1-Click Startup
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Building Protocol Package...
call npm.cmd --workspace=packages/protocol run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Protocol build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo [2/3] Building Game Client...
call npm.cmd --workspace=game run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Game build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo [3/3] Launching WebSocket Relay Server and Static Host...
start http://localhost:3000
call npm.cmd --workspace=server start
