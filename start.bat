@echo off
setlocal
echo ========================================================
echo   TILTMAZE: KINETIC EDITION - Windows Startup
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [1/3] Installing dependencies...
    call npm.cmd install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b %ERRORLEVEL%
    )
) else (
    echo [1/3] Dependencies found.
)

echo [2/3] Building packages and game client...
call npm.cmd run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo [3/3] Launching server on http://localhost:3000...
start http://localhost:3000
node server/dist/index.js

endlocal
