# tools/check-syntax.ps1
$ErrorActionPreference = "Stop"

# repo root = parent of /tools
$ROOT = Split-Path -Parent $PSScriptRoot

# sanity: node exists
$node = Get-Command node -ErrorAction Stop
Write-Host ("node: " + (& node -v))

$targets = @()
$targets += Get-ChildItem (Join-Path $ROOT "src") -Filter *.mjs -File -Recurse -ErrorAction SilentlyContinue
$targets += Get-Item (Join-Path $ROOT "public\app.js") -ErrorAction SilentlyContinue

if (-not $targets -or $targets.Count -eq 0) {
  Write-Host "[FAIL] no target files found (src/*.mjs, public/app.js)" -ForegroundColor Red
  exit 1
}

$fail = 0
foreach ($f in $targets) {
  try {
    & node --check $f.FullName | Out-Null
    Write-Host ("[OK]   " + $f.FullName)
  } catch {
    $fail = 1
    Write-Host ("[FAIL] " + $f.FullName) -ForegroundColor Red
    Write-Host ("       " + $_.Exception.Message) -ForegroundColor Red
  }
}

if ($fail -ne 0) { exit 1 }
Write-Host "[DONE] all syntax checks passed."
exit 0
