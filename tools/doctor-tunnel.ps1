Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$configPath = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
$hostname = "mmk1000.bn9.app"
$tunnelName = "mmk1000"

function Print-Section($title) {
  Write-Host ""
  Write-Host "==== $title ===="
}

function Extract-TunnelId([string]$text) {
  $m = [regex]::Match($text, '(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b')
  if ($m.Success) { return $m.Value.ToLower() }
  return ""
}

if (-not (Test-Path $cloudflared)) {
  Write-Host "cloudflared not found at: $cloudflared"
  exit 1
}

Print-Section "cloudflared tunnel list"
$listOutput = (& $cloudflared tunnel list 2>&1 | Out-String)
Write-Host $listOutput

Print-Section "cloudflared tunnel info mmk1000"
$infoOutput = (& $cloudflared tunnel info $tunnelName 2>&1 | Out-String)
Write-Host $infoOutput

Print-Section "nslookup mmk1000.bn9.app"
$nsOutput = (nslookup $hostname 2>&1 | Out-String)
Write-Host $nsOutput

Print-Section "config.yml (tunnel / credentials-file)"
$configTunnel = ""
$configCred = ""
if (Test-Path $configPath) {
  $cfgLines = Get-Content -LiteralPath $configPath
  foreach ($line in $cfgLines) {
    if ($line -match '^\s*tunnel\s*:') {
      $configTunnel = ($line -replace '^\s*tunnel\s*:\s*', '').Trim()
      Write-Host $line
    }
    if ($line -match '^\s*credentials-file\s*:') {
      $configCred = ($line -replace '^\s*credentials-file\s*:\s*', '').Trim().Trim('"')
      Write-Host $line
    }
  }
} else {
  Write-Host "config missing: $configPath"
}

Print-Section "credentials-file exists"
$credExists = $false
if ($configCred) {
  $credExists = Test-Path -LiteralPath $configCred
}
Write-Host "credentials-file: $configCred"
Write-Host "exists: $credExists"

$listTunnelId = Extract-TunnelId $listOutput
if (-not $listTunnelId -and $configTunnel) { $listTunnelId = $configTunnel.ToLower() }

$dnsTunnelId = ""
$dnsMatch = [regex]::Match($nsOutput, '(?i)([0-9a-f-]{36})\.cfargotunnel\.com')
if ($dnsMatch.Success) { $dnsTunnelId = $dnsMatch.Groups[1].Value.ToLower() }

$tunnelStatus = "unknown"
if ($infoOutput -match '(?i)no active connections|offline|not connected') {
  $tunnelStatus = "offline"
} elseif ($infoOutput -match '(?i)healthy|online|connections?\s*:\s*[1-9]|\b[1-9]\d*\s+conn') {
  $tunnelStatus = "online"
}

Print-Section "Summary"
Write-Host "tunnel_status: $tunnelStatus"
Write-Host "hostname_tunnel_id: $dnsTunnelId"
Write-Host "expected_tunnel_id: $listTunnelId"
Write-Host "hostname_points_match: " ($dnsTunnelId -and $listTunnelId -and ($dnsTunnelId -eq $listTunnelId))
Write-Host "credentials_file: $configCred"
Write-Host "credentials_exists: $credExists"
