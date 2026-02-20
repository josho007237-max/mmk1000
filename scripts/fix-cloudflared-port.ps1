Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$cfg = 'C:\Users\ADMIN\.cloudflared\mmk1000.yml'
if (-not (Test-Path $cfg)) {
  Write-Host "config_not_found=$cfg"
  exit 1
}

$raw = Get-Content -Path $cfg -Raw
$updated = $raw -replace 'service:\s*http://127\.0\.0\.1:4100', 'service: http://127.0.0.1:4101'
if ($updated -ne $raw) {
  Set-Content -Path $cfg -Value $updated -Encoding UTF8
}

$match = Select-String -Path $cfg -Pattern 'hostname:\s*mmk1000\.bn9\.app' -Context 0,2 | Select-Object -First 1
if ($match) {
  Write-Host $match.Line
  foreach ($ctx in $match.Context.PostContext) {
    if ($ctx -match '^\s*service:') {
      Write-Host $ctx
    }
  }
}

Restart-Service -Name Cloudflared -Force

$out = & curl.exe -S -I --ssl-no-revoke --connect-timeout 5 --max-time 15 https://mmk1000.bn9.app/api/health 2>&1
$curlExitCode = $LASTEXITCODE
$out | ForEach-Object { Write-Host $_ }
if ($curlExitCode -ne 0) {
  Write-Host "curl_exit_code=$curlExitCode"
  exit $curlExitCode
}
