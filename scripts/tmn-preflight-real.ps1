Set-Location (Join-Path $PSScriptRoot "..")
$ErrorActionPreference = "Stop"
Write-Host "PWD=$PWD"
Write-Host "ScriptRoot=$PSScriptRoot"

$realEnvFile = ".\\scripts\\tmn-real.env.ps1"
if (-not (Test-Path -LiteralPath $realEnvFile)) {
  throw "Missing secrets file: scripts/tmn-real.env.ps1"
}

. $realEnvFile

npm run tmn:preflight
