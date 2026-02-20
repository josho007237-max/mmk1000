$ErrorActionPreference = "Stop"

$ServiceName = "mmk1000-web"
$Port = 4100
$BaseDir = "C:\Users\ADMIN\MMK1000"
$LogOut = Join-Path $BaseDir "logs\web.out.log"
$LogErr = Join-Path $BaseDir "logs\web.err.log"

function Is-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Is-Admin)) {
  Write-Host "ERROR: ต้องเปิด PowerShell แบบ Run as administrator" -ForegroundColor Red
  exit 1
}

Write-Host "[1/5] Stop service $ServiceName (ignore errors)..." -ForegroundColor Yellow
try { & nssm stop $ServiceName | Out-Null } catch {}

Write-Host "[2/5] Kill listener on port $Port (if any)..." -ForegroundColor Yellow
try {
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c -and $c.OwningProcess) {
    Write-Host " - killing PID $($c.OwningProcess)" -ForegroundColor DarkYellow
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  }
} catch {}

Write-Host "[3/5] Start service $ServiceName..." -ForegroundColor Yellow
& nssm start $ServiceName | Out-Null
Start-Sleep -Seconds 2

Write-Host "[4/5] Verify port + health..." -ForegroundColor Yellow
$c2 = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $c2) {
  Write-Host "ERROR: port $Port ยังไม่ listen" -ForegroundColor Red
  sc.exe queryex $ServiceName
  if (Test-Path $LogErr) { Get-Content $LogErr -Tail 120 }
  exit 2
}

try {
  $health = Invoke-WebRequest "http://127.0.0.1:$Port/api/health" -UseBasicParsing
  Write-Host "health: $($health.StatusCode) $($health.StatusDescription)"
  Write-Host $health.Content
} catch {
  Write-Host "WARN: health check failed" -ForegroundColor DarkYellow
}

Write-Host "[5/5] Tail logs..." -ForegroundColor Yellow
if (Test-Path $LogErr) { Write-Host "`n--- web.err.log ---"; Get-Content $LogErr -Tail 80 } else { Write-Host "no web.err.log yet" }
if (Test-Path $LogOut) { Write-Host "`n--- web.out.log ---"; Get-Content $LogOut -Tail 80 } else { Write-Host "no web.out.log yet" }

Write-Host "`nOK service-restart done" -ForegroundColor Green
