# MMK1000 Quick Runbook

## Local Setup
```powershell
npm i
Copy-Item .env.example .env
# Edit .env locally with your own values. Never commit .env or .env.* files.
npm run dev
```

## Env (PowerShell)
Set the API base and admin key for smoke tests:
```
$env:MMK_BASE="http://127.0.0.1:4100"
$env:ADMIN_KEY="mmk1000"
```

## Quick Checks
Syntax check:
```
.\tools\check-syntax.ps1
```

Smoke test:
```
node .\scripts\smoke.mjs
```

## VPS SSH Quick Check (PowerShell)
Use the real Public IP from your VPS provider dashboard (do not use `x.x.x.x`).

```powershell
$VpsIPv4 = "<PUBLIC_IPV4_FROM_PROVIDER>"
$VpsIPv6 = "<PUBLIC_IPV6_FROM_PROVIDER>"   # optional
$VpsDomain = "<VPS_DOMAIN_OR_HOSTNAME>"    # optional
$SshPort = 22

# 1) Validate IPv4/IPv6 format before port checks
$ip4 = $null
if (-not [System.Net.IPAddress]::TryParse($VpsIPv4, [ref]$ip4)) {
  throw "Invalid IPv4: $VpsIPv4"
}

if ($VpsIPv6 -and $VpsIPv6 -ne "<PUBLIC_IPV6_FROM_PROVIDER>") {
  $ip6 = $null
  if (-not [System.Net.IPAddress]::TryParse($VpsIPv6, [ref]$ip6)) {
    throw "Invalid IPv6: $VpsIPv6"
  }
}

# 2) Port checks
Test-NetConnection -ComputerName $VpsIPv4 -Port $SshPort
if ($ip6) { Test-NetConnection -ComputerName $VpsIPv6 -Port $SshPort }

# 3) Domain case (DNS resolve + SSH port)
if ($VpsDomain -and $VpsDomain -ne "<VPS_DOMAIN_OR_HOSTNAME>") {
  Resolve-DnsName -Name $VpsDomain -Type A
  Resolve-DnsName -Name $VpsDomain -Type AAAA
  Test-NetConnection -ComputerName $VpsDomain -Port $SshPort
}
```

SSH examples:
```powershell
ssh <user>@<PUBLIC_IPV4_FROM_PROVIDER>
ssh <user>@[<PUBLIC_IPV6_FROM_PROVIDER>]
```

## Localhost vs 127.0.0.1
Do not switch between `localhost` and `127.0.0.1` for the UI. They are different origins and do not share `localStorage`.

## Clear SW + Storage (Chrome)
1. DevTools > Application > Service Workers: click Unregister.
2. DevTools > Application > Storage: click Clear site data.

## Chrome DevTools: Clear storage
1. Go to DevTools > Application tab.
2. In the left sidebar, scroll up above Session storage and click "Clear storage".
3. Check all boxes, then click "Clear site data".
4. Verify `ADMIN_KEY` is gone from Session storage/local storage.

## Clear Site Data (Safe)
1. DevTools > Application > Storage.
2. Check: Unregister service workers, Local and session storage, Cache storage.
3. Click Clear site data, then refresh.
4. This clears browser data for this origin only (does not affect code).
# mmk1000

## Cloudflared 502 Fix (PowerShell)
ตรวจและแก้ origin port ที่ cloudflared ส่งต่อ พร้อมเช็คสุขภาพปลายทาง:
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\fix-cloudflared-port.ps1 `
  -Hostname mmk1000.bn9.app `
  -ExpectedOriginUrl http://127.0.0.1:4100
```

จัดการ service (NSSM/Cloudflared) และดู error log:
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-cloudflared-service.ps1 -Action status
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-cloudflared-service.ps1 -Action restart
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-cloudflared-service.ps1 -Action logs
```

