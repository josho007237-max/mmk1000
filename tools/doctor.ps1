Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$script:PassCount = 0
$script:FailCount = 0

function Run-Check {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][ScriptBlock]$Action
  )
  Write-Host "`n== $Name ==" -ForegroundColor Cyan
  try {
    $ok = & $Action
    if ($ok) {
      $script:PassCount++
      Write-Host "[PASS] $Name" -ForegroundColor Green
    } else {
      $script:FailCount++
      Write-Host "[FAIL] $Name" -ForegroundColor Red
    }
  } catch {
    $script:FailCount++
    Write-Host "[FAIL] $Name" -ForegroundColor Red
    Write-Host $_.Exception.Message
  }
}

Run-Check "LOCAL health (curl http://127.0.0.1:4100/api/health)" {
  $res = curl.exe -sS "http://127.0.0.1:4100/api/health" 2>&1
  $text = ($res | Out-String).Trim()
  Write-Host $text
  return ($LASTEXITCODE -eq 0 -and $text -match '"ok"\s*:\s*true')
}

Run-Check "Tunnel info (cloudflared tunnel info mmk1000)" {
  $res = cloudflared tunnel info mmk1000 2>&1
  $text = ($res | Out-String).Trim()
  Write-Host $text
  return ($LASTEXITCODE -eq 0)
}

Run-Check "EDGE health headers (curl --ssl-no-revoke -I https://mmk1000.bn9.app/api/health)" {
  $res = curl.exe --ssl-no-revoke -sS -I "https://mmk1000.bn9.app/api/health" 2>&1
  $text = ($res | Out-String).Trim()
  Write-Host $text
  return ($LASTEXITCODE -eq 0 -and $text -match "HTTP/\d(\.\d)?\s+200")
}

Write-Host "`n==== SUMMARY ===="
Write-Host ("PASS={0} FAIL={1}" -f $script:PassCount, $script:FailCount)
if ($script:FailCount -gt 0) { exit 1 }
exit 0
