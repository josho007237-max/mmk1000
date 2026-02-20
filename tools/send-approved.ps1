# tools/send-approved.ps1
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

$first = $items | Where-Object { $_.status -eq "approved" } | Select-Object -First 1
if (!$first) {
  Write-Host "no approved job found"
  exit 1
}

$id = [string]$first.id
if (!$id) {
  Write-Host "approved job has no id"
  exit 1
}

$adminKey = [string]$env:ADMIN_KEY
if (!$adminKey) {
  Write-Host "missing admin key (set env ADMIN_KEY)"
  Write-Host 'Example: $env:ADMIN_KEY="mmk1000"; .\tools\send-approved.ps1'
  Write-Host 'Or curl: curl -X POST -H "x-admin-key: mmk1000" "http://127.0.0.1:4100/api/withdraw/<id>/send"'
  exit 1
}

$url = "http://127.0.0.1:4100/api/withdraw/$id/send"
try {
  curl -s -X POST -H "x-admin-key: $adminKey" $url | Out-Null
} catch {
  Write-Host "request failed"
}

try {
  $json2 = Get-Content $qPath -Raw | ConvertFrom-Json
} catch {
  Write-Host "failed to reload withdraw-queue.json"
  exit 1
}

$items2 = @()
if ($json2 -is [System.Collections.IEnumerable]) {
  $items2 = $json2
} else {
  foreach ($k in @("items", "jobs")) {
    if ($json2.$k) { $items2 = $json2.$k; break }
  }
}

$job = $items2 | Where-Object { [string]$_.id -eq $id } | Select-Object -First 1
if (!$job) {
  Write-Host "job not found after send"
  exit 1
}

$res = $job.result
$resShort = ""
if ($res) {
  $resShort = ($res | ConvertTo-Json -Depth 4 -Compress)
  if ($resShort.Length -gt 400) { $resShort = $resShort.Substring(0, 400) + "..." }
}

Write-Host ("id=" + $job.id + " status=" + $job.status)
if ($resShort) { Write-Host ("result=" + $resShort) }
