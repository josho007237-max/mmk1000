Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$env:DOTENV_CONFIG_PATH = ".env.tmn.real"
$env:DOTENV_CONFIG_OVERRIDE = "true"
Remove-Item Env:TMN_MODE -ErrorAction SilentlyContinue

node .\src\server.mjs
