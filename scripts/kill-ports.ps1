param([int]$Port = 4100)

Write-Host "== Kill anything listening on :$Port ==" -ForegroundColor Yellow
$listenItems = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($listenItems.Count -gt 0) {
  $ownerProcesses = @(
    $listenItems |
      Select-Object -ExpandProperty OwningProcess |
      Sort-Object -Unique
  )

  foreach ($ownerProcess in $ownerProcesses) {
    if ($ownerProcess -is [int]) {
      Write-Host "Stopping process $ownerProcess" -ForegroundColor Cyan
      Stop-Process -Id $ownerProcess -Force -ErrorAction SilentlyContinue
    }
  }
} else {
  Write-Host "No LISTENING process found on :$Port" -ForegroundColor Green
}

# Best-effort: clear any stale tunnel process before starting a new one.
Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue

Start-Sleep -Milliseconds 300
Write-Host "== Verify port :$Port ==" -ForegroundColor Yellow
$remainingItems = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($remainingItems.Count -gt 0) {
  Write-Host "Port :$Port still has LISTENING process(es):" -ForegroundColor Red
  $remainingItems | ForEach-Object {
    Write-Host ("{0}:{1} -> Process {2}" -f $_.LocalAddress, $_.LocalPort, $_.OwningProcess)
  }
  exit 1
} else {
  Write-Host "Port :$Port is clear" -ForegroundColor Green
  exit 0
}
