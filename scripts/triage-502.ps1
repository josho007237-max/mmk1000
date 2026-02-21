[CmdletBinding()]
param(
  [string]$Domain = 'mmk1000.bn9.app',
  [string]$CloudflaredService = 'Cloudflared',
  [string]$ConfigPath = "$env:USERPROFILE\.cloudflared\config.yml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host '== Listening ports 4100/4101 =='
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 4100,4101 } |
  Select-Object LocalAddress, LocalPort, OwningProcess, State |
  Format-Table -AutoSize

Write-Host '== Cloudflared config =='
Write-Host "config_path=$ConfigPath"
if (Test-Path $ConfigPath) {
  $ingressService = Select-String -Path $ConfigPath -Pattern '^\s*service:\s*(.+)$' | Select-Object -First 1
  if ($ingressService -and $ingressService.Matches.Count -gt 0) {
    Write-Host "ingress_service=$($ingressService.Matches[0].Groups[1].Value.Trim())"
  } else {
    Write-Host 'ingress_service=not_found'
  }
} else {
  Write-Host 'ingress_service=config_not_found'
}

$svc = Get-Service -Name $CloudflaredService -ErrorAction SilentlyContinue
if (-not $svc) { throw "service_not_found: $CloudflaredService" }
$pidBefore = (Get-CimInstance Win32_Service -Filter "Name='$CloudflaredService'").ProcessId
Write-Host "pid_before=$pidBefore"
Restart-Service -Name $CloudflaredService -Force
Start-Sleep -Seconds 2
$pidAfter = (Get-CimInstance Win32_Service -Filter "Name='$CloudflaredService'").ProcessId
Write-Host "pid_after=$pidAfter"

$url = "https://$Domain/api/health"
$out = & curl.exe -sS -i --ssl-no-revoke --connect-timeout 8 --max-time 20 $url 2>&1
$curlExitCode = $LASTEXITCODE
$out | ForEach-Object { Write-Host $_ }
$httpLine = ($out | Where-Object { $_ -match '^HTTP/\d' } | Select-Object -Last 1)
$code = 0
if ($httpLine -and $httpLine -match '^HTTP/\d(?:\.\d)?\s+(\d{3})') { $code = [int]$Matches[1] }
Write-Host "status_code=$code"

if ($curlExitCode -eq 0 -and $code -eq 200) {
  Write-Host 'result=PASS'
  exit 0
}
Write-Host 'result=FAIL'
if ($curlExitCode -ne 0) { exit $curlExitCode }
exit 1
