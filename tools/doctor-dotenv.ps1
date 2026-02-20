# tools/doctor-dotenv.ps1
$ErrorActionPreference = "Continue"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-Host "Admin required. Run:"
  Write-Host 'Start-Process pwsh -Verb RunAs -ArgumentList "-File C:\Users\ADMIN\MMK1000\tools\doctor-dotenv.ps1"'
  exit 1
}

Write-Host "Service env (DOTENV_CONFIG_*):"
try {
  Write-Host "DOTENV_CONFIG_DEBUG:"
  nssm get mmk1000-web AppEnvironmentExtra DOTENV_CONFIG_DEBUG
  Write-Host "DOTENV_CONFIG_QUIET:"
  nssm get mmk1000-web AppEnvironmentExtra DOTENV_CONFIG_QUIET
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

if ($stdout -and (Test-Path $stdout)) { try { Clear-Content $stdout } catch {} }
if ($stderr -and (Test-Path $stderr)) { try { Clear-Content $stderr } catch {} }

try { nssm restart mmk1000-web } catch { Write-Host "nssm restart failed" }

try {
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://127.0.0.1:4100/api/health | Out-Null
} catch {
  Write-Host "health check failed"
}

$hits = @()
try {
  if ($stdout -and (Test-Path $stdout)) {
    $hits += Get-Content $stdout -Tail 200 | Select-String -Pattern "\[dotenv@|injecting env|\[DEBUG\]"
  }
  if ($stderr -and (Test-Path $stderr)) {
    $hits += Get-Content $stderr -Tail 200 | Select-String -Pattern "\[dotenv@|injecting env|\[DEBUG\]"
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
