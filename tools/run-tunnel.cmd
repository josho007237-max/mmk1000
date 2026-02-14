@echo off
setlocal
cd /d C:\Users\ADMIN\MMK1000
if not exist "C:\Users\ADMIN\MMK1000\logs" mkdir "C:\Users\ADMIN\MMK1000\logs"

set CLOUD=C:\Program Files (x86)\cloudflared\cloudflared.exe
set LOG=C:\Users\ADMIN\MMK1000\logs\cloudflared.log
set URL=https://mmk1000.bn9.app/api/health

echo [start] %date% %time%>> "%LOG%"
echo [config] %USERPROFILE%\.cloudflared\config.yml>> "%LOG%"
echo [tasklist] %date% %time%>> "%LOG%"
tasklist /FI "IMAGENAME eq cloudflared.exe" >> "%LOG%" 2>&1

echo [health] %date% %time% url=%URL%>> "%LOG%"
set CODE=000
for /f %%i in ('curl.exe --ssl-no-revoke -s -o NUL -w "%%{http_code}" "%URL%"') do set CODE=%%i
echo health_code=%CODE% >> "%LOG%"
if "%CODE%"=="200" (
  echo health ok, exit >> "%LOG%"
  exit /b 0
)

echo [validate] %date% %time%>> "%LOG%"
"%CLOUD%" --config "%USERPROFILE%\.cloudflared\config.yml" tunnel ingress validate >> "%LOG%" 2>&1

echo [run] %date% %time%>> "%LOG%"
start "" /b cmd /c ""%CLOUD%" --config "%USERPROFILE%\.cloudflared\config.yml" tunnel run mmk1000 >> "%LOG%" 2>&1"
echo started background >> "%LOG%"
endlocal
