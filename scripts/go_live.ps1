param(
  [string]$WebServiceName = "mmk1000-web",
  [string]$TunnelServiceName = "mmk1000-tunnel",
  [string]$RepoDir = "C:\Users\ADMIN\MMK1000",
  [string]$LocalHealthUrl = "http://127.0.0.1:4101/api/health",
  [string]$PublicHealthUrl = "https://mmk1000.bn9.app/api/health",
  [string]$CloudflaredConfigPath = "$env:USERPROFILE\.cloudflared\config.yml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Port = if ([string]::IsNullOrWhiteSpace($env:PORT)) { 4101 } else { [int]$env:PORT }
$LocalHealthUrl = "http://127.0.0.1:$Port/api/health"

$failed = $false

function Write-StepResult {
  param(
    [string]$Step,
    [bool]$Pass,
    [string]$Detail,
    [string]$Fix
  )

  if ($Pass) {
    Write-Host ("PASS [{0}] {1}" -f $Step, $Detail) -ForegroundColor Green
  } else {
    $script:failed = $true
    Write-Host ("FAIL [{0}] {1}" -f $Step, $Detail) -ForegroundColor Red
    if ($Fix) {
      Write-Host ("  FIX: {0}" -f $Fix) -ForegroundColor Yellow
    }
  }
}

function Test-Health {
  param([string]$Url)
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
    return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Get-NssmPath {
  $cmd = Get-Command nssm.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return $cmd.Source }
  $fallback = "C:\nssm\win64\nssm.exe"
  if (Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
  return $null
}

function Ensure-ServiceInstalled {
  param(
    [string]$Nssm,
    [string]$Name,
    [string]$Application,
    [string]$AppDirectory,
    [string]$AppParameters
  )

  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $svc) {
    & $Nssm install $Name $Application $AppParameters | Out-Null
    & $Nssm set $Name AppDirectory $AppDirectory | Out-Null
  }
}

$nssm = Get-NssmPath
Write-StepResult -Step "0.nssm" -Pass ([bool]$nssm) -Detail ("nssm path: {0}" -f $nssm) -Fix "Install NSSM and ensure nssm.exe is in PATH"
if (-not $nssm) { exit 1 }

$localHealthBefore = Test-Health -Url $LocalHealthUrl
Write-StepResult -Step "1.local-health-before" -Pass $localHealthBefore -Detail $LocalHealthUrl -Fix "Start web service manually: nssm start $WebServiceName"

$envLine = "PORT=$Port DOTENV_CONFIG_PATH=$RepoDir\.env DOTENV_CONFIG_OVERRIDE=true DOTENV_CONFIG_QUIET=true"
try {
  & $nssm set $WebServiceName AppEnvironmentExtra $envLine | Out-Null
  Write-StepResult -Step "2.set-web-env" -Pass $true -Detail $envLine -Fix "nssm set $WebServiceName AppEnvironmentExtra \"$envLine\""
} catch {
  Write-StepResult -Step "2.set-web-env" -Pass $false -Detail $_.Exception.Message -Fix "Run PowerShell as Administrator and retry"
}

try {
  & $nssm restart $WebServiceName | Out-Null
  Start-Sleep -Seconds 2
  Write-StepResult -Step "3.restart-web" -Pass $true -Detail "restarted $WebServiceName" -Fix "nssm restart $WebServiceName"
} catch {
  Write-StepResult -Step "3.restart-web" -Pass $false -Detail $_.Exception.Message -Fix "Check service config: nssm edit $WebServiceName"
}

$localHealthAfter = Test-Health -Url $LocalHealthUrl
Write-StepResult -Step "4.local-health-after" -Pass $localHealthAfter -Detail $LocalHealthUrl -Fix "Check logs under $RepoDir\logs"

$cfgOk = $false
if (Test-Path -LiteralPath $CloudflaredConfigPath -PathType Leaf) {
  $cfg = Get-Content -LiteralPath $CloudflaredConfigPath -Raw
  $cfgOk = $cfg -match "http://127\.0\.0\.1:4101"
  Write-StepResult -Step "5.cloudflared-config" -Pass $cfgOk -Detail $CloudflaredConfigPath -Fix "Set ingress service to http://127.0.0.1:4101 in $CloudflaredConfigPath"
} else {
  Write-StepResult -Step "5.cloudflared-config" -Pass $false -Detail ("missing: {0}" -f $CloudflaredConfigPath) -Fix "Create cloudflared config at $CloudflaredConfigPath"
}

$cloudflaredExe = "cloudflared"
$cloudflaredArgs = "--config $CloudflaredConfigPath tunnel run mmk1000"
try {
  Ensure-ServiceInstalled -Nssm $nssm -Name $TunnelServiceName -Application $cloudflaredExe -AppDirectory $RepoDir -AppParameters $cloudflaredArgs
  & $nssm set $TunnelServiceName Application $cloudflaredExe | Out-Null
  & $nssm set $TunnelServiceName AppDirectory $RepoDir | Out-Null
  & $nssm set $TunnelServiceName AppParameters $cloudflaredArgs | Out-Null
  & $nssm restart $TunnelServiceName | Out-Null
  Write-StepResult -Step "6.tunnel-service" -Pass $true -Detail "$TunnelServiceName => $cloudflaredArgs" -Fix "nssm set $TunnelServiceName AppParameters \"$cloudflaredArgs\""
} catch {
  Write-StepResult -Step "6.tunnel-service" -Pass $false -Detail $_.Exception.Message -Fix "Ensure cloudflared is installed and run PowerShell as Administrator"
}

$publicHealth = Test-Health -Url $PublicHealthUrl
Write-StepResult -Step "7.public-health" -Pass $publicHealth -Detail $PublicHealthUrl -Fix "Check tunnel status: cloudflared tunnel info mmk1000"

if ($failed) {
  Write-Host "Go-Live MMK1000 result: FAIL" -ForegroundColor Red
  exit 1
}

Write-Host "Go-Live MMK1000 result: PASS" -ForegroundColor Green
