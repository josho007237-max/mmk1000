param(
  [int]$Port = 4100
)

$root = Split-Path -Parent $PSScriptRoot
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue)?.Source
if (-not $pwsh) { $pwsh = (Get-Command powershell).Source }

& "$PSScriptRoot\kill-ports.ps1" -Port $Port
if ($LASTEXITCODE -ne 0) {
  Write-Host "Port :$Port is not clear. Abort startup." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "== Start Backend ==" -ForegroundColor Yellow
Start-Process $pwsh -WorkingDirectory $root -ArgumentList @(
  "-NoExit","-Command","cd `"$root`"; node .\src\server.mjs"
)

Write-Host "== Start Tunnel ==" -ForegroundColor Yellow
Start-Process $pwsh -WorkingDirectory $root -ArgumentList @(
  "-NoExit","-Command","cd `"$root`"; cloudflared tunnel run mmk1000"
)
