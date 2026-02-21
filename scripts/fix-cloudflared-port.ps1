[CmdletBinding()]
param(
  [string]$ConfigPath = "$env:USERPROFILE\.cloudflared\config.yml",
  [string]$Hostname = "mmk1000.bn9.app",
  [string]$ExpectedOriginUrl = "http://127.0.0.1:4100",
  [string]$ServiceName = "Cloudflared"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $ConfigPath)) {
  throw "config_not_found: $ConfigPath"
}

$raw = Get-Content -Path $ConfigPath -Raw
$serviceRegex = '(?m)^\s*service:\s*https?://[^\r\n]+'
$replacement = "service: $ExpectedOriginUrl"
$updated = [regex]::Replace($raw, $serviceRegex, $replacement, 1)

if ($updated -ne $raw) {
  Set-Content -Path $ConfigPath -Value $updated -Encoding UTF8
  Write-Host "config_updated=true path=$ConfigPath service=$ExpectedOriginUrl"
} else {
  Write-Host "config_updated=false path=$ConfigPath"
}

$hostBlock = Select-String -Path $ConfigPath -Pattern "hostname:\s*$([regex]::Escape($Hostname))" -Context 0,3 | Select-Object -First 1
if ($hostBlock) {
  Write-Host "hostname_block_found=true hostname=$Hostname"
  $hostBlock.Line
  $hostBlock.Context.PostContext | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "hostname_block_found=false hostname=$Hostname"
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Restart-Service -Name $ServiceName -Force
  Start-Sleep -Seconds 2
  $svc = Get-Service -Name $ServiceName
  Write-Host "service_status=$($svc.Status)"
} else {
  Write-Host "service_missing=$ServiceName"
}

$healthUrl = "https://$Hostname/api/health"
$out = & curl.exe -sS -I --ssl-no-revoke --connect-timeout 8 --max-time 20 $healthUrl 2>&1
$curlExitCode = $LASTEXITCODE
$out | ForEach-Object { Write-Host $_ }
if ($curlExitCode -ne 0) {
  Write-Host "health_check=failed curl_exit_code=$curlExitCode"
  exit $curlExitCode
}

if ($out -match 'HTTP/\d+(?:\.\d+)?\s+502') {
  Write-Host "health_check=bad_gateway_502"
  exit 502
}

Write-Host "health_check=ok url=$healthUrl"
