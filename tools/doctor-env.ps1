# tools/doctor-env.ps1
$ErrorActionPreference = "Continue"

Write-Host "AppEnvironmentExtra (DOTENV_CONFIG_*):"
try {
  $envExtra = nssm get mmk1000-web AppEnvironmentExtra
  $envExtra | Select-String -Pattern "DOTENV_CONFIG_" | ForEach-Object { $_.Line }
} catch {
  Write-Host "nssm get failed"
}

try {
  nssm set mmk1000-web AppEnvironmentExtra -DOTENV_CONFIG_DEBUG
  nssm set mmk1000-web AppEnvironmentExtra +DOTENV_CONFIG_QUIET=true
} catch {
  Write-Host "nssm set failed"
}

$stdout = $null
$stderr = $null
try {
  $stdout = nssm get mmk1000-web AppStdout
  $stderr = nssm get mmk1000-web AppStderr
} catch {
  Write-Host "nssm get stdout/stderr failed"
}

try { nssm restart mmk1000-web } catch { Write-Host "nssm restart failed" }

$hits = @()
try {
  if ($stdout -and (Test-Path $stdout)) {
    $hits += Get-Content $stdout -Tail 200 | Select-String -Pattern "\[dotenv@|\[DEBUG\]|injecting env"
  }
  if ($stderr -and (Test-Path $stderr)) {
    $hits += Get-Content $stderr -Tail 200 | Select-String -Pattern "\[dotenv@|\[DEBUG\]|injecting env"
  }
} catch {
  Write-Host "log scan failed"
}

if ($hits -and $hits.Count -gt 0) {
  Write-Host "FAIL: dotenv/debug log found"
  $hits | ForEach-Object { Write-Host $_.Line }
  exit 1
} else {
  Write-Host "PASS: no dotenv/debug log in tail"
}
