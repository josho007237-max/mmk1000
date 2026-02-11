@echo off
cd /d C:\Users\ADMIN\MMK1000
if not exist logs mkdir logs
echo [validate] %date% %time% >> .\logs\cloudflared.log
cloudflared tunnel ingress validate >> .\logs\cloudflared.log 2>&1
echo [run] %date% %time% >> .\logs\cloudflared.log
cloudflared tunnel run mmk1000 >> .\logs\cloudflared.log 2>&1
