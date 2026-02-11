Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cmdPath = Join-Path $repoRoot "tools\run-tunnel.cmd"
$taskName = "MMK1000-Cloudflared"

$action = New-ScheduledTaskAction -Execute $cmdPath
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

Write-Host "Installed task: $taskName"
Write-Host "Run now (optional): Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Check log: Get-Content .\\logs\\cloudflared.log -Tail 50"
