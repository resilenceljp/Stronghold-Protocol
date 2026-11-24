@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
set "PORT=3002"
set "HOST=127.0.0.1"
call "%~dp0scripts\start-windows.bat" %*
exit /b %ERRORLEVEL%
