# Cloudflare Tunnel setup for MMK1000 Panel (bn9.app)

## PowerShell commands (copy/paste)

```powershell
cloudflared tunnel login
cloudflared tunnel create mmk1000-panel

# pick the generated tunnel credentials file
$cred = Get-ChildItem "$env:USERPROFILE\.cloudflared\*.json" | Select-Object -First 1
$cfgPath = "$env:USERPROFILE\.cloudflared\config.yml"

@"
tunnel: mmk1000-panel
credentials-file: $($cred.FullName)
ingress:
  - hostname: mmk1000.bn9.app
    service: http://localhost:4100
  - service: http_status:404
"@ | Set-Content -Encoding UTF8 $cfgPath

cloudflared tunnel route dns mmk1000-panel mmk1000.bn9.app
cloudflared tunnel --config "$env:USERPROFILE\.cloudflared\config.yml" run mmk1000-panel
```

## Quick curl checks

```powershell
curl http://localhost:4100/ -I
curl http://localhost:4100/api/health

curl --ssl-no-revoke https://mmk1000.bn9.app/ -I
curl --ssl-no-revoke https://mmk1000.bn9.app/api/health
```
