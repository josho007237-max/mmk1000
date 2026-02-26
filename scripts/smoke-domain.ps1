[CmdletBinding()]
param(
  [string]$Domain = 'mmk1000.bn9.app'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$localBase = if ($env:MMK_LOCAL) { $env:MMK_LOCAL.TrimEnd('/') } else { 'http://127.0.0.1:4100' }
$localHealthUrl = "$localBase/api/health"
$domainHealthUrl = "https://$Domain/api/health"

function Invoke-HealthCurl {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [switch]$SslNoRevoke
  )

  $args = @('-sS', '-i', '--connect-timeout', '8', '--max-time', '20')
  if ($SslNoRevoke) {
    $args += '--ssl-no-revoke'
  }
  $args += $Url

  $out = & curl.exe @args 2>&1
  $curlExitCode = $LASTEXITCODE

  $httpLine = ($out | Where-Object { $_ -match '^HTTP/\d' } | Select-Object -Last 1)
  $statusCode = 0
  if ($httpLine -and $httpLine -match '^HTTP/\d(?:\.\d)?\s+(\d{3})') {
    $statusCode = [int]$Matches[1]
  }

  [PSCustomObject]@{
    Url          = $Url
    Output       = $out
    CurlExitCode = $curlExitCode
    HttpLine     = $httpLine
    StatusCode   = $statusCode
  }
}

$localResult = Invoke-HealthCurl -Url $localHealthUrl
$domainResult = Invoke-HealthCurl -Url $domainHealthUrl -SslNoRevoke

Write-Host '=== local health ==='
$localResult.Output | ForEach-Object { Write-Host $_ }
Write-Host "local_status_code=$($localResult.StatusCode)"
Write-Host "local_http_line=$($localResult.HttpLine)"
Write-Host "local_curl_exit_code=$($localResult.CurlExitCode)"

Write-Host '=== domain health ==='
$domainResult.Output | ForEach-Object { Write-Host $_ }
Write-Host "domain_status_code=$($domainResult.StatusCode)"
Write-Host "domain_http_line=$($domainResult.HttpLine)"
Write-Host "domain_curl_exit_code=$($domainResult.CurlExitCode)"

$localPass = ($localResult.CurlExitCode -eq 0) -and ($localResult.StatusCode -eq 200)
$domainPass = ($domainResult.CurlExitCode -eq 0) -and ($domainResult.StatusCode -in @(200, 403))

Write-Host "summary_local=$($localPass ? 'PASS' : 'FAIL')"
Write-Host "summary_domain=$($domainPass ? 'PASS' : 'FAIL')"

if ($localPass -and $domainPass) {
  Write-Host 'summary_overall=PASS'
  exit 0
}

Write-Host 'summary_overall=FAIL'
if (-not $localPass -and -not $domainPass) {
  exit 3
}
if (-not $localPass) {
  exit 1
}
exit 2
