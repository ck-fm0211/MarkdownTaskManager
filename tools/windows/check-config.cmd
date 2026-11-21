@echo off
rem Markdown Task Manager - npm run config:check
rem Double-click or run from a terminal. Extra arguments are passed through.
setlocal
cd /d "%~dp0..\.."
call npm run config:check -- %*
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" goto done
echo.
echo [NG] npm run config:check failed - exit code %ERR%
:done
if "%MTM_NO_PAUSE%"=="" pause
exit /b %ERR%
