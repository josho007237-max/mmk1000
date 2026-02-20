Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Please run as Administrator.' -ForegroundColor Red
  exit 1
}

Restart-Service Cloudflared -Force

$resp = curl.exe -s -i https://mmk1000.bn9.app/api/health
$firstLine = (($resp -split "`r?`n") | Select-Object -First 1)
$statusCode = ''
if ($firstLine -match '^HTTP/\S+\s+(\d{3})') {
  $statusCode = $Matches[1]
}

Write-Host "status=$statusCode"
Write-Host "$firstLine"
