# tools/queue-stats.ps1
$ErrorActionPreference = "Continue"
Set-Location "C:\Users\ADMIN\MMK1000"

$qPath = "C:\Users\ADMIN\MMK1000\data\withdraw-queue.json"
if (!(Test-Path $qPath)) {
  Write-Host "withdraw-queue.json not found"
  exit 1
}

try {
  $json = Get-Content $qPath -Raw | ConvertFrom-Json
} catch {
  Write-Host "failed to parse withdraw-queue.json"
  exit 1
}

$items = @()
if ($json -is [System.Collections.IEnumerable]) {
  $items = $json
} else {
  foreach ($k in @("items", "jobs")) {
    if ($json.$k) { $items = $json.$k; break }
  }
}

$statusCounts = @{
  pending = 0
  approved = 0
  sent = 0
  failed = 0
}
foreach ($it in $items) {
  $st = [string]$it.status
  if ($statusCounts.ContainsKey($st)) { $statusCounts[$st] += 1 }
}

Write-Host ("pending: " + $statusCounts.pending)
Write-Host ("approved: " + $statusCounts.approved)
Write-Host ("sent: " + $statusCounts.sent)
Write-Host ("failed: " + $statusCounts.failed)
