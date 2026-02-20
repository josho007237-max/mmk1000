# tools/send-by-id.ps1
param(
  [Parameter(Mandatory = $true)][string]$Id,
  [string]$AdminKey = ""
)

$ErrorActionPreference = "Continue"
Set-Location "C:\Users\ADMIN\MMK1000"

if (!$AdminKey) {
  $AdminKey = [string]$env:ADMIN_KEY
}
if (!$AdminKey) {
  Write-Host "missing admin key (set env ADMIN_KEY)"
  exit 1
}

$url = "http://127.0.0.1:4100/api/withdraw/$Id/send"
try {
  curl -s -X POST -H "x-admin-key: $AdminKey" $url | Out-Null
} catch {
  Write-Host "request failed"
}

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

$job = $items | Where-Object { [string]$_.id -eq $Id } | Select-Object -First 1
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
