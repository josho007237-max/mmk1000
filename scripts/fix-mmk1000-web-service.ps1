param(
  [string]$ServiceName = "mmk1000-web"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$ExpectedApplication = "C:\Program Files\nodejs\node.exe"
$ExpectedAppDirectory = "C:\Users\ADMIN\MMK1000"
$ExpectedAppParameters = "src\server.mjs"
$ExpectedStdout = "C:\Users\ADMIN\MMK1000\logs\web.out.log"
$ExpectedStderr = "C:\Users\ADMIN\MMK1000\logs\web.err.log"
$ExpectedAppRotation = "1"
$Port = 4100
$StartTimeoutSec = 30
$StopTimeoutSec = 30
$PollIntervalMs = 500

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host ("=== {0} ===" -f $Title)
}

function Get-Text {
  param([object]$InputObject)
  return ($InputObject | Out-String).TrimEnd()
}

function Test-IsAdmin {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-NoAccessDenied {
  param(
    [string]$Step,
    [string]$Text
  )

  if ($Text -match "(?i)access is denied") {
    throw ("{0} failed: Access is denied. Re-run this script in PowerShell (Run as Administrator)." -f $Step)
  }
}

function Wait-ForServiceState {
  param(
    [string]$Name,
    [string]$DesiredState,
    [int]$TimeoutSec,
    [int]$PollMs
  )

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    $raw = sc.exe query $Name 2>&1
    $text = Get-Text -InputObject $raw
    if ($text -match "STATE\s*:\s*\d+\s+([A-Z_]+)") {
      if ($Matches[1] -eq $DesiredState) {
        return $true
      }
    }
    Start-Sleep -Milliseconds $PollMs
  }
  return $false
}

function Get-ServiceImagePathFromRegistry {
  param([string]$Name)
  $raw = reg query "HKLM\SYSTEM\CurrentControlSet\Services\$Name" /v ImagePath 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ("reg query ImagePath failed for service '{0}': {1}" -f $Name, (Get-Text $raw))
  }
  $line = $raw | Select-String -Pattern "ImagePath" | Select-Object -First 1
  if (-not $line) {
    throw ("ImagePath not found in registry for service '{0}'" -f $Name)
  }
  $text = $line.ToString()
  return ($text -replace "^\s*ImagePath\s+REG_\w+\s+", "").Trim()
}

function Get-NssmExeFromImagePath {
  param([string]$ImagePath)
  if ($ImagePath -match '(?i)"([^"]*nssm\.exe)"') {
    return $Matches[1]
  }
  if ($ImagePath -match '(?i)([A-Z]:\\[^"]*?nssm\.exe)') {
    return $Matches[1]
  }
  throw ("Service ImagePath does not point to nssm.exe: {0}" -f $ImagePath)
}

function Get-NssmValue {
  param(
    [string]$NssmPath,
    [string]$Name,
    [string]$Key
  )
  $raw = & $NssmPath get $Name $Key 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ("nssm get failed: {0} get {1} {2}`n{3}" -f $NssmPath, $Name, $Key, (Get-Text $raw))
  }
  return (Get-Text $raw).Trim()
}

function Set-NssmValueIfNeeded {
  param(
    [string]$NssmPath,
    [string]$Name,
    [string]$Key,
    [string]$ExpectedValue
  )
  $current = Get-NssmValue -NssmPath $NssmPath -Name $Name -Key $Key
  if ($current -eq $ExpectedValue) {
    Write-Host ("nssm get {0} -> OK: {1}" -f $Key, $current)
    return
  }

  Write-Warning ("nssm get {0} mismatch:`n  current : {1}`n  expected: {2}" -f $Key, $current, $ExpectedValue)
  if (-not $script:IsElevated) {
    throw ("Need elevated PowerShell to run nssm set for key '{0}'. Re-run as Administrator." -f $Key)
  }
  $raw = & $NssmPath set $Name $Key $ExpectedValue 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ("nssm set failed: {0} set {1} {2} {3}`n{4}" -f $NssmPath, $Name, $Key, $ExpectedValue, (Get-Text $raw))
  }
  Write-Host ("nssm set {0} -> {1}" -f $Key, $ExpectedValue)
}

Write-Section "0) Validate service exists"
$serviceRaw = sc.exe queryex $ServiceName 2>&1
$serviceText = Get-Text -InputObject $serviceRaw
if ($LASTEXITCODE -ne 0) {
  throw ("Service not found or query failed: {0}`n{1}" -f $ServiceName, $serviceText)
}
Write-Host $serviceText

