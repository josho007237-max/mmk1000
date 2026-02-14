param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelUuid
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$taskName = "mmk1000-tunnel"
$configPath = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
$command = "cloudflared tunnel --config `"$configPath`" run $TunnelUuid"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command $command"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

Write-Host "Scheduled Task created: $taskName"
Write-Host "Command:"
Write-Host "  $command"
Write-Host ""
Write-Host "Test:"
Write-Host "  curl --ssl-no-revoke https://mmk1000.bn9.app/api/health"
