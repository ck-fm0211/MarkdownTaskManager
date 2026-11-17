@echo off
rem Markdown Task Manager - npm run tasks -- check
rem Double-click or run from a terminal. Extra arguments are passed through.
setlocal
cd /d "%~dp0..\.."
call npm run tasks -- check %*
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" echo.& echo [NG] npm run tasks -- check failed (exit code %ERR%)
if "%MTM_NO_PAUSE%"=="" pause
exit /b %ERR%
