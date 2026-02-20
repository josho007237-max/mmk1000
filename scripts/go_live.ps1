param(
  [string]$WebServiceName = "mmk1000-web",
  [string]$TunnelServiceName = "mmk1000-tunnel",
  [string]$RepoDir = "C:\Users\ADMIN\MMK1000",
  [string]$CloudflaredConfigPath = "$env:USERPROFILE\.cloudflared\config.yml",
  [string]$PublicHealthUrl = "https://mmk1000.bn9.app/api/health"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:HasFail = $false

function Write-StepResult {
  param(
    [string]$Step,
    [bool]$Pass,
    [string]$Detail,
    [string]$Fix
  )

  if ($Pass) {
    Write-Host ("PASS [{0}] {1}" -f $Step, $Detail) -ForegroundColor Green
    return
  }

  $script:HasFail = $true
  Write-Host ("FAIL [{0}] {1}" -f $Step, $Detail) -ForegroundColor Red
  if ($Fix) {
    Write-Host ("  FIX: {0}" -f $Fix) -ForegroundColor Yellow
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

function Parse-EnvLines {
  param([string]$Text)
  $map = [ordered]@{}
  if ([string]::IsNullOrWhiteSpace($Text)) { return $map }

  $lines = $Text -split "`r?`n"
  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch "=") { continue }
    $parts = $line -split "=", 2
    $k = $parts[0].Trim()
    $v = $parts[1]
    if (-not [string]::IsNullOrWhiteSpace($k)) {
      $map[$k] = $v
    }
  }
  return $map
}

function Merge-EnvExtra {
  param(
    [string]$Current,
    [hashtable]$Override
  )

  $map = Parse-EnvLines -Text $Current
  foreach ($k in $Override.Keys) {
    $map[$k] = [string]$Override[$k]
  }

  $out = @()
  foreach ($k in $map.Keys) {
    $out += ("{0}={1}" -f $k, $map[$k])
  }
  return ($out -join "`n")
}

function Get-ConfiguredPortFromCloudflared {
  param([string]$ConfigPath)
  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { return $null }

  $cfg = Get-Content -LiteralPath $ConfigPath -Raw
  $rxHost = [regex]"(?ms)hostname:\s*mmk1000\.bn9\.app\s*.*?service:\s*http://127\.0\.0\.1:(\d+)"
  $m = $rxHost.Match($cfg)
  if ($m.Success) { return [int]$m.Groups[1].Value }

  $rxAny = [regex]"http://127\.0\.0\.1:(\d+)"
  $m2 = $rxAny.Match($cfg)
  if ($m2.Success) { return [int]$m2.Groups[1].Value }

  return $null
}

function Get-NssmValueSafe {
  param(
    [string]$Nssm,
    [string]$Service,
    [string]$Key
  )

  try {
    $raw = & $Nssm get $Service $Key 2>&1
    if ($LASTEXITCODE -ne 0) { return "" }
    $txt = ($raw | Out-String).Trim()
    if ($txt -match "^Can't open service") { return "" }
    return $txt
  } catch {
    return ""
  }
}

function Ensure-TunnelService {
  param(
    [string]$Nssm,
    [string]$Service,
    [string]$ConfigPath,
    [string]$AppDir
  )

  $args = "--config $ConfigPath tunnel run mmk1000"
  $existing = Get-Service -Name $Service -ErrorAction SilentlyContinue
  if (-not $existing) {
    & $Nssm install $Service cloudflared $args | Out-Null
  }

  & $Nssm set $Service Application cloudflared | Out-Null
  & $Nssm set $Service AppDirectory $AppDir | Out-Null
  & $Nssm set $Service AppParameters $args | Out-Null
  & $Nssm restart $Service | Out-Null
}

$nssm = Get-NssmPath
Write-StepResult -Step "0.nssm" -Pass ([bool]$nssm) -Detail ("nssm={0}" -f $nssm) -Fix "Install nssm and add nssm.exe to PATH"
if (-not $nssm) { exit 1 }

$port = Get-ConfiguredPortFromCloudflared -ConfigPath $CloudflaredConfigPath
if (-not $port) {
  if (Test-Health -Url "http://127.0.0.1:4101/api/health") {
    $port = 4101
  } elseif (Test-Health -Url "http://127.0.0.1:4100/api/health") {
    $port = 4100
  } else {
    $port = 4101
  }
}
Write-StepResult -Step "1.detect-port" -Pass $true -Detail ("PORT={0}" -f $port) -Fix "Set ingress service in $CloudflaredConfigPath"

$localUrl = "http://127.0.0.1:{0}/api/health" -f $port
$okBefore = Test-Health -Url $localUrl
Write-StepResult -Step "2.local-health-before" -Pass $okBefore -Detail $localUrl -Fix "nssm start $WebServiceName"

$currentEnv = Get-NssmValueSafe -Nssm $nssm -Service $WebServiceName -Key "AppEnvironmentExtra"
$targetEnv = Merge-EnvExtra -Current $currentEnv -Override @{
  PORT = "$port"
  DOTENV_CONFIG_PATH = "$RepoDir\.env"
  DOTENV_CONFIG_OVERRIDE = "true"
  DOTENV_CONFIG_QUIET = "true"
}

try {
  & $nssm set $WebServiceName AppEnvironmentExtra $targetEnv | Out-Null
  Write-StepResult -Step "3.merge-web-env" -Pass $true -Detail "Merged AppEnvironmentExtra (preserved existing keys)" -Fix "nssm get $WebServiceName AppEnvironmentExtra"
} catch {
  Write-StepResult -Step "3.merge-web-env" -Pass $false -Detail $_.Exception.Message -Fix "Run PowerShell as Administrator then: nssm set $WebServiceName AppEnvironmentExtra \"$targetEnv\""
}

try {
  & $nssm restart $WebServiceName | Out-Null
  Start-Sleep -Seconds 2
  Write-StepResult -Step "4.restart-web" -Pass $true -Detail "restarted $WebServiceName" -Fix "nssm restart $WebServiceName"
} catch {
  Write-StepResult -Step "4.restart-web" -Pass $false -Detail $_.Exception.Message -Fix "Check service: nssm edit $WebServiceName"
}

$okAfter = Test-Health -Url $localUrl
Write-StepResult -Step "5.local-health-after" -Pass $okAfter -Detail $localUrl -Fix "Check logs in $RepoDir\logs"

if (Test-Path -LiteralPath $CloudflaredConfigPath -PathType Leaf) {
  $cfg = Get-Content -LiteralPath $CloudflaredConfigPath -Raw
  $expected = "hostname:\s*mmk1000\.bn9\.app[\s\S]*?service:\s*http://127\.0\.0\.1:{0}" -f $port
  $ingressOk = [regex]::IsMatch($cfg, $expected)
  Write-StepResult -Step "6.cloudflared-ingress" -Pass $ingressOk -Detail ("hostname mmk1000.bn9.app -> 127.0.0.1:{0}" -f $port) -Fix "Edit $CloudflaredConfigPath and set service: http://127.0.0.1:$port"
} else {
  Write-StepResult -Step "6.cloudflared-ingress" -Pass $false -Detail ("missing {0}" -f $CloudflaredConfigPath) -Fix "Create config file and define ingress for mmk1000.bn9.app"
}

try {
  Ensure-TunnelService -Nssm $nssm -Service $TunnelServiceName -ConfigPath $CloudflaredConfigPath -AppDir $RepoDir
  Write-StepResult -Step "7.tunnel-service" -Pass $true -Detail "configured $TunnelServiceName" -Fix "nssm set $TunnelServiceName AppParameters \"--config $CloudflaredConfigPath tunnel run mmk1000\""
} catch {
  Write-StepResult -Step "7.tunnel-service" -Pass $false -Detail $_.Exception.Message -Fix "Install cloudflared and run script as Administrator"
}

$publicOk = Test-Health -Url $PublicHealthUrl
Write-StepResult -Step "8.public-health" -Pass $publicOk -Detail $PublicHealthUrl -Fix "cloudflared tunnel info mmk1000"

if ($script:HasFail) {
  Write-Host "Go-Live MMK1000: FAIL" -ForegroundColor Red
  exit 1
}

Write-Host "Go-Live MMK1000: PASS" -ForegroundColor Green
