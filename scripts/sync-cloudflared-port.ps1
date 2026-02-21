[CmdletBinding()]
param(
  [string]$ConfigPath = "C:\Users\ADMIN\.cloudflared\mmk1000.yml",
  [string]$Hostname = "mmk1000.bn9.app",
  [string]$ServiceName = "Cloudflared"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-HealthPort {
  param([int]$Port)
  $url = "http://127.0.0.1:$Port/api/health"
  $out = & curl.exe -sS -I --connect-timeout 3 --max-time 8 $url 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { return $false }
  return ($out -match 'HTTP/\d+(?:\.\d+)?\s+2\d\d')
}

$workingPort = $null
foreach ($candidate in @(4100, 4101)) {
  if (Test-HealthPort -Port $candidate) {
    $workingPort = $candidate
    break
  }
}

if (-not $workingPort) {
  Write-Host "health_port=not_found checked=4100,4101"
  exit 1
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "config_not_found: $ConfigPath"
}

$targetService = "http://127.0.0.1:$workingPort"
$raw = Get-Content -LiteralPath $ConfigPath -Raw
$lines = $raw -split "`r?`n"

$inBlock = $false
$hostIndent = ""
$serviceIndent = ""
$serviceFoundInBlock = $false
$updated = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]

  if ($line -match '^(\s*)-\s*hostname:\s*(\S+)\s*$') {
    $candidateHost = $matches[2].Trim('"',"'")
    if ($candidateHost -eq $Hostname) {
      $inBlock = $true
      $hostIndent = $matches[1]
      $serviceIndent = ""
      $serviceFoundInBlock = $false
      continue
    }
    $inBlock = $false
    continue
  }

  if ($inBlock) {
    if ($line -match '^(\s*)service:\s*(\S+)\s*$') {
      $serviceIndent = $matches[1]
      $newLine = "$serviceIndent" + "service: $targetService"
      if ($lines[$i] -ne $newLine) {
        $lines[$i] = $newLine
        $updated = $true
      }
      $serviceFoundInBlock = $true
      continue
    }

    if ($line -match '^(\s*)-\s*hostname:\s*') {
      if (-not $serviceFoundInBlock) {
        $insertIndent = if ($serviceIndent) { $serviceIndent } else { "$hostIndent  " }
        $insertion = "$insertIndent" + "service: $targetService"
        $lines = @($lines[0..($i-1)] + $insertion + $lines[$i..($lines.Count-1)])
        $updated = $true
        $serviceFoundInBlock = $true
        $i++
      }
      $inBlock = $false
    }
  }
}

if ($inBlock -and -not $serviceFoundInBlock) {
  $insertIndent = if ($serviceIndent) { $serviceIndent } else { "$hostIndent  " }
  $lines += "$insertIndent" + "service: $targetService"
  $updated = $true
}

$newRaw = ($lines -join "`r`n")
if ($newRaw -ne $raw) {
  Set-Content -LiteralPath $ConfigPath -Value $newRaw -Encoding UTF8
}

$hostBlock = Select-String -Path $ConfigPath -Pattern "hostname:\s*$([regex]::Escape($Hostname))" -Context 0,3 | Select-Object -First 1
if ($hostBlock) {
  $serviceLine = $hostBlock.Context.PostContext | Where-Object { $_ -match '^\s*service:\s*' } | Select-Object -First 1
  Write-Host ($hostBlock.Line.Trim())
  if ($serviceLine) { Write-Host ($serviceLine.Trim()) }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin -and (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
  Restart-Service -Name $ServiceName -Force
  Write-Host "service_restarted=$ServiceName"
}

$healthUrl = "https://$Hostname/api/health"
$domainHead = & curl.exe -S -I --ssl-no-revoke --connect-timeout 8 --max-time 20 $healthUrl 2>&1
$curlExitCode = $LASTEXITCODE
if ($curlExitCode -ne 0) {
  Write-Host "status_code=000 curl_exit_code=$curlExitCode"
  exit $curlExitCode
}

$statusCode = "unknown"
foreach ($line in $domainHead) {
  if ($line -match '^HTTP/\d+(?:\.\d+)?\s+(\d{3})') {
    $statusCode = $matches[1]
    break
  }
}
Write-Host "status_code=$statusCode"
