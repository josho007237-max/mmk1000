# tools/smoke-withdraw.ps1
param(
  [string]$Id = "",
  [string]$AdminKey = ""
)

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

if (!$Id) {
  $first = $items | Where-Object { $_.status -eq "approved" } | Select-Object -First 1
  if (!$first) {
    Write-Host "no approved job found"
    exit 1
  }
  $Id = [string]$first.id
}

if (!$AdminKey) {
  $AdminKey = [string]$env:ADMIN_KEY
}
if (!$AdminKey) {
  Write-Host "missing admin key (set env ADMIN_KEY or pass -AdminKey)"
  exit 1
}

$url = "http://127.0.0.1:4100/api/withdraw/$Id/send"
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $url -Headers @{ "x-admin-key" = $AdminKey } -TimeoutSec 20 -SkipHttpErrorCheck
  $respContent = [string]$resp.Content
  if ($respContent.Length -gt 400) { $respContent = $respContent.Substring(0, 400) + "..." }
  Write-Host ("HTTP " + $resp.StatusCode)
  if ($respContent) { Write-Host ("resp=" + $respContent) }
} catch {
  Write-Host ("request failed: " + $_.Exception.Message)
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

$job = $items2 | Where-Object { [string]$_.id -eq $Id } | Select-Object -First 1
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
