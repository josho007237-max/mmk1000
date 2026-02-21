# RUNBOOK_SMOKE

## 1) Local smoke
```powershell
$env:MMK_BASE = "http://127.0.0.1:4100"
$env:ADMIN_KEY = "mmk1000"
node .\scripts\smoke.mjs
```

## 2) Guard smoke (withdraw/send)
```powershell
$env:MMK_BASE = "http://127.0.0.1:4100"
$env:ADMIN_KEY = "mmk1000"
node .\scripts\guard-smoke.mjs
```

## 3) Real preflight
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\tmn-preflight-real.ps1
```

## 4) Verify admin queue auth
```powershell
curl.exe -sS -H "x-admin-key: $env:ADMIN_KEY" "$env:MMK_BASE/api/withdraw/queue"
```

## 5) Cloudflared 502 troubleshooting
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\fix-cloudflared-port.ps1 -Hostname mmk1000.bn9.app -ExpectedOriginUrl http://127.0.0.1:4100
```

## 6) NSSM/Cloudflared service + error log
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-cloudflared-service.ps1 -Action status
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-cloudflared-service.ps1 -Action restart
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-cloudflared-service.ps1 -Action logs
```

> Source: imported from attached project handoff document.
