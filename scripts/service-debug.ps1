param(
  [string]$ServiceName = "mmk1000-web"
)

try {
  $scOutput = & sc.exe queryex $ServiceName 2>&1

  $servicePid = 0
  foreach ($line in $scOutput) {
    if ($line -match "^\s*PID\s*:\s*(\d+)\s*$") {
      $servicePid = [int]$matches[1]
      break
    }
  }

  Write-Host "== Service ==" -ForegroundColor Yellow
  Write-Host "Name: $ServiceName"
  Write-Host "PID : $servicePid"

  Write-Host "`n== tasklist (PID $servicePid) ==" -ForegroundColor Yellow
  & tasklist /FI "PID eq $servicePid"

  Write-Host "`n== CommandLine (PID $servicePid) ==" -ForegroundColor Yellow
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $servicePid" -ErrorAction SilentlyContinue
  if ($null -ne $proc) {
    $proc | Select-Object ProcessId, Name, CommandLine | Format-List
  } else {
    Write-Host "Process not found for PID $servicePid"
  }
} catch {
  Write-Host "service-debug error: $($_.Exception.Message)"
}

exit 0
