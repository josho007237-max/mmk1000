$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$port = 4100
$listeningPids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

if ($listeningPids) {
  Write-Host "Port $port is in use:"
  foreach ($procId in $listeningPids) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host ("  PID={0} ProcessName={1}" -f $proc.Id, $proc.ProcessName)
    } else {
      Write-Host ("  PID={0} ProcessName=(not found)" -f $procId)
    }
  }

  $answer = Read-Host "Kill process(es) above? (Y/N)"
  if ($answer -match "^[Yy]$") {
    foreach ($procId in $listeningPids) {
      try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Host ("Killed PID {0}" -f $procId)
      } catch {
        Write-Warning ("Failed to kill PID {0}: {1}" -f $procId, $_.Exception.Message)
      }
    }
  } else {
    Write-Host "Skip kill. Continuing..."
  }
}

node .\src\server.mjs
