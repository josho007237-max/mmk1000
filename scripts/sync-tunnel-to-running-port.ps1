[CmdletBinding()]
param(
  [string]$ConfigPath = "C:\Users\ADMIN\.cloudflared\mmk1000.yml",
  [string]$Hostname = "mmk1000.bn9.app",
  [string]$ServiceName = "Cloudflared"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-Health200 {
  param([int]$Port)
  $url = "http://127.0.0.1:$Port/api/health"
  $headers = & curl.exe -sS -I --connect-timeout 3 --max-time 8 $url 2>&1
  if ($LASTEXITCODE -ne 0) { return $false }
  return ($headers -match '^HTTP/\d+(?:\.\d+)?\s+200(?:\s|$)')
}

$port = $null
if (Test-Health200 -Port 4100) {
  $port = 4100
} elseif (Test-Health200 -Port 4101) {
  $port = 4101
}

if (-not $port) {
  Write-Host "health_port=not_found checked=4100,4101"
  exit 1
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "config_not_found: $ConfigPath"
}

$targetService = "http://127.0.0.1:$port"
$raw = Get-Content -LiteralPath $ConfigPath -Raw
$lines = $raw -split "`r?`n"

$inTargetBlock = $false
$targetFound = $false
$serviceUpdated = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]

  if ($line -match '^\s*-\s*hostname:\s*(\S+)\s*$') {
    $candidateHost = $matches[1].Trim('"', "'")
    $inTargetBlock = ($candidateHost -eq $Hostname)
    if ($inTargetBlock) { $targetFound = $true }
    continue
  }

  if ($inTargetBlock -and $line -match '^(\s*)service:\s*\S+\s*$') {
    $indent = $matches[1]
    $lines[$i] = "$indent" + "service: $targetService"
    $serviceUpdated = $true
    $inTargetBlock = $false
  }
}

if (-not $targetFound) {
  throw "hostname_not_found: $Hostname"
}
if (-not $serviceUpdated) {
  throw "service_line_not_found_for_hostname: $Hostname"
}

$newRaw = ($lines -join "`r`n")
if ($newRaw -ne $raw) {
  Set-Content -LiteralPath $ConfigPath -Value $newRaw -Encoding UTF8
}

Write-Host "CFG_USED_BY_SERVICE=$ConfigPath"
$hostBlock = Select-String -Path $ConfigPath -Pattern "hostname:\s*$([regex]::Escape($Hostname))" -Context 0,3 | Select-Object -First 1
if ($hostBlock) {
  $serviceLine = $hostBlock.Context.PostContext | Where-Object { $_ -match '^\s*service:\s*' } | Select-Object -First 1
  Write-Host ($hostBlock.Line.Trim())
  if ($serviceLine) { Write-Host ($serviceLine.Trim()) }
}

$pidBefore = (Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1).Id
if (-not $pidBefore) { $pidBefore = 0 }
Restart-Service -Name $ServiceName -Force
Start-Sleep -Seconds 1
$pidAfter = (Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1).Id
if (-not $pidAfter) { $pidAfter = 0 }
Write-Host "pid_before=$pidBefore"
Write-Host "pid_after=$pidAfter"

$healthUrl = "https://$Hostname/api/health"
$domainHead = & curl.exe -S -I --ssl-no-revoke --connect-timeout 8 --max-time 20 $healthUrl 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "status_code=000"
  exit 1
}

$statusCode = "unknown"
foreach ($line in $domainHead) {
  if ($line -match '^HTTP/\d+(?:\.\d+)?\s+(\d{3})') {
    $statusCode = $matches[1]
    break
  }
}
Write-Host "status_code=$statusCode"
