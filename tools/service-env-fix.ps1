# tools/service-env-fix.ps1
$ErrorActionPreference = "Continue"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-Host "Admin required. Run:"
  Write-Host 'Start-Process pwsh -Verb RunAs -ArgumentList "-File C:\Users\ADMIN\MMK1000\tools\service-env-fix.ps1"'
  exit 1
}

Write-Host "Current AppEnvironmentExtra:"
try { nssm get mmk1000-web AppEnvironmentExtra } catch { Write-Host "nssm get failed"; exit 1 }

Write-Host "Setting AppEnvironmentExtra +DOTENV_CONFIG_DEBUG=false"
try { nssm set mmk1000-web AppEnvironmentExtra +DOTENV_CONFIG_DEBUG=false } catch { Write-Host "nssm set failed"; exit 1 }

Write-Host "Restarting service mmk1000-web"
try { nssm restart mmk1000-web } catch { Write-Host "nssm restart failed"; exit 1 }

Write-Host "AppEnvironmentExtra after update:"
try { nssm get mmk1000-web AppEnvironmentExtra } catch { Write-Host "nssm get failed"; exit 1 }
