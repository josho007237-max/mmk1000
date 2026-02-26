[CmdletBinding()]
param(
  [string]$Hostname = 'mmk1000.bn9.app',
  [string]$ServiceName = 'cloudflared',
  [string]$ConfigPath,
  [int[]]$ProbePorts = @(4100, 3000, 8080)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-LocalHealthPort {
  param([Parameter(Mandatory = $true)][int]$Port)

  $url = "http://127.0.0.1:$Port/api/health"
  $out = & curl.exe -sS -i --connect-timeout 3 --max-time 8 $url 2>&1
  $curlExitCode = $LASTEXITCODE
  $httpLine = ($out | Where-Object { $_ -match '^HTTP/\d' } | Select-Object -Last 1)
  $statusCode = 0
  if ($httpLine -and $httpLine -match '^HTTP/\d(?:\.\d)?\s+(\d{3})') {
    $statusCode = [int]$Matches[1]
  }

  [PSCustomObject]@{
    Port         = $Port
    Url          = $url
    CurlExitCode = $curlExitCode
    StatusCode   = $statusCode
  }
}

function Get-CloudflaredService {
  param([string]$NameHint)

  $services = @(Get-CimInstance Win32_Service | Where-Object {
      $_.Name -ieq $NameHint -or
      $_.DisplayName -ieq $NameHint -or
      $_.PathName -match 'cloudflared'
    })

  if (-not $services) {
    throw "cloudflared_service_not_found name_hint=$NameHint"
  }

  $exact = $services | Where-Object { $_.Name -ieq $NameHint } | Select-Object -First 1
  if ($exact) { return $exact }
  return ($services | Select-Object -First 1)
}

function Get-ConfigPathFromService {
  param([Parameter(Mandatory = $true)]$Service)

  $pathName = "$($Service.PathName)"

  if ($pathName -match '--config\s+"([^"]+)"') { return $Matches[1] }
  if ($pathName -match '--config\s+([^\s"]+)') { return $Matches[1] }
  return $null
}

function Get-CloudflaredExe {
  param([Parameter(Mandatory = $true)]$Service)

  $pathName = "$($Service.PathName)"
  if ($pathName -match '^"([^"]*cloudflared(?:\.exe)?)"') { return $Matches[1] }
  if ($pathName -match '^([^\s"]*cloudflared(?:\.exe)?)') { return $Matches[1] }
  return 'cloudflared.exe'
}

$detectedPort = $null
if ($env:PORT -match '^\d+$') {
  $detectedPort = [int]$env:PORT
  Write-Host "port_source=env:PORT port=$detectedPort"
} else {
  $portsToTry = [System.Collections.Generic.List[int]]::new()
  foreach ($p in $ProbePorts) { if ($p -gt 0) { [void]$portsToTry.Add($p) } }

  if ($env:MMK_LOCAL -and $env:MMK_LOCAL -match ':(\d+)(?:/|$)') {
    $mmkPort = [int]$Matches[1]
    if (-not $portsToTry.Contains($mmkPort)) { $portsToTry.Insert(0, $mmkPort) }
  }

  foreach ($port in $portsToTry) {
    $probe = Test-LocalHealthPort -Port $port
    Write-Host "probe_port=$($probe.Port) status=$($probe.StatusCode) curl_exit=$($probe.CurlExitCode)"
    if ($probe.CurlExitCode -eq 0 -and $probe.StatusCode -eq 200) {
      $detectedPort = $port
      Write-Host "port_source=local_health port=$detectedPort"
      break
    }
  }
}

if (-not $detectedPort) {
  throw 'unable_to_detect_port (set $env:PORT or ensure local /api/health returns 200)'
}

$service = Get-CloudflaredService -NameHint $ServiceName
Write-Host "service_name=$($service.Name)"

if (-not $ConfigPath) {
  $ConfigPath = Get-ConfigPathFromService -Service $service
}
if (-not $ConfigPath) {
  $ConfigPath = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
}
if (-not (Test-Path $ConfigPath)) {
  throw "config_not_found: $ConfigPath"
}

$backupPath = "$ConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item -Path $ConfigPath -Destination $backupPath -Force
Write-Host "config_backup=$backupPath"

$expectedOrigin = "http://127.0.0.1:$detectedPort"
$raw = Get-Content -Path $ConfigPath -Raw
$serviceRegex = '(?m)^\s*service:\s*https?://[^\r\n]+'
$replacement = "service: $expectedOrigin"
$updated = [regex]::Replace($raw, $serviceRegex, $replacement, 1)

if ($updated -eq $raw) {
  throw "service_line_not_found_in_config: $ConfigPath"
}

Set-Content -Path $ConfigPath -Value $updated -Encoding UTF8
Write-Host "config_updated=true path=$ConfigPath service=$expectedOrigin"

$cloudflaredExe = Get-CloudflaredExe -Service $service
& $cloudflaredExe tunnel ingress validate --config $ConfigPath
$validateExitCode = $LASTEXITCODE
Write-Host "ingress_validate_exit_code=$validateExitCode"
if ($validateExitCode -ne 0) {
  throw 'cloudflared_ingress_validate_failed'
}

Restart-Service -Name $service.Name -Force
Start-Sleep -Seconds 2
$serviceState = (Get-Service -Name $service.Name).Status
Write-Host "service_status=$serviceState"

$healthUrl = "https://$Hostname/api/health"
$out = & curl.exe -sS -i --ssl-no-revoke --connect-timeout 8 --max-time 20 $healthUrl 2>&1
$curlExitCode = $LASTEXITCODE
$out | ForEach-Object { Write-Host $_ }

$httpLine = ($out | Where-Object { $_ -match '^HTTP/\d' } | Select-Object -Last 1)
$statusCode = 0
if ($httpLine -and $httpLine -match '^HTTP/\d(?:\.\d)?\s+(\d{3})') {
  $statusCode = [int]$Matches[1]
}

$domainPass = ($curlExitCode -eq 0) -and ($statusCode -in @(200, 403))
Write-Host "domain_status_code=$statusCode"
Write-Host "domain_curl_exit_code=$curlExitCode"
Write-Host "summary_domain=$($domainPass ? 'PASS' : 'FAIL')"

if ($domainPass) {
  Write-Host 'summary_overall=PASS'
  exit 0
}
catch {
  if (-not $detectedPort) { $detectedPort = '' }
  if (-not $finalConfigPath) { $finalConfigPath = '' }

Write-Host 'summary_overall=FAIL'
exit 1
