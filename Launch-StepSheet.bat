@echo off
title StepSheet Workbench Launcher
echo ===================================================
echo   StepSheet - Open-Source Data Workbench
echo ===================================================
echo.

REM Cache-busting query string: appending ?v=<unique> makes every launch a
REM distinct URL in the browser's eyes, so it can't silently serve a
REM disk-cached copy of StepSheet.html from an earlier launch even if the
REM file on disk has since changed.
set CACHEBUST=%RANDOM%%RANDOM%%TIME:~6,2%%TIME:~9,2%
set CACHEBUST=%CACHEBUST: =0%

if exist "%~dp0StepSheet.html" (
    echo Opening standalone StepSheet.html ^(build dated:^)
    for %%F in ("%~dp0StepSheet.html") do echo   %%~tF
    echo.
    start "" "%~dp0StepSheet.html?v=%CACHEBUST%"
) else (
    echo Building StepSheet.html...
    cd /d "%~dp0apps\web"
    call npm run build:singlefile
    for %%F in ("%~dp0StepSheet.html") do echo   Built: %%~tF
    start "" "%~dp0StepSheet.html?v=%CACHEBUST%"
)
