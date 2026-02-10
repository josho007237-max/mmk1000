$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT

Write-Host ("node: " + (& node -v))

$targets = @(
  "src/server.mjs",
  "src/withdraw.store.mjs",
  "src/tmn.adapter.mjs",
  "scripts/guard-smoke.mjs",
  "scripts/doctor-real.mjs"
)

$failed = $false

foreach ($t in $targets) {
  try {
    & node --check $t | Out-Null
    Write-Host "[OK] check $t"
  } catch {
    Write-Host "[FAIL] check $t" -ForegroundColor Red
    $failed = $true
  }
}

if ($failed) { exit 1 }

Write-Host "[RUN] node scripts/guard-smoke.mjs"
& node scripts/guard-smoke.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[RUN] node scripts/doctor-real.mjs"
& node scripts/doctor-real.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$patterns = @("TMN_PIN6", "TMN_LOGIN_TOKEN", "x-tmn-pin6", "x-tmn-login-token")
$logFiles = Get-ChildItem -Path $ROOT -Recurse -File -Include *.log -ErrorAction SilentlyContinue
$hits = @()

foreach ($lf in $logFiles) {
  foreach ($pat in $patterns) {
    $match = Select-String -Path $lf.FullName -SimpleMatch -Pattern $pat -ErrorAction SilentlyContinue
    if ($match) {
      $hits += [pscustomobject]@{
        File = $lf.FullName
        Pattern = $pat
      }
    }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "[FAIL] sensitive token markers found in logs:" -ForegroundColor Red
  $hits | Select-Object -Unique File, Pattern | Format-Table -AutoSize | Out-String | Write-Host
  exit 1
}

Write-Host "[OK] log scan clean"

$BASE = if ($env:MMK_BASE) { $env:MMK_BASE } else { "http://127.0.0.1:4100" }
$ADMIN_KEY = if ($env:ADMIN_KEY) { $env:ADMIN_KEY } else { "devkey" }

function Test-ApiOk([string]$path) {
  $url = "$BASE$path"
  Write-Host "[RUN] curl $url"
  $raw = & curl.exe -sS -f -H "x-admin-key: $ADMIN_KEY" $url
  if ($LASTEXITCODE -ne 0) {
    throw "curl_failed:$path"
  }
  $obj = $raw | ConvertFrom-Json
  if ($obj.ok -ne $true) {
    throw "api_not_ok:$path"
  }
  Write-Host "[OK] $path ok=true"
}

Test-ApiOk "/api/health"
Test-ApiOk "/api/withdraw/queue"

Write-Host "[DONE] doctor checks passed."
exit 0
