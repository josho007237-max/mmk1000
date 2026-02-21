[CmdletBinding()]
param(
  [string]$Host = '127.0.0.1',
  [int]$Port = 4100,
  [string]$BaseUrl = 'http://127.0.0.1:4100',
  [string]$AdminKey = $env:ADMIN_KEY
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "== Local port check =="
$tnc = Test-NetConnection -ComputerName $Host -Port $Port -WarningAction SilentlyContinue
Write-Host "port_open=$($tnc.TcpTestSucceeded) host=$Host port=$Port"

Write-Host "== Local health check =="
$healthUrl = "$BaseUrl/api/health"
$healthOut = & curl.exe -sS -i --connect-timeout 5 --max-time 15 $healthUrl 2>&1
$healthCode = $LASTEXITCODE
$healthOut | ForEach-Object { Write-Host $_ }
Write-Host "curl_exit_code=$healthCode"

Write-Host "== Example queue call with x-admin-key =="
if (-not [string]::IsNullOrWhiteSpace($AdminKey)) {
  $queueUrl = "$BaseUrl/api/withdraw/queue"
  $queueOut = & curl.exe -sS -i -H "x-admin-key: $AdminKey" --connect-timeout 5 --max-time 15 $queueUrl 2>&1
  $queueOut | ForEach-Object { Write-Host $_ }
  Write-Host "queue_curl_exit_code=$LASTEXITCODE"
} else {
  Write-Host 'ADMIN_KEY is empty; set $env:ADMIN_KEY then re-run for queue check.'
}

exit $healthCode
