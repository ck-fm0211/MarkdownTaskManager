@echo off
rem Markdown Task Manager - npm run build-deploy
rem Double-click or run from a terminal. Extra arguments are passed through.
setlocal
cd /d "%~dp0..\.."
call npm run build-deploy -- %*
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" goto done
echo.
echo [NG] npm run build-deploy failed - exit code %ERR%
:done
if "%MTM_NO_PAUSE%"=="" pause
exit /b %ERR%
