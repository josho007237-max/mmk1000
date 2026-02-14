param(
  [string]$ServiceName = "mmk1000-web"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName\Parameters"
$ExpectedApplication = "C:\Program Files\nodejs\node.exe"
$ExpectedAppDirectory = "C:\Users\ADMIN\MMK1000"
$ExpectedAppParameters = "src\server.mjs"
$LogsDir = "C:\Users\ADMIN\MMK1000\logs"
$ExpectedStdout = "C:\Users\ADMIN\MMK1000\logs\web.out.log"
$ExpectedStderr = "C:\Users\ADMIN\MMK1000\logs\web.err.log"
$ExpectedKillTree = 1
$ExpectedRestartDelay = 5000
$StartTimeoutSec = 30
$PollIntervalMs = 500
$StopTimeoutSec = 15
$TailLines = 80
$EventLimit = 20

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host ("=== {0} ===" -f $Title)
}

function Get-ServiceQuery {
  param([string]$Name)

  $raw = sc.exe query $Name 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($raw | Out-String).TrimEnd()

  $state = $null
  if ($text -match "STATE\s*:\s*\d+\s+([A-Z_]+)") {
    $state = $Matches[1]
  }

  [pscustomobject]@{
    Exists   = ($exitCode -eq 0)
    ExitCode = $exitCode
    State    = $state
    Raw      = $text
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
    $status = Get-ServiceQuery -Name $Name
    if (-not $status.Exists) {
      return $false
    }
    if ($status.State -eq $DesiredState) {
      return $true
    }
    Start-Sleep -Milliseconds $PollMs
  }
  return $false
}

function Set-RegistryValueIfNeeded {
  param(
    [string]$Path,
    [string]$Name,
    [object]$Expected,
    [ValidateSet("String", "DWord")]
    [string]$PropertyType
  )

  $currentValues = Get-ItemProperty -Path $Path -ErrorAction Stop
  $prop = $currentValues.PSObject.Properties[$Name]
  $current = if ($null -ne $prop) { $prop.Value } else { $null }

  $needsUpdate = $false
  if ($null -eq $current) {
    $needsUpdate = $true
  } elseif ($PropertyType -eq "DWord") {
    if ([int]$current -ne [int]$Expected) {
      $needsUpdate = $true
    }
  } elseif ([string]$current -ne [string]$Expected) {
    $needsUpdate = $true
  }

  if ($needsUpdate) {
    New-ItemProperty -Path $Path -Name $Name -Value $Expected -PropertyType $PropertyType -Force | Out-Null
    Write-Host ("Updated registry: {0} = {1}" -f $Name, $Expected)
  } else {
    Write-Host ("Registry OK: {0} = {1}" -f $Name, $current)
  }
}

function Get-RegistryPropertySafe {
  param(
    [object]$Item,
    [string]$Name
  )

  $prop = $Item.PSObject.Properties[$Name]
  if ($null -ne $prop) {
    return $prop.Value
  }
  return $null
}

function Show-FailureDiagnostics {
  param(
    [string]$Name,
    [string[]]$LogFiles
  )

  Write-Section "Diagnostic: sc query"
  sc.exe query $Name

  Write-Section ("Diagnostic: tail logs (last {0} lines)" -f $TailLines)
  foreach ($logFile in $LogFiles) {
    Write-Host ("-- {0}" -f $logFile)
    if (Test-Path -LiteralPath $logFile -PathType Leaf) {
      try {
        Get-Content -LiteralPath $logFile -Tail $TailLines
      } catch {
        Write-Host ("(failed to read log: {0})" -f $_.Exception.Message)
      }
    } else {
      Write-Host "(log file not found)"
    }
  }

  Write-Section ("Diagnostic: Service Control Manager events (last 24h, max {0})" -f $EventLimit)
  $startTime = (Get-Date).AddHours(-24)
  $events = Get-WinEvent -FilterHashtable @{
    LogName      = "System"
    ProviderName = "Service Control Manager"
    StartTime    = $startTime
  } -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -like "*$Name*" } |
    Select-Object -First $EventLimit TimeCreated, Id, LevelDisplayName, Message

  if ($events) {
    $events | Format-List
  } else {
    Write-Host "(no matching events)"
  }
}

