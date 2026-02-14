@echo off
setlocal EnableDelayedExpansion
cd /d C:\Users\ADMIN\MMK1000

if not exist "C:\Users\ADMIN\MMK1000\logs" mkdir "C:\Users\ADMIN\MMK1000\logs"

set RUNLOG=C:\Users\ADMIN\MMK1000\logs\run-all.log
set NODELOG=C:\Users\ADMIN\MMK1000\logs\node.log
set CFLOG=C:\Users\ADMIN\MMK1000\logs\cloudflared.log
set CLOUD=C:\Program Files (x86)\cloudflared\cloudflared.exe

echo [run-all start] %date% %time%>> "%RUNLOG%"
echo [run-all start] %date% %time%>> "%CFLOG%"
echo [run-all start] %date% %time%>> "%NODELOG%"

netstat -ano | findstr /R /C:":4100 .*LISTENING" >nul
if %ERRORLEVEL%==0 (
  echo [node] already listening on :4100 >> "%RUNLOG%"
  echo [node] already listening on :4100 >> "%NODELOG%"
) else (
  echo [node] start %date% %time% >> "%RUNLOG%"
  echo [node] start %date% %time% >> "%NODELOG%"
  start "" /b cmd /c "cd /d C:\Users\ADMIN\MMK1000 && node src\server.mjs >> ""%NODELOG%"" 2>&1"
)

tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | find /I "cloudflared.exe" >nul
if %ERRORLEVEL%==0 (
  echo [cloudflared] already running >> "%RUNLOG%"
  echo [cloudflared] already running >> "%CFLOG%"
) else (
  echo [cloudflared] start %date% %time% >> "%RUNLOG%"
  echo [cloudflared] start %date% %time% >> "%CFLOG%"
  start "" /b cmd /c ""!CLOUD!" --config "%USERPROFILE%\.cloudflared\config.yml" tunnel run mmk1000 >> "%CFLOG%" 2>&1"
)

endlocal
