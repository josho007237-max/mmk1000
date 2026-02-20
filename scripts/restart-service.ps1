$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$serviceName = "mmk1000-web"
$errLog = Join-Path $projectRoot "logs/web.err.log"
$outLog = Join-Path $projectRoot "logs/web.out.log"

function Is-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Show-TailLogsAndExit {
  if (Test-Path $errLog) {
    Write-Host "--- $errLog (tail 200) ---"
    Get-Content $errLog -Tail 200
  } else {
    Write-Host "$errLog not found"
  }

  if (Test-Path $outLog) {
    Write-Host "--- $outLog (tail 200) ---"
    Get-Content $outLog -Tail 200
  } else {
    Write-Host "$outLog not found"
  }

  exit 1
}

function Get-EnvValueFromText {
  param(
    [string]$Text,
    [string]$Name
  )

  if (-not $Text) { return $null }
  $match = [regex]::Match($Text, "(?im)(?:^|\s)$Name\s*=\s*([^\s;]+)")
  if ($match.Success) {
    return $match.Groups[1].Value.Trim("'`"")
  }
  return $null
}

function Get-PortFromEnvFile {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content $Path -ErrorAction SilentlyContinue) {
    if ($line -match "^\s*PORT\s*=\s*(\d+)\s*$") {
      return [int]$matches[1]
    }
  }
  return $null
}

function Get-BoolFromText {
  param(
    [string]$Text,
    [string]$Name
  )

  $value = Get-EnvValueFromText -Text $Text -Name $Name
  if (-not $value) { return $false }
  return $value -match "^(?i:true|1|yes|on)$"
}

if (-not (Is-Admin)) {
  Write-Host "ERROR: restart-service.ps1 requires Run as administrator"
  exit 1
}

$appParameters = (& nssm get $serviceName AppParameters) -join " "
$appEnvironmentExtra = (& nssm get $serviceName AppEnvironmentExtra) -join " "
$portFromNssm = Get-EnvValueFromText -Text $appEnvironmentExtra -Name "PORT"
$dotenvPath = Get-EnvValueFromText -Text $appEnvironmentExtra -Name "DOTENV_CONFIG_PATH"
if (-not $dotenvPath) {
  $dotenvPath = Get-EnvValueFromText -Text $appParameters -Name "DOTENV_CONFIG_PATH"
}
$dotenvOverride = Get-BoolFromText -Text $appEnvironmentExtra -Name "DOTENV_CONFIG_OVERRIDE"
if (-not $dotenvOverride) {
  $dotenvOverride = Get-BoolFromText -Text $appParameters -Name "DOTENV_CONFIG_OVERRIDE"
}
if ($dotenvPath -and -not [System.IO.Path]::IsPathRooted($dotenvPath)) {
  $dotenvPath = Join-Path $projectRoot $dotenvPath
}
$portFromDotenv = Get-PortFromEnvFile -Path $dotenvPath
if ($dotenvOverride -and $portFromDotenv) {
  $portEffective = [int]$portFromDotenv
} elseif ($portFromNssm) {
  $portEffective = [int]$portFromNssm
} elseif ($portFromDotenv) {
  $portEffective = [int]$portFromDotenv
} else {
  $portEffective = 4100
}
$healthUrl = "http://127.0.0.1:$portEffective/api/health"

Write-Host "PORT from NSSM: $([string]$portFromNssm)"
Write-Host "DOTENV_CONFIG_OVERRIDE: $([string]$dotenvOverride)"
Write-Host "PORT from DOTENV: $([string]$portFromDotenv)"
Write-Host "PORT_EFFECTIVE: $portEffective (dotenv override=true + PORT => dotenv, else NSSM PORT)"

& nssm stop $serviceName | Out-Null

$listenProcIds = Get-NetTCPConnection -LocalPort $portEffective -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
if ($listenProcIds) {
  foreach ($procId in $listenProcIds) {
    & taskkill /T /F /PID $procId | Out-Null
  }
}

& nssm start $serviceName | Out-Null

$isRunning = $false
for ($i = 1; $i -le 10; $i++) {
  Start-Sleep -Seconds 1
  $svcQuery = sc.exe queryex $serviceName
  if ($svcQuery | Select-String -Pattern "STATE\s*:\s*\d+\s+RUNNING") {
    $isRunning = $true
    break
  }
}

if (-not $isRunning) {
  Write-Host "ERROR: service $serviceName is not RUNNING within 10 seconds"
  sc.exe queryex $serviceName
  Show-TailLogsAndExit
}

try {
  & curl.exe --fail --silent --show-error --max-time 2 $healthUrl | Out-Null
  Write-Host "health OK: $healthUrl"
} catch {
  Write-Host "ERROR: health check failed: $healthUrl"
  Show-TailLogsAndExit
}
