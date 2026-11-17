@echo off
rem Markdown Task Manager - npm run test:unit
rem Double-click or run from a terminal. Extra arguments are passed through.
setlocal
cd /d "%~dp0..\.."
call npm run test:unit -- %*
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" echo.& echo [NG] npm run test:unit failed (exit code %ERR%)
if "%MTM_NO_PAUSE%"=="" pause
exit /b %ERR%
