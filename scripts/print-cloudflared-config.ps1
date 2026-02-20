Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$svc = Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
if (-not $svc) {
  Write-Host 'Cloudflared service not found'
  exit 1
}

$pathName = [string]$svc.PathName
$cfgPath = ''
if ($pathName -match '--config\s+"([^"]+)"') {
  $cfgPath = $Matches[1]
} elseif ($pathName -match '--config\s+([^\s]+)') {
  $cfgPath = $Matches[1]
}

Write-Host "CFG_USED_BY_SERVICE=$cfgPath"

if ([string]::IsNullOrWhiteSpace($cfgPath) -or -not (Test-Path $cfgPath)) {
  Write-Host 'Config file not found'
  exit 1
}

Select-String -Path $cfgPath -Pattern '^tunnel:'
Select-String -Path $cfgPath -Pattern 'hostname:\s*mmk1000\.bn9\.app' -Context 0,2
Select-String -Path $cfgPath -Pattern '^\s*service:' -Context 1,1
