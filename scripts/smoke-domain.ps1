Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$url = 'https://mmk1000.bn9.app/api/health'
$out = & curl.exe -S -v -i --ssl-no-revoke --connect-timeout 5 --max-time 15 $url 2>&1
$curlExitCode = $LASTEXITCODE

# Keep non-silent behavior: print curl output (stdout/stderr) without app secrets handling.
$out | ForEach-Object { Write-Host $_ }

$httpLines = $out | Where-Object { $_ -match '^HTTP/\d' }
$httpLine = ($httpLines | Select-Object -Last 1)
if ($httpLine) {
  if ($httpLine -match '^HTTP/\d(?:\.\d)?\s+(\d{3})') { $code = [int]$Matches[1] } else { $code = 0 }
  Write-Host "status_code=$code"
  Write-Host "http_line=$httpLine"
} else {
  Write-Host 'status_code=0'
  Write-Host 'http_line='
}

if ($curlExitCode -ne 0) {
  Write-Host "curl_exit_code=$curlExitCode"
  exit $curlExitCode
}
