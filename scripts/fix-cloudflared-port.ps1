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
    CurlExitCode = $curlExitCode
    StatusCode   = $statusCode
  }
}

function Get-CloudflaredService {
  $services = @(Get-CimInstance Win32_Service | Where-Object {
      (($_.Name -match 'cloudflared') -or ($_.DisplayName -match 'cloudflared'))
    })

  if (-not $services) {
    throw 'cloudflared_service_not_found'
  }

  $running = $services | Where-Object { $_.State -eq 'Running' } | Select-Object -First 1
  if ($running) { return $running }

  $hint = $services | Where-Object { $_.Name -ieq $ServiceName -or $_.DisplayName -ieq $ServiceName } | Select-Object -First 1
  if ($hint) { return $hint }

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

$validatePass = $false
$restartPass = $false
$domainPass = $false
$domainHttpCode = 0
$detectedPort = $null
$finalConfigPath = $null

try {
  $detectedPort = $null
  if ($env:PORT -match '^\d+$') {
    $detectedPort = [int]$env:PORT
  } else {
    $portsToTry = [System.Collections.Generic.List[int]]::new()

    if ($env:MMK_LOCAL -and $env:MMK_LOCAL -match ':(\d+)(?:/|$)') {
      [void]$portsToTry.Add([int]$Matches[1])
    }

    foreach ($p in $ProbePorts) {
      if ($p -gt 0 -and -not $portsToTry.Contains($p)) { [void]$portsToTry.Add($p) }
    }

    foreach ($port in $portsToTry) {
      $probe = Test-LocalHealthPort -Port $port
      if ($probe.CurlExitCode -eq 0 -and $probe.StatusCode -eq 200) {
        $detectedPort = $port
        break
      }
    }
  }

  if (-not $detectedPort) {
    throw 'unable_to_detect_port'
  }

  $service = Get-CloudflaredService

  $configFromService = Get-ConfigPathFromService -Service $service
  if ($configFromService) {
    $finalConfigPath = $configFromService
  } elseif ($ConfigPath) {
    $finalConfigPath = $ConfigPath
  } else {
    $finalConfigPath = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
  }

  if (-not (Test-Path $finalConfigPath)) {
    throw "config_not_found: $finalConfigPath"
  }

  $backupPath = "$finalConfigPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  Copy-Item -Path $finalConfigPath -Destination $backupPath -Force

  $expectedOrigin = "http://127.0.0.1:$detectedPort"
  $raw = Get-Content -Path $finalConfigPath -Raw

  $hostPattern = "(?ms)(-\s*hostname:\s*$([regex]::Escape($Hostname))\s*\r?\n)(.*?)(\r?\n\s*-\s*hostname:|\r?\n\s*-\s*service:|\r?\n\s*ingress:|\z)"
  $hostMatch = [regex]::Match($raw, $hostPattern)
  $updated = $raw

  if ($hostMatch.Success) {
    $blockBody = $hostMatch.Groups[2].Value
    $newBlockBody = [regex]::Replace($blockBody, '(?m)^\s*service:\s*\S+\s*$', "  service: $expectedOrigin", 1)

    if ($newBlockBody -eq $blockBody) {
      $newBlockBody = "  service: $expectedOrigin`r`n" + $blockBody
    }

    $replacementBlock = $hostMatch.Groups[1].Value + $newBlockBody + $hostMatch.Groups[3].Value
    $updated = $raw.Substring(0, $hostMatch.Index) + $replacementBlock + $raw.Substring($hostMatch.Index + $hostMatch.Length)
  } else {
    $fallbackPattern = "(?ms)(-\s*hostname:\s*$([regex]::Escape($Hostname))\s*\r?\n.*?\r?\n\s*service:\s*)\S+"
    $updated = [regex]::Replace($raw, $fallbackPattern, "`${1}$expectedOrigin", 1)
  }

  if ($updated -eq $raw) {
    throw 'target_hostname_service_not_updated'
  }

  Set-Content -Path $finalConfigPath -Value $updated -Encoding UTF8

  $cloudflaredExe = Get-CloudflaredExe -Service $service
  & $cloudflaredExe tunnel ingress validate --config $finalConfigPath
  $validatePass = ($LASTEXITCODE -eq 0)
  if (-not $validatePass) {
    throw 'cloudflared_ingress_validate_failed'
  }

  Restart-Service -Name $service.Name -Force
  Start-Sleep -Seconds 2
  $restartPass = ((Get-Service -Name $service.Name).Status -eq 'Running')
  if (-not $restartPass) {
    throw 'cloudflared_restart_failed'
  }

  $healthUrl = "https://$Hostname/api/health"
  $out = & curl.exe -sS -i --ssl-no-revoke --connect-timeout 8 --max-time 20 $healthUrl 2>&1
  $curlExitCode = $LASTEXITCODE
  $httpLine = ($out | Where-Object { $_ -match '^HTTP/\d' } | Select-Object -Last 1)
  if ($httpLine -and $httpLine -match '^HTTP/\d(?:\.\d)?\s+(\d{3})') {
    $domainHttpCode = [int]$Matches[1]
  }

  $domainPass = ($curlExitCode -eq 0) -and ($domainHttpCode -in @(200, 403))

  Write-Host "summary_detected_port=$detectedPort"
  Write-Host "summary_config_path=$finalConfigPath"
  Write-Host "summary_validate=$($validatePass ? 'PASS' : 'FAIL')"
  Write-Host "summary_restart=$($restartPass ? 'PASS' : 'FAIL')"
  Write-Host "summary_domain=$($domainPass ? 'PASS' : 'FAIL') http=$domainHttpCode"

  $overallPass = $validatePass -and $restartPass -and $domainPass
  Write-Host "summary_overall=$($overallPass ? 'PASS' : 'FAIL')"
  exit ($overallPass ? 0 : 1)
}
catch {
  if (-not $detectedPort) { $detectedPort = '' }
  if (-not $finalConfigPath) { $finalConfigPath = '' }

  Write-Host "summary_detected_port=$detectedPort"
  Write-Host "summary_config_path=$finalConfigPath"
  Write-Host "summary_validate=$($validatePass ? 'PASS' : 'FAIL')"
  Write-Host "summary_restart=$($restartPass ? 'PASS' : 'FAIL')"
  Write-Host "summary_domain=$($domainPass ? 'PASS' : 'FAIL') http=$domainHttpCode"
  Write-Host 'summary_overall=FAIL'
  Write-Error $_
  exit 1
}
