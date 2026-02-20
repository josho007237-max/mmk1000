# tools/fix-dotenv-nssm.ps1
$ErrorActionPreference = "Continue"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-Host "Admin required. Run:"
  Write-Host 'Start-Process pwsh -Verb RunAs -ArgumentList "-File C:\Users\ADMIN\MMK1000\tools\fix-dotenv-nssm.ps1"'
  exit 1
}

try {
  nssm set mmk1000-web AppEnvironmentExtra -DOTENV_CONFIG_DEBUG
  nssm set mmk1000-web AppEnvironmentExtra +DOTENV_CONFIG_QUIET=true
  nssm restart mmk1000-web
} catch {
  Write-Host "nssm command failed"
  exit 1
}

Write-Host "AppEnvironmentExtra (DOTENV_CONFIG_*):"
try {
  $envExtra = nssm get mmk1000-web AppEnvironmentExtra
  $envExtra | Select-String -Pattern "DOTENV_CONFIG_" | ForEach-Object { $_.Line }
} catch {
  Write-Host "nssm get failed"
}

Write-Host "Logs tail (grep dotenv/debug):"
try {
  $stdout = nssm get mmk1000-web AppStdout
  $stderr = nssm get mmk1000-web AppStderr
  if ($stdout) {
    Get-Content $stdout -Tail 200 | Select-String -Pattern "\[dotenv@|injecting env|\[DEBUG\]"
  }
  if ($stderr) {
    Get-Content $stderr -Tail 200 | Select-String -Pattern "\[dotenv@|injecting env|\[DEBUG\]"
  }
} catch {
  Write-Host "log tail failed"
}
