Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$ROOT = Split-Path -Parent $PSScriptRoot
$null = Get-Command node -ErrorAction Stop

$targets = @()
$targets += Get-ChildItem (Join-Path $ROOT "src") -Filter *.mjs -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
$targets += (Join-Path $ROOT "public\app.js")
$targets += (Join-Path $ROOT "TMNOne.js")

$passCount = 0
$failCount = 0

Write-Host "=== Syntax check (node --check) ==="
foreach ($f in $targets) {
  node --check $f *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host ("PASS  " + $f) -ForegroundColor Green
    $passCount++
  } else {
    Write-Host ("FAIL  " + $f) -ForegroundColor Red
    $failCount++
  }
}

if ($failCount -gt 0) {
  Write-Host ("Result: FAIL (pass={0} fail={1})" -f $passCount, $failCount) -ForegroundColor Red
  exit 1
}

Write-Host ("Result: PASS (pass={0} fail={1})" -f $passCount, $failCount) -ForegroundColor Green
exit 0
