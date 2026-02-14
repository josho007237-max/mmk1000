param(
  [string]$Local  = "http://127.0.0.1:4100/api/health",
  [string]$Remote = "https://mmk1000.bn9.app/api/health"
)

Write-Host "== LOCAL ==" -ForegroundColor Yellow
curl.exe -sS $Local
"`n"

Write-Host "== REMOTE ==" -ForegroundColor Yellow
curl.exe --ssl-no-revoke -sS $Remote
"`n"
