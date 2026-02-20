$ErrorActionPreference = "Stop"

$queueFile = Join-Path "." "data/withdraw-queue.json"
if (-not (Test-Path -LiteralPath $queueFile)) {
  throw "queue file not found: $queueFile"
}

$resolvedPath = (Resolve-Path -LiteralPath $queueFile).Path
if (-not (Test-Json -Path $resolvedPath)) {
  throw "invalid json"
}

$backupName = "withdraw-queue.{0}.bak.json" -f (Get-Date -Format "yyyyMMdd-HHmmss")
$backupPath = Join-Path (Split-Path -Parent $resolvedPath) $backupName
Copy-Item -LiteralPath $resolvedPath -Destination $backupPath -Force

$raw = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json

$items = @()
if ($raw -is [System.Array]) {
  $items = @($raw)
} elseif ($null -ne $raw.items) {
  if ($raw.items -is [System.Array]) { $items = @($raw.items) } else { $items = @($raw.items) }
} elseif ($null -ne $raw.jobs) {
  if ($raw.jobs -is [System.Array]) { $items = @($raw.jobs) } else { $items = @($raw.jobs) }
}

$rows = @()
foreach ($it in $items) {
  $status = if ($null -eq $it.status -or "$($it.status)".Trim() -eq "") { "unknown" } else { "$($it.status)" }
  $rows += [pscustomobject]@{
    id = $it.id
    status = $status
    amount = $it.amount
  }
}

Write-Host ("Queue file: {0}" -f $resolvedPath)
Write-Host ("Backup: {0}" -f $backupPath)
Write-Host ""
Write-Host "Status summary"
$rows |
  Group-Object status |
  Select-Object Name, Count |
  Sort-Object Name |
  Format-Table -AutoSize

Write-Host ""
Write-Host "ตัวอย่าง 5 รายการแรก: id,status,amount"
$rows |
  Select-Object -First 5 id, status, amount |
  Format-Table -AutoSize
