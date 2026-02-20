$ErrorActionPreference = "Stop"

$queueFile = Join-Path "." "data/withdraw-queue.json"

if (-not (Test-Path -LiteralPath $queueFile)) {
  Write-Error "Queue file not found: $queueFile"
  exit 1
}

$resolved = Resolve-Path -LiteralPath $queueFile
Write-Host ("Queue file: {0}" -f $resolved.Path)

$raw = Get-Content -LiteralPath $resolved.Path -Raw | ConvertFrom-Json

$items = @()
if ($raw -is [System.Array]) {
  $items = $raw
} elseif ($null -ne $raw.items) {
  $items = @($raw.items)
  if ($raw.items -is [System.Array]) { $items = $raw.items }
} elseif ($null -ne $raw.jobs) {
  $items = @($raw.jobs)
  if ($raw.jobs -is [System.Array]) { $items = $raw.jobs }
}

if (-not $items) {
  Write-Host "No jobs found."
  exit 0
}

$statusCounts = @{}
$errorCounts = @{}

function Get-ErrorText {
  param([object]$job)

  if ($null -ne $job.result -and $null -ne $job.result.error -and "$($job.result.error)".Trim() -ne "") {
    return "$($job.result.error)"
  }
  if ($null -ne $job.error -and "$($job.error)".Trim() -ne "") {
    return "$($job.error)"
  }
  if ($null -ne $job.message -and "$($job.message)".Trim() -ne "") {
    return "$($job.message)"
  }
  return "NO_ERROR_FIELD"
}

foreach ($job in $items) {
  $statusRaw = ""
  if ($null -ne $job.status) { $statusRaw = "$($job.status)" }
  $status = $statusRaw.Trim().ToLower()
  if ($status -eq "") { $status = "unknown" }

  if (-not $statusCounts.ContainsKey($status)) { $statusCounts[$status] = 0 }
  $statusCounts[$status]++

  if ($status -eq "failed") {
    $err = Get-ErrorText -job $job
    if (-not $errorCounts.ContainsKey($err)) { $errorCounts[$err] = 0 }
    $errorCounts[$err]++
  }
}

Write-Host ""
Write-Host "Status Summary"
$statusCounts.GetEnumerator() |
  Sort-Object Name |
  ForEach-Object { "{0}: {1}" -f $_.Name, $_.Value } |
  Write-Host

Write-Host ""
Write-Host "Top 15 Failed Errors"
if ($errorCounts.Count -eq 0) {
  Write-Host "(none)"
} else {
  $errorCounts.GetEnumerator() |
    Sort-Object @{Expression = "Value"; Descending = $true}, @{Expression = "Name"; Descending = $false} |
    Select-Object -First 15 |
    ForEach-Object { "{0} x {1}" -f $_.Value, $_.Name } |
    Write-Host
}
