[CmdletBinding()]
param(
  [ValidateSet('status','restart','start','stop','logs')]
  [string]$Action = 'status',
  [string]$CloudflaredService = 'Cloudflared',
  [string]$WebService = 'mmk1000-web',
  [string]$NssmPath = 'nssm',
  [int]$Tail = 150
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-NssmStatus([string]$name) {
  try {
    & $NssmPath status $name 2>$null
  } catch {
    'NSSM_UNAVAILABLE'
  }
}

function Get-RecentErrorLogs {
  Write-Host '--- System Events (Service Control Manager / nssm/cloudflared) ---'
  Get-WinEvent -FilterHashtable @{LogName='System'; StartTime=(Get-Date).AddHours(-6)} -MaxEvents 200 |
    Where-Object { $_.ProviderName -in @('Service Control Manager','nssm') -or $_.Message -match 'Cloudflared|mmk1000|502|bad gateway' } |
    Select-Object -First 30 TimeCreated, Id, ProviderName, LevelDisplayName, Message |
    Format-Table -Wrap

  Write-Host '--- Application Errors (last 6h) ---'
  Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=(Get-Date).AddHours(-6)} -MaxEvents 200 |
    Where-Object { $_.Message -match 'cloudflared|mmk1000|node|502|bad gateway' } |
    Select-Object -First 30 TimeCreated, Id, ProviderName, Message |
    Format-Table -Wrap
}

$services = @($CloudflaredService, $WebService)

switch ($Action) {
  'status' {
    foreach ($svcName in $services) {
      $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
      if ($svc) {
        Write-Host "$svcName service_status=$($svc.Status)"
        Write-Host "$svcName nssm_status=$(Invoke-NssmStatus $svcName)"
      } else {
        Write-Host "$svcName service_missing=true"
      }
    }
  }
  'restart' {
    foreach ($svcName in $services) {
      if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
        Restart-Service -Name $svcName -Force
        Write-Host "$svcName restarted"
      }
    }
  }
  'start' {
    foreach ($svcName in $services) {
      if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
        Start-Service -Name $svcName
        Write-Host "$svcName started"
      }
    }
  }
  'stop' {
    foreach ($svcName in $services) {
      if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
        Stop-Service -Name $svcName -Force
        Write-Host "$svcName stopped"
      }
    }
  }
  'logs' {
    Get-RecentErrorLogs
  }
}
