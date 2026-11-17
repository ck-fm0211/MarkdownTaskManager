@echo off
rem Markdown Task Manager - source backup (same as npm run backup)
rem Double-click or run from a terminal. Extra arguments are passed through.
rem Runs Node directly, so a backup can be made even while package.json is being edited
rem (npm itself refuses to start with a broken package.json).
setlocal
cd /d "%~dp0..\.."
node scripts\backup.mjs %*
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" goto done
echo.
echo [NG] backup failed - exit code %ERR%
:done
if "%MTM_NO_PAUSE%"=="" pause
exit /b %ERR%
