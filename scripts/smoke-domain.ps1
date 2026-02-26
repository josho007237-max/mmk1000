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
    CurlExitCode = $curlExitCode
    StatusCode   = $statusCode
  }
}

$localResult = Invoke-HealthCurl -Url $localHealthUrl
$domainResult = Invoke-HealthCurl -Url $domainHealthUrl -SslNoRevoke

$localPass = ($localResult.CurlExitCode -eq 0) -and ($localResult.StatusCode -eq 200)
$domainPass = ($domainResult.CurlExitCode -eq 0) -and ($domainResult.StatusCode -in @(200, 403))

$exitCode = 0
if (-not $localPass -and -not $domainPass) {
  $exitCode = 3
} elseif (-not $localPass) {
  $exitCode = 1
} elseif (-not $domainPass) {
  $exitCode = 2
}

Write-Host "summary_local=$($localPass ? 'PASS' : 'FAIL') http=$($localResult.StatusCode) url=$localHealthUrl"
Write-Host "summary_domain=$($domainPass ? 'PASS' : 'FAIL') http=$($domainResult.StatusCode) url=$domainHealthUrl"
Write-Host "summary_overall=$($exitCode -eq 0 ? 'PASS' : 'FAIL') exit=$exitCode"

exit $exitCode
