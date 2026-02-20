$ErrorActionPreference = "Continue"

$serviceName = "mmk1000-web"
$projectRoot = Split-Path -Parent $PSScriptRoot
$errLog = Join-Path $projectRoot "logs/web.err.log"
$outLog = Join-Path $projectRoot "logs/web.out.log"

function Is-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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

Write-Host "== NSSM status =="
& nssm status $serviceName

Write-Host "`n== sc queryex =="
& sc.exe queryex $serviceName

Write-Host "`n== sc qc =="
& sc.exe qc $serviceName

Write-Host "`n== NSSM config snapshot =="
$appParameters = (& nssm get $serviceName AppParameters) -join " "
$appEnvironmentExtra = (& nssm get $serviceName AppEnvironmentExtra) -join " "
Write-Host $appParameters
Write-Host $appEnvironmentExtra

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

Write-Host "`n== Resolved PORT =="
Write-Host "PORT from NSSM: $([string]$portFromNssm)"
Write-Host "DOTENV_CONFIG_PATH: $([string]$dotenvPath)"
Write-Host "DOTENV_CONFIG_OVERRIDE: $([string]$dotenvOverride)"
Write-Host "PORT from DOTENV: $([string]$portFromDotenv)"
Write-Host "PORT_EFFECTIVE: $portEffective (dotenv override=true + PORT => dotenv, else NSSM PORT)"
Write-Host "Run as admin: $(Is-Admin)"

$svcQuery = & sc.exe queryex $serviceName
$serviceProcId = $null
foreach ($line in $svcQuery) {
  if ($line -match "^\s*PID\s*:\s*(\d+)\s*$") {
    $serviceProcId = [int]$matches[1]
    break
  }
}

Write-Host "`n== PID info (Win32_Process) =="
if ($serviceProcId -and $serviceProcId -gt 0) {
  Get-CimInstance Win32_Process -Filter "ProcessId = $serviceProcId" |
    Select-Object ProcessId, ParentProcessId, Name, CreationDate, CommandLine |
    Format-List
} else {
  Write-Host "Service PID not found"
}

Write-Host "`n== Port $portEffective owner =="
$portRows = Get-NetTCPConnection -LocalPort $portEffective -ErrorAction SilentlyContinue |
  Select-Object State, LocalAddress, LocalPort, RemoteAddress, RemotePort, OwningProcess
$portOwnerIds = @()
if ($portRows) {
  $portRows | Format-Table -AutoSize

  $portOwnerIds = $portRows | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($portOwnerId in $portOwnerIds) {
    Write-Host "`n-- Process owning port ${portEffective}: PID $portOwnerId --"
    Get-CimInstance Win32_Process -Filter "ProcessId = $portOwnerId" |
      Select-Object ProcessId, ParentProcessId, Name, CommandLine |
      Format-List
  }
} else {
  Write-Host "No TCP entry for port $portEffective"
}

Write-Host "`n== netstat/findstr :$portEffective =="
& netstat -ano | findstr ":$portEffective"

Write-Host "`n== netstat -abno | findstr :$portEffective =="
if (-not (Is-Admin)) {
  Write-Host "NOTE: netstat -abno requires Run as administrator"
}
& netstat -abno | findstr ":$portEffective"

if ($portOwnerIds) {
  Write-Host "`n== tasklist /svc (port owner PID) =="
  foreach ($portOwnerId in $portOwnerIds) {
    Write-Host "-- PID $portOwnerId --"
    & tasklist /svc /fi "PID eq $portOwnerId"
  }
}

Write-Host "`n== Excluded port ranges (TCP) =="
function Show-ExcludedPortRange {
  param(
    [string[]]$Lines,
    [string]$Label
  )

  Write-Host "-- $Label --"
  $matched = $false
  foreach ($line in $Lines) {
    if ($line -match "^\s*(\d+)\s+(\d+)\s*$") {
      $startPort = [int]$matches[1]
      $endPort = [int]$matches[2]
      if ($portEffective -ge $startPort -and $portEffective -le $endPort) {
        $matched = $true
        Write-Host ("{0}  <-- contains {1}" -f $line.Trim(), $portEffective)
      } else {
        Write-Host $line.Trim()
      }
    }
  }
  if (-not $matched) {
    Write-Host "No excluded range contains port $portEffective"
  }
}

$ipv4Excluded = & netsh interface ipv4 show excludedportrange protocol=tcp
$ipv6Excluded = & netsh interface ipv6 show excludedportrange protocol=tcp
Show-ExcludedPortRange -Lines $ipv4Excluded -Label "IPv4"
Show-ExcludedPortRange -Lines $ipv6Excluded -Label "IPv6"

Write-Host "`n== netsh interface portproxy show all =="
& netsh interface portproxy show all

Write-Host "`n== netsh http show urlacl | findstr :$portEffective =="
& netsh http show urlacl | findstr ":$portEffective"

Write-Host "`n== Listener watch on port $portEffective (200ms x 30) =="
$seenOwner = @{}
for ($i = 1; $i -le 30; $i++) {
  $owners = Get-NetTCPConnection -LocalPort $portEffective -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  if ($owners) {
    foreach ($ownerPid in $owners) {
      if (-not $seenOwner.ContainsKey($ownerPid)) {
        $seenOwner[$ownerPid] = $true
        Write-Host ("[{0:HH:mm:ss.fff}] LISTEN PID {1}" -f (Get-Date), $ownerPid)
        Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" |
          Select-Object ProcessId, ParentProcessId, Name, CommandLine |
          Format-List
      }
    }
  }
  Start-Sleep -Milliseconds 200
}

Write-Host "`n== Service PID + child process =="
if ($serviceProcId -and $serviceProcId -gt 0) {
  Write-Host "Service PID: $serviceProcId"
  $childProcesses = Get-CimInstance Win32_Process -Filter "ParentProcessId = $serviceProcId" |
    Select-Object ProcessId, ParentProcessId, Name, CommandLine
  if ($childProcesses) {
    $childProcesses | Format-Table -AutoSize
  } else {
    Write-Host "No child process found"
  }
} else {
  Write-Host "Service PID not found; child process lookup skipped"
}

Write-Host "`n== Health =="
try {
  & curl.exe --silent --show-error --max-time 2 $healthUrl
  Write-Host ""
  Write-Host "health request finished"
} catch {
  Write-Host "health check failed: $($_.Exception.Message)"
}

Write-Host "`n== logs/web.err.log (tail 200) =="
if (Test-Path $errLog) {
  $errLogFile = Get-Item $errLog
  Write-Host "LastWriteTime: $($errLogFile.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  Get-Content $errLog -Tail 200
} else {
  Write-Host "$errLog not found"
}

Write-Host "`n== logs/web.out.log (tail 200) =="
if (Test-Path $outLog) {
  Get-Content $outLog -Tail 200
} else {
  Write-Host "$outLog not found"
}
