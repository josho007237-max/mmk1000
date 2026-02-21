[CmdletBinding()]
param(
  [string]$LogPath = "logs\web.err.log"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $LogPath)) {
  Write-Host "log_not_found=$LogPath"
  exit 1
}

$patterns = @('EADDRINUSE','MAS-401','shield','502')
Write-Host "scan_file=$LogPath"
foreach ($p in $patterns) {
  Write-Host "--- pattern=$p ---"
  Select-String -Path $LogPath -Pattern $p -CaseSensitive:$false |
    Select-Object -Last 50 |
    ForEach-Object { Write-Host $_.Line }
}
