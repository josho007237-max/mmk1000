Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$url = 'https://mmk1000.bn9.app/api/health'
$curlArgs = @(
  '-S',
  '-v',
  '-i',
  '--ssl-no-revoke',
  '--connect-timeout', '5',
  '--max-time', '15',
  $url
)

$output = & curl.exe @curlArgs 2>&1
$curlExitCode = $LASTEXITCODE

# Keep non-silent behavior: print curl output (stdout/stderr) without app secrets handling.
$output | ForEach-Object { Write-Host $_ }

$httpLine = (($output | Where-Object { $_ -match '^HTTP/\S+\s+\d{3}' }) | Select-Object -Last 1)
if ($httpLine) {
  $statusCode = ''
  if ($httpLine -match '^HTTP/\S+\s+(\d{3})') {
    $statusCode = $Matches[1]
  }
  Write-Host "status_code=$statusCode"
  Write-Host "http_line=$httpLine"
} else {
  Write-Host 'status_code='
  Write-Host 'http_line='
}

if ($curlExitCode -ne 0) {
  Write-Host "curl_exit_code=$curlExitCode"
  exit $curlExitCode
}
