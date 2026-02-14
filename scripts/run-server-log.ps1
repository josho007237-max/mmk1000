$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

$pattern = "tmn|ensureLogin|balance|tx|face|token|expired|error"
node .\src\server.mjs 2>&1 | Select-String -Pattern $pattern
