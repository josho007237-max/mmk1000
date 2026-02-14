$ErrorActionPreference = "Stop"

# Always start from project root (not caller's cwd)
Set-Location -Path (Join-Path $PSScriptRoot "..")

function Normalize-AdminKeys([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return "" }
  return (($value -split ",") |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -ne "" }) -join ","
}

$env:PORT = "4100"
$env:TMN_MODE = "mock"

$netstatLine = netstat -ano | Select-String -Pattern "LISTENING" | Select-String -Pattern ":4100\s"
if ($netstatLine) {
  $tokens = ($netstatLine | Select-Object -First 1).ToString().Trim() -split "\s+"
  $portPid = $tokens[-1]
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $portPid" -ErrorAction SilentlyContinue
  Write-Host "Port 4100 is already listening"
  Write-Host ("PID: {0}" -f $portPid)
  Write-Host ("CommandLine: {0}" -f ($proc.CommandLine ?? "(unknown)"))
  Write-Host "พอร์ตถูกใช้อยู่ ให้ taskkill /PID <pid> /F หรือเปลี่ยน PORT"
  exit 1
}

$modeInput = (Read-Host "ADMIN_KEYS mode? [R]eplace/[A]ppend (default: Replace)").Trim()
if ([string]::IsNullOrWhiteSpace($modeInput)) { $modeInput = "R" }

$mode = $modeInput.ToUpperInvariant()
if ($mode -ne "R" -and $mode -ne "REPLACE" -and $mode -ne "A" -and $mode -ne "APPEND") {
  Write-Host "Invalid mode. Use Replace or Append."
  exit 1
}

$adminKeysInput = Read-Host "Enter ADMIN_KEYS (comma-separated)"
$newKeys = Normalize-AdminKeys $adminKeysInput
$oldKeys = Normalize-AdminKeys $env:ADMIN_KEYS

if ($mode -eq "R" -or $mode -eq "REPLACE") {
  $env:ADMIN_KEYS = $newKeys
} else {
  if ([string]::IsNullOrWhiteSpace($oldKeys)) {
    $env:ADMIN_KEYS = $newKeys
  } elseif ([string]::IsNullOrWhiteSpace($newKeys)) {
    $env:ADMIN_KEYS = $oldKeys
  } else {
    $env:ADMIN_KEYS = Normalize-AdminKeys "$oldKeys,$newKeys"
  }
}

Write-Host ("ADMIN_KEYS: {0}" -f $env:ADMIN_KEYS)

Write-Host "MMK1000 dev server"
Write-Host "URL:    http://127.0.0.1:4100"
Write-Host "Health: http://127.0.0.1:4100/api/health"

node .\src\server.mjs
