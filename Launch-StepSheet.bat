@echo off
title StepSheet Workbench Launcher
echo ===================================================
echo   StepSheet - Open-Source Data Workbench
echo ===================================================
echo.
if exist "%~dp0StepSheet.html" (
    echo Opening standalone StepSheet.html in your default browser...
    start "" "%~dp0StepSheet.html"
) else (
    echo Building StepSheet.html...
    cd /d "%~dp0apps\web"
    call npm run build:singlefile
    start "" "%~dp0StepSheet.html"
)