try {
  Write-Section "Check service exists"
  $service = Get-ServiceQuery -Name $ServiceName
  if (-not $service.Exists) {
    throw ("Service not found: {0}`n{1}" -f $ServiceName, $service.Raw)
  }
  Write-Host ("Service found: {0} (state={1})" -f $ServiceName, $service.State)

  Write-Section "Read current registry parameters"
  if (-not (Test-Path -LiteralPath $RegPath)) {
    New-Item -Path $RegPath -Force | Out-Null
  }
  $current = Get-ItemProperty -Path $RegPath -ErrorAction Stop
  Write-Host ("Application        : {0}" -f (Get-RegistryPropertySafe -Item $current -Name "Application"))
  Write-Host ("AppDirectory       : {0}" -f (Get-RegistryPropertySafe -Item $current -Name "AppDirectory"))
  Write-Host ("AppParameters      : {0}" -f (Get-RegistryPropertySafe -Item $current -Name "AppParameters"))
  Write-Host ("AppStdout          : {0}" -f (Get-RegistryPropertySafe -Item $current -Name "AppStdout"))
  Write-Host ("AppStderr          : {0}" -f (Get-RegistryPropertySafe -Item $current -Name "AppStderr"))
  Write-Host ("AppKillProcessTree : {0}" -f (Get-RegistryPropertySafe -Item $current -Name "AppKillProcessTree"))
  Write-Host ("AppRestartDelay    : {0}" -f (Get-RegistryPropertySafe -Item $current -Name "AppRestartDelay"))

  Write-Section "Validate required paths"
  if (-not (Test-Path -LiteralPath $LogsDir -PathType Container)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    Write-Host ("Created logs directory: {0}" -f $LogsDir)
  } else {
    Write-Host ("Logs directory OK: {0}" -f $LogsDir)
  }

  $expectedServerScript = Join-Path $ExpectedAppDirectory $ExpectedAppParameters
  $missingPaths = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path -LiteralPath $ExpectedApplication -PathType Leaf)) {
    $missingPaths.Add($ExpectedApplication)
  }
  if (-not (Test-Path -LiteralPath $ExpectedAppDirectory -PathType Container)) {
    $missingPaths.Add($ExpectedAppDirectory)
  }
  if (-not (Test-Path -LiteralPath $expectedServerScript -PathType Leaf)) {
    $missingPaths.Add($expectedServerScript)
  }

  if ($missingPaths.Count -gt 0) {
    throw ("Required path(s) not found: {0}" -f ($missingPaths -join ", "))
  }

  Write-Host ("Node executable OK: {0}" -f $ExpectedApplication)
  Write-Host ("Project directory OK: {0}" -f $ExpectedAppDirectory)
  Write-Host ("Server script OK: {0}" -f $expectedServerScript)

  Write-Section "Normalize registry values"
  Set-RegistryValueIfNeeded -Path $RegPath -Name "Application" -Expected $ExpectedApplication -PropertyType String
  Set-RegistryValueIfNeeded -Path $RegPath -Name "AppDirectory" -Expected $ExpectedAppDirectory -PropertyType String
  Set-RegistryValueIfNeeded -Path $RegPath -Name "AppParameters" -Expected $ExpectedAppParameters -PropertyType String
  Set-RegistryValueIfNeeded -Path $RegPath -Name "AppStdout" -Expected $ExpectedStdout -PropertyType String
  Set-RegistryValueIfNeeded -Path $RegPath -Name "AppStderr" -Expected $ExpectedStderr -PropertyType String
  Set-RegistryValueIfNeeded -Path $RegPath -Name "AppKillProcessTree" -Expected $ExpectedKillTree -PropertyType DWord
  Set-RegistryValueIfNeeded -Path $RegPath -Name "AppRestartDelay" -Expected $ExpectedRestartDelay -PropertyType DWord

  Write-Section "Clear logs"
  foreach ($logFile in @($ExpectedStdout, $ExpectedStderr)) {
    if (Test-Path -LiteralPath $logFile -PathType Leaf) {
      Remove-Item -LiteralPath $logFile -Force
    }
    New-Item -ItemType File -Path $logFile -Force | Out-Null
    Write-Host ("Prepared log file: {0}" -f $logFile)
  }

  Write-Section "Stop service"
  $stopRaw = sc.exe stop $ServiceName 2>&1
  if ($stopRaw) {
    $stopRaw
  }
  $stopped = Wait-ForServiceState -Name $ServiceName -DesiredState "STOPPED" -TimeoutSec $StopTimeoutSec -PollMs $PollIntervalMs
  if ($stopped) {
    Write-Host ("Service reached STOPPED within {0}s" -f $StopTimeoutSec)
  } else {
    Write-Warning ("Service did not reach STOPPED within {0}s; continuing to start attempt" -f $StopTimeoutSec)
  }

  Write-Section "Start service"
  $startRaw = sc.exe start $ServiceName 2>&1
  if ($startRaw) {
    $startRaw
  }

  $running = Wait-ForServiceState -Name $ServiceName -DesiredState "RUNNING" -TimeoutSec $StartTimeoutSec -PollMs $PollIntervalMs
  if ($running) {
    Write-Host ("Service is RUNNING: {0}" -f $ServiceName)
    exit 0
  }

  Write-Warning ("Service did not reach RUNNING within {0}s" -f $StartTimeoutSec)
  Show-FailureDiagnostics -Name $ServiceName -LogFiles @($ExpectedStdout, $ExpectedStderr)
  exit 1
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
