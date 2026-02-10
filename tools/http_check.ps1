param()

$urls = @(
  @{ Url = "https://mmk1000-dev.bn9.app/"; Method = "HEAD"; Label = "Homepage (HEAD)" },
  @{ Url = "https://mmk1000-dev.bn9.app/api/health"; Method = "GET"; Label = "Health (GET)" }
)

foreach ($item in $urls) {
  $url = $item.Url
  $method = $item.Method
  $label = $item.Label

  $args = @("--ssl-no-revoke", "-sS", "-o", "NUL", "-w", "%{http_code}")
  if ($method -eq "HEAD") {
    $args = @("--ssl-no-revoke", "-sS", "-o", "NUL", "-w", "%{http_code}", "-I")
  }

  $httpCode = ""
  $exitCode = 0
  try {
    $httpCode = & curl.exe @args $url
    $exitCode = $LASTEXITCODE
  } catch {
    $exitCode = 1
  }

  if ($exitCode -eq 0 -and $httpCode -match "^\d{3}$") {
    Write-Host ("PASS: {0} {1} -> HTTP {2}" -f $label, $url, $httpCode)
  } else {
    $detail = if ($httpCode) { "HTTP $httpCode" } else { "no status" }
    Write-Host ("FAIL: {0} {1} -> {2} (exit {3})" -f $label, $url, $detail, $exitCode)
  }
}
