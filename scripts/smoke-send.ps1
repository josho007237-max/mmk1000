param(
  [string]$Base = "http://127.0.0.1:4100/api",
  [string]$AdminKey = "mmk1000"
)

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null
  )
  $args = @("-sS", "-X", $Method, $Url, "-H", "Content-Type: application/json", "-H", "x-admin-key: $AdminKey")
  if ($Body -ne $null) {
    $json = $Body | ConvertTo-Json -Compress
    $args += @("-d", $json)
  }
  $raw = & curl.exe @args -w "`n__HTTP__:%{http_code}"
  $parts = $raw -split "__HTTP__:"
  $content = ($parts[0] ?? "").Trim()
  $status = [int](($parts[1] ?? "0").Trim())
  $obj = $null
  if ($content) {
    try { $obj = $content | ConvertFrom-Json } catch { $obj = $null }
  }
  return [pscustomobject]@{ status = $status; body = $obj; raw = $content }
}

function Parse-Resp($raw) {
  $parts = $raw -split "__HTTP__:"
  $content = ($parts[0] ?? "").Trim()
  $status = [int](($parts[1] ?? "0").Trim())
  $obj = $null
  if ($content) {
    try { $obj = $content | ConvertFrom-Json } catch { $obj = $null }
  }
  return [pscustomobject]@{ status = $status; body = $obj; raw = $content }
}

Write-Host "== smoke-send =="

$create = Invoke-Api "POST" "$Base/withdraw/create" @{
  type = "bank"
  amount = 1
  dest = @{ bank_code = "scb"; bank_ac = "1234567890" }
}
if ($create.status -ne 200) { throw "create_failed status=$($create.status) body=$($create.raw)" }
$id = $create.body.job.id
Write-Host "created id=$id status=$($create.body.job.status)"

$approve = Invoke-Api "POST" "$Base/withdraw/$id/approve" @{}
if ($approve.status -ne 200) { throw "approve_failed status=$($approve.status) body=$($approve.raw)" }
Write-Host "approved id=$id status=$($approve.body.job.status)"

$send1 = Invoke-Api "POST" "$Base/withdraw/$id/send" @{}
if ($send1.status -ne 200) { throw "send_failed status=$($send1.status) body=$($send1.raw)" }
Write-Host "sent id=$id status=$($send1.body.job.status)"

$send2 = Invoke-Api "POST" "$Base/withdraw/$id/send" @{}
if ($send2.status -ne 409 -or $send2.body.error -ne "already_sent") {
  throw "send_again_expected_409_already_sent status=$($send2.status) body=$($send2.raw)"
}
Write-Host "send_again ok status=409 error=already_sent"

$create2 = Invoke-Api "POST" "$Base/withdraw/create" @{
  type = "bank"
  amount = 1
  dest = @{ bank_code = "scb"; bank_ac = "1234567890" }
}
if ($create2.status -ne 200) { throw "create2_failed status=$($create2.status) body=$($create2.raw)" }
$id2 = $create2.body.job.id
$approve2 = Invoke-Api "POST" "$Base/withdraw/$id2/approve" @{}
if ($approve2.status -ne 200) { throw "approve2_failed status=$($approve2.status) body=$($approve2.raw)" }

$sendUrl = "$Base/withdraw/$id2/send"
$jobA = Start-Job -ScriptBlock {
  param($url, $adminKey)
  & curl.exe -sS -X POST $url -H "Content-Type: application/json" -H "x-admin-key: $adminKey" -d "{}" -w "`n__HTTP__:%{http_code}"
} -ArgumentList $sendUrl, $AdminKey
$jobB = Start-Job -ScriptBlock {
  param($url, $adminKey)
  & curl.exe -sS -X POST $url -H "Content-Type: application/json" -H "x-admin-key: $adminKey" -d "{}" -w "`n__HTTP__:%{http_code}"
} -ArgumentList $sendUrl, $AdminKey

Wait-Job $jobA, $jobB | Out-Null
$rawA = Receive-Job $jobA
$rawB = Receive-Job $jobB
Remove-Job $jobA, $jobB | Out-Null

$rA = Parse-Resp $rawA
$rB = Parse-Resp $rawB
$lockedCount = 0
if ($rA.status -eq 409 -and $rA.body.error -eq "locked") { $lockedCount++ }
if ($rB.status -eq 409 -and $rB.body.error -eq "locked") { $lockedCount++ }
if ($lockedCount -lt 1) {
  throw "expected_locked_409_at_least_once rA=$($rA.status) rB=$($rB.status)"
}
Write-Host "concurrent send ok locked=$lockedCount"

Write-Host "== done =="