Write-Section "1) Check shell elevation (net session + whoami /groups)"
$netSessionRaw = cmd /c "net session 2>&1"
$netSessionText = Get-Text -InputObject $netSessionRaw
$netSessionOk = ($LASTEXITCODE -eq 0)
Write-Host "--- net session ---"
Write-Host $netSessionText

$whoamiRaw = whoami /groups 2>&1
$whoamiText = Get-Text -InputObject $whoamiRaw
Write-Host "--- whoami /groups ---"
Write-Host $whoamiText

$adminLine = ($whoamiText -split "`r?`n" | Where-Object { $_ -match "S-1-5-32-544" } | Select-Object -First 1)
$adminEnabled = ($adminLine -match "(?i)Enabled group")
$script:IsElevated = Test-IsAdmin
Write-Host ("Admin SID row: {0}" -f ($(if ($adminLine) { $adminLine.Trim() } else { "<not found>" })))
Write-Host ("net session elevated: {0}" -f $netSessionOk)
Write-Host ("whoami admin enabled: {0}" -f $adminEnabled)
Write-Host ("PowerShell IsInRole(Admin): {0}" -f $script:IsElevated)
if (-not $script:IsElevated) {
  Write-Warning "PowerShell is not elevated. Read-only checks will run; write actions will be blocked."
}

Write-Section "2) Check nssm resolution and enforce one nssm from ImagePath"
Write-Host "--- where nssm ---"
$whereRaw = where.exe nssm 2>&1
Write-Host (Get-Text -InputObject $whereRaw)

Write-Host "--- Get-Command nssm.exe -All ---"
Get-Command nssm.exe -All -ErrorAction SilentlyContinue |
  Select-Object Source, CommandType, Version |
  Format-Table -AutoSize | Out-Host

Write-Host ("--- reg query HKLM\\SYSTEM\\CurrentControlSet\\Services\\{0} /v ImagePath ---" -f $ServiceName)
$imageQueryRaw = reg query "HKLM\SYSTEM\CurrentControlSet\Services\$ServiceName" /v ImagePath 2>&1
$imageQueryText = Get-Text -InputObject $imageQueryRaw
Write-Host $imageQueryText
if ($LASTEXITCODE -ne 0) {
  throw ("reg query ImagePath failed for service '{0}'" -f $ServiceName)
}
$imagePath = Get-ServiceImagePathFromRegistry -Name $ServiceName
Write-Host ("Parsed ImagePath: {0}" -f $imagePath)

$nssm = Get-NssmExeFromImagePath -ImagePath $imagePath
if (-not (Test-Path -LiteralPath $nssm -PathType Leaf)) {
  throw ("nssm.exe from ImagePath not found: {0}" -f $nssm)
}
Write-Host ("Using NSSM from service ImagePath only: {0}" -f $nssm)

Write-Section "3) Read current config with nssm get"
$keys = @("Application", "AppDirectory", "AppParameters", "AppStdout", "AppStderr", "AppRotation")
foreach ($key in $keys) {
  $value = Get-NssmValue -NssmPath $nssm -Name $ServiceName -Key $key
  Write-Host ("nssm get {0} {1} => {2}" -f $ServiceName, $key, $value)
}

Write-Section "4) Normalize config with nssm set (full path)"
if (-not (Test-Path -LiteralPath $ExpectedApplication -PathType Leaf)) {
  throw ("node.exe not found: {0}" -f $ExpectedApplication)
}
if (-not (Test-Path -LiteralPath $ExpectedAppDirectory -PathType Container)) {
  throw ("App directory not found: {0}" -f $ExpectedAppDirectory)
}
$expectedEntry = Join-Path $ExpectedAppDirectory $ExpectedAppParameters
if (-not (Test-Path -LiteralPath $expectedEntry -PathType Leaf)) {
  throw ("Entry not found: {0}" -f $expectedEntry)
}
$logsDir = Split-Path -Parent $ExpectedStdout
if (-not (Test-Path -LiteralPath $logsDir -PathType Container)) {
  New-Item -Path $logsDir -ItemType Directory -Force | Out-Null
}

Set-NssmValueIfNeeded -NssmPath $nssm -Name $ServiceName -Key "Application" -ExpectedValue $ExpectedApplication
Set-NssmValueIfNeeded -NssmPath $nssm -Name $ServiceName -Key "AppDirectory" -ExpectedValue $ExpectedAppDirectory
Set-NssmValueIfNeeded -NssmPath $nssm -Name $ServiceName -Key "AppParameters" -ExpectedValue $ExpectedAppParameters
Set-NssmValueIfNeeded -NssmPath $nssm -Name $ServiceName -Key "AppStdout" -ExpectedValue $ExpectedStdout
Set-NssmValueIfNeeded -NssmPath $nssm -Name $ServiceName -Key "AppStderr" -ExpectedValue $ExpectedStderr
Set-NssmValueIfNeeded -NssmPath $nssm -Name $ServiceName -Key "AppRotation" -ExpectedValue $ExpectedAppRotation

