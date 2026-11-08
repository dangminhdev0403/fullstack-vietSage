@echo off
chcp 65001 >nul
title Deploy VPS VietSage (72.62.69.172)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-vps.ps1" %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Deployment failed with exit code %ERRORLEVEL%!
)
echo.
pause
exit /b %ERRORLEVEL%
