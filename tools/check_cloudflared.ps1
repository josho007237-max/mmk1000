Param(
  [string]$TunnelUuid = "9c17b990-878f-4a6d-a0fa-13a3df5b9a86",
  [string]$Hostname = "mmk1000-dev.bn9.app"
)

$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
$cert = Join-Path $cfDir "cert.pem"
$cred = Join-Path $cfDir "$TunnelUuid.json"

Write-Host "Cloudflared check" -ForegroundColor Cyan
Write-Host "cert.pem: $cert"
Write-Host "tunnel json: $cred"

if (Test-Path $cert) { Write-Host "OK: cert.pem exists" -ForegroundColor Green }
else { Write-Host "MISSING: cert.pem" -ForegroundColor Yellow }

if (Test-Path $cred) { Write-Host "OK: $TunnelUuid.json exists" -ForegroundColor Green }
else { Write-Host "MISSING: $TunnelUuid.json" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Next commands:" -ForegroundColor Cyan
Write-Host "cloudflared tunnel login"
Write-Host "cloudflared tunnel route dns mmk1000-panel $Hostname"
Write-Host "nslookup $Hostname"
Write-Host "curl https://$Hostname/ -I"