Write-Host "--- re-check via nssm get ---"
foreach ($key in $keys) {
  $value = Get-NssmValue -NssmPath $nssm -Name $ServiceName -Key $key
  Write-Host ("nssm get {0} {1} => {2}" -f $ServiceName, $key, $value)
}

Write-Section "5) Verify stop/start + PID chain (nssm -> node on :4100)"
if (-not $script:IsElevated) {
  throw "Read-only checks completed. Re-run in PowerShell (Run as Administrator) for sc stop/start and PID-chain verification."
}
$stopRaw = sc.exe stop $ServiceName 2>&1
$stopText = Get-Text -InputObject $stopRaw
Write-Host "--- sc stop ---"
Write-Host $stopText
Assert-NoAccessDenied -Step "sc stop" -Text $stopText
[void](Wait-ForServiceState -Name $ServiceName -DesiredState "STOPPED" -TimeoutSec $StopTimeoutSec -PollMs $PollIntervalMs)

$startRaw = sc.exe start $ServiceName 2>&1
$startText = Get-Text -InputObject $startRaw
Write-Host "--- sc start ---"
Write-Host $startText
Assert-NoAccessDenied -Step "sc start" -Text $startText
$running = Wait-ForServiceState -Name $ServiceName -DesiredState "RUNNING" -TimeoutSec $StartTimeoutSec -PollMs $PollIntervalMs
if (-not $running) {
  throw ("Service did not reach RUNNING within {0}s" -f $StartTimeoutSec)
}

$queryExRaw = sc.exe queryex $ServiceName 2>&1
$queryExText = Get-Text -InputObject $queryExRaw
Write-Host "--- sc queryex ---"
Write-Host $queryExText
if ($queryExText -notmatch "PID\s*:\s*(\d+)") {
  throw "Cannot parse service PID from sc queryex output"
}
$servicePid = [int]$Matches[1]
if ($servicePid -le 0) {
  throw ("Service PID invalid: {0}" -f $servicePid)
}

$svcProc = Get-CimInstance Win32_Process -Filter "ProcessId=$servicePid" -ErrorAction Stop
Write-Host "--- service PID process ---"
Write-Host ("PID={0} PPID={1} Name={2}" -f $svcProc.ProcessId, $svcProc.ParentProcessId, $svcProc.Name)
Write-Host ("CMD={0}" -f $svcProc.CommandLine)
if ($svcProc.Name -notmatch "(?i)^nssm\.exe$") {
  throw ("Service PID is not nssm.exe. Actual: {0}" -f $svcProc.Name)
}

$listenLines = netstat -ano | Select-String ":$Port" | Select-String "LISTENING"
if (-not $listenLines) {
  throw ("Port {0} is not LISTENING" -f $Port)
}
$listenLine = $listenLines | Select-Object -First 1
Write-Host "--- netstat :$Port ---"
Write-Host $listenLine

$nodePid = [int](($listenLine.ToString().Trim() -split "\s+")[-1])
$nodeProc = Get-CimInstance Win32_Process -Filter "ProcessId=$nodePid" -ErrorAction Stop
Write-Host "--- port holder process ---"
Write-Host ("PID={0} PPID={1} Name={2}" -f $nodeProc.ProcessId, $nodeProc.ParentProcessId, $nodeProc.Name)
Write-Host ("CMD={0}" -f $nodeProc.CommandLine)
if ($nodeProc.Name -notmatch "(?i)^node(\.exe)?$") {
  throw ("Port {0} is not held by node. Actual process: {1}" -f $Port, $nodeProc.Name)
}
if ([int]$nodeProc.ParentProcessId -ne $servicePid) {
  throw ("node PID {0} is not child of nssm PID {1} (actual parent {2})" -f $nodeProc.ProcessId, $servicePid, $nodeProc.ParentProcessId)
}

if (-not (Test-Path -LiteralPath $ExpectedStdout -PathType Leaf)) {
  New-Item -Path $ExpectedStdout -ItemType File -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $ExpectedStderr -PathType Leaf)) {
  New-Item -Path $ExpectedStderr -ItemType File -Force | Out-Null
}
Write-Host ("Log files ready: {0} | {1}" -f $ExpectedStdout, $ExpectedStderr)

Write-Host ("SUCCESS: '{0}' is manageable, uses single NSSM '{1}', and :{2} is owned by node child of nssm." -f $ServiceName, $nssm, $Port)
