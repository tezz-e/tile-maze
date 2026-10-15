@echo off
echo ========================================================
echo   TILTMAZE: Windows Firewall Rule Configuration
echo ========================================================
echo This script allows incoming TCP connections on port 3000
echo so your phone can reach the local WebSocket relay.
echo.
netsh advfirewall firewall add rule name="Tiltmaze Game Server (Port 3000)" dir=in action=allow protocol=TCP localport=3000
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Firewall rule added successfully for port 3000.
) else (
    echo [WARNING] Administrator permissions may be required. Run this script as Administrator if it failed.
)
pause
