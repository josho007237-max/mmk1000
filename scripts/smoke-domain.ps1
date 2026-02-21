[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$Domain
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$url = "https://$Domain/api/health"
$out = & curl.exe -sS -i --ssl-no-revoke --connect-timeout 8 --max-time 20 $url 2>&1
$curlExitCode = $LASTEXITCODE
$out | ForEach-Object { Write-Host $_ }

$httpLine = ($out | Where-Object { $_ -match '^HTTP/\d' } | Select-Object -Last 1)
$code = 0
if ($httpLine -and $httpLine -match '^HTTP/\d(?:\.\d)?\s+(\d{3})') {
  $code = [int]$Matches[1]
}

Write-Host "status_code=$code"
if ($httpLine) { Write-Host "http_line=$httpLine" } else { Write-Host 'http_line=' }
Write-Host "curl_exit_code=$curlExitCode"

if ($curlExitCode -ne 0) { exit $curlExitCode }
if ($code -eq 200) { exit 0 }
exit 1
