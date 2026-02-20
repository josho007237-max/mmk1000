$procTmnMode = $env:TMN_MODE
$userTmnMode = [Environment]::GetEnvironmentVariable("TMN_MODE", "User")
$machineTmnMode = [Environment]::GetEnvironmentVariable("TMN_MODE", "Machine")

$procDotenvPath = $env:DOTENV_CONFIG_PATH
$userDotenvPath = [Environment]::GetEnvironmentVariable("DOTENV_CONFIG_PATH", "User")
$machineDotenvPath = [Environment]::GetEnvironmentVariable("DOTENV_CONFIG_PATH", "Machine")
$procDotenvOverride = $env:DOTENV_CONFIG_OVERRIDE
$userDotenvOverride = [Environment]::GetEnvironmentVariable("DOTENV_CONFIG_OVERRIDE", "User")
$machineDotenvOverride = [Environment]::GetEnvironmentVariable("DOTENV_CONFIG_OVERRIDE", "Machine")

Write-Host "== TMN_MODE =="
Write-Host ("Process : {0}" -f $procTmnMode)
Write-Host ("User    : {0}" -f $userTmnMode)
Write-Host ("Machine : {0}" -f $machineTmnMode)

Write-Host ""
Write-Host "== DOTENV PATH =="
Write-Host ("Process DOTENV_CONFIG_PATH     : {0}" -f $procDotenvPath)
Write-Host ("User DOTENV_CONFIG_PATH        : {0}" -f $userDotenvPath)
Write-Host ("Machine DOTENV_CONFIG_PATH     : {0}" -f $machineDotenvPath)
Write-Host ("Process DOTENV_CONFIG_OVERRIDE : {0}" -f $procDotenvOverride)
Write-Host ("User DOTENV_CONFIG_OVERRIDE    : {0}" -f $userDotenvOverride)
Write-Host ("Machine DOTENV_CONFIG_OVERRIDE : {0}" -f $machineDotenvOverride)

Write-Host ""
Write-Host "== nssm AppEnvironmentExtra (mmk1000-web) =="
try {
  & nssm get mmk1000-web AppEnvironmentExtra
} catch {
  Write-Host "nssm query failed: $($_.Exception.Message)"
}
