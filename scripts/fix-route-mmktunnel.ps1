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

if ([string]::IsNullOrWhiteSpace($cfgPath) -or -not (Test-Path $cfgPath)) {
  Write-Host 'Config file not found'
  exit 1
}

$tunnelLine = Select-String -Path $cfgPath -Pattern '^tunnel:\s*(.+)$' | Select-Object -First 1
if (-not $tunnelLine) {
  Write-Host 'tunnel id not found in config'
  exit 1
}

$tunnelId = ($tunnelLine.Matches[0].Groups[1].Value).Trim()
if ([string]::IsNullOrWhiteSpace($tunnelId)) {
  Write-Host 'tunnel id is empty'
  exit 1
}

& cloudflared tunnel route dns -f $tunnelId mmk1000.bn9.app
$cfExit = $LASTEXITCODE
if ($cfExit -ne 0) {
  Write-Host "cloudflared_exit_code=$cfExit"
  exit $cfExit
}

Restart-Service -Name Cloudflared -Force

$out = & curl.exe -S -I --ssl-no-revoke --connect-timeout 5 --max-time 15 https://mmk1000.bn9.app/api/health 2>&1
$curlExitCode = $LASTEXITCODE
$out | ForEach-Object { Write-Host $_ }
if ($curlExitCode -ne 0) {
  Write-Host "curl_exit_code=$curlExitCode"
  exit $curlExitCode
}
