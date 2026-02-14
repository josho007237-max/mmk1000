param(
  [ValidateSet("Startup", "RunKey")]
  [string]$Mode = "Startup"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $repoRoot "tools"
$logsDir = Join-Path $repoRoot "logs"
$sourceCmd = "C:\Users\ADMIN\MMK1000\tools\run-all.cmd"
$targetName = "MMK1000-Cloudflared.cmd"

New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

if (-not (Test-Path $sourceCmd)) {
  throw "Missing required file: $sourceCmd"
}

if ($Mode -eq "Startup") {
  $startupDir = [Environment]::GetFolderPath("Startup")
  $targetCmd = Join-Path $startupDir $targetName
  Copy-Item -Path $sourceCmd -Destination $targetCmd -Force
  Write-Host "Installed Startup shortcut script:"
  Write-Host "  $targetCmd"
  exit 0
}

$runKey = "HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
$cmdValue = "`"$sourceCmd`""
reg add $runKey /v "MMK1000-Cloudflared" /t REG_SZ /d $cmdValue /f | Out-Null
Write-Host "Installed HKCU Run key: MMK1000-Cloudflared"
Write-Host "  $cmdValue"
