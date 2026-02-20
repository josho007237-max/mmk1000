# scripts/go_live.ps1
param(
    [int]$Port,
    [string]$DotenvPath,
    [string]$AdminKey,
    [string]$Hostname = "mmk1000.bn9.app",
    [string]$PublicHealthUrl = "https://mmk1000.bn9.app/api/health",
    [string]$TunnelName = "mmk1000",
    [string]$WebService = "mmk1000-web",
    [string]$TunnelService = "mmk1000-tunnel"
)

$ErrorActionPreference = "Stop"

function Is-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Step($name, $ok, $msg, $fix) {
    if ($ok) {
        Write-Host ("[PASS] {0} - {1}" -f $name, $msg) -ForegroundColor Green
        return $true
    }
    else {
        Write-Host ("[FAIL] {0} - {1}" -f $name, $msg) -ForegroundColor Red
        if ($fix) {
            Write-Host ("  FIX: {0}" -f $fix) -ForegroundColor Yellow
        }
        return $false
    }
}

function Try-GetLocalHealth($url) {
    try {
        $r = Invoke-RestMethod -Method Get -Uri $url -TimeoutSec 5
        return @{ ok = $true; data = $r }
    }
    catch {
        return @{ ok = $false; err = $_ }
    }
}

function Get-NssmEnv($svc) {
    $raw = ""
    try { $raw = (& nssm get $svc AppEnvironmentExtra) 2>$null } catch { $raw = "" }
    $map = @{}
    ($raw -split "(`r`n|`n|`r)") | Where-Object { $_ -match "=" } | ForEach-Object {
        $k, $v = $_.Split("=", 2)
        if ($k) { $map[$k.Trim()] = $v }
    }
    return $map
}

function Set-NssmEnvMerged($svc, $updates) {
    $map = Get-NssmEnv $svc
    foreach ($k in $updates.Keys) {
        $map[$k] = $updates[$k]
    }
    $text = ($map.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "`n"
    & nssm set $svc AppEnvironmentExtra $text | Out-Null
}

# repo root = parent of scripts/
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$allOk = $true

# 0) Admin
if (-not (Is-Admin)) {
    Step "Admin" $false "Not running as Administrator" "Right-click PowerShell -> Run as Administrator, then rerun: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\go_live.ps1" | Out-Null
    exit 1
}
Step "Admin" $true "Elevated OK" $null | Out-Null

# 1) tools
$hasNssm = [bool](Get-Command nssm -ErrorAction SilentlyContinue)
$hasCf = [bool](Get-Command cloudflared.exe -ErrorAction SilentlyContinue)
$allOk = (Step "Tool:nssm" $hasNssm "nssm found=$hasNssm" "Install NSSM and ensure it's in PATH") -and $allOk
$allOk = (Step "Tool:cloudflared" $hasCf "cloudflared found=$hasCf" "Install cloudflared and ensure it's in PATH") -and $allOk

# 2) detect port from config.yml if not provided
$cfg = "$env:USERPROFILE\.cloudflared\config.yml"
if (-not $PSBoundParameters.ContainsKey("Port")) {
    $det = $null
    if (Test-Path $cfg) {
        $txt = Get-Content $cfg -Raw
        $pat = "(?ms)-\s*hostname:\s*{0}\s*\r?\n\s*service:\s*http://127\.0\.0\.1:(\d+)" -f [regex]::Escape($Hostname)
        $m = [regex]::Match($txt, $pat)
        if ($m.Success) { $det = [int]$m.Groups[1].Value }
    }
    if (-not $det) {
        foreach ($p in 4101, 4100) {
            $u = "http://127.0.0.1:$p/api/health"
            if ((Try-GetLocalHealth $u).ok) { $det = $p; break }
        }
    }
    if (-not $det) { $det = 4101 }
    $Port = $det
}

$localUrl = "http://127.0.0.1:$Port/api/health"

# 3) local health (pre)
$pre = Try-GetLocalHealth $localUrl
$allOk = (Step "LocalHealth:pre" $pre.ok "GET $localUrl" "Start web service: nssm start $WebService  (or run: node .\src\server.mjs with PORT=$Port)") -and $allOk

# 4) set web service env + restart
if (-not $DotenvPath) {
    $candidate = Join-Path $repoRoot ".env.tmn.real"
    if (Test-Path $candidate) { $DotenvPath = $candidate }
}

$updates = @{
    "PORT"                   = "" + $Port
    "DOTENV_CONFIG_QUIET"    = "true"
    "DOTENV_CONFIG_OVERRIDE" = "true"
}
if ($DotenvPath) { $updates["DOTENV_CONFIG_PATH"] = $DotenvPath }
if ($AdminKey) { $updates["ADMIN_KEY"] = $AdminKey }

try {
    Set-NssmEnvMerged $WebService $updates
    & nssm set $WebService Start SERVICE_AUTO_START | Out-Null
    & nssm restart $WebService | Out-Null
    Start-Sleep -Milliseconds 600
    $post = Try-GetLocalHealth $localUrl
    $allOk = (Step "WebService" $post.ok "Restarted $WebService; health OK on :$Port" "Check logs: Get-Content .\logs\web.err.log -Tail 200") -and $allOk
}
catch {
    $allOk = (Step "WebService" $false "Failed to set/restart $WebService" "Run as Admin + verify service exists: nssm status $WebService") -and $allOk
}

# 5) validate cloudflared ingress
if (Test-Path $cfg) {
    $txt = Get-Content $cfg -Raw
    $pat2 = "(?ms)-\s*hostname:\s*{0}\s*\r?\n\s*service:\s*(?<svc>[^\r\n]+)" -f [regex]::Escape($Hostname)
    $m2 = [regex]::Match($txt, $pat2)
    $okIngress = $m2.Success -and ($m2.Groups["svc"].Value -match "http://127\.0\.0\.1:$Port\b")
    $fixIngress = "Edit $cfg and set for hostname $Hostname: service: http://127.0.0.1:$Port"
    $allOk = (Step "TunnelConfig" $okIngress "ingress points to 127.0.0.1:$Port" $fixIngress) -and $allOk
}
else {
    $allOk = (Step "TunnelConfig" $false "Missing $cfg" "Create config.yml under $env:USERPROFILE\.cloudflared\") -and $allOk
}

# 6) ensure tunnel service
try {
    $cf = (Get-Command cloudflared.exe).Source
    $svc = Get-Service -Name $TunnelService -ErrorAction SilentlyContinue
    if (-not $svc) {
        & nssm install $TunnelService $cf "--config `"$cfg`" tunnel run $TunnelName" | Out-Null
    }
    & nssm set $TunnelService AppDirectory $repoRoot | Out-Null
    & nssm set $TunnelService Start SERVICE_AUTO_START | Out-Null
    & nssm restart $TunnelService | Out-Null
    $allOk = (Step "TunnelService" $true "Service $TunnelService running" $null) -and $allOk
}
catch {
    $allOk = (Step "TunnelService" $false "Failed to install/start $TunnelService" "Try: nssm install $TunnelService `"<cloudflared.exe path>`" `"...`"") -and $allOk
}

# 7) public health
try {
    $out = & curl.exe --ssl-no-revoke -I $PublicHealthUrl 2>$null
    $okPub = ($out | Select-String -Pattern "HTTP/\d(\.\d)?\s+200").Count -gt 0
    $allOk = (Step "PublicHealth" $okPub "HEAD $PublicHealthUrl => 200" "Check tunnel logs: cloudflared tunnel run --loglevel debug $TunnelName") -and $allOk
}
catch {
    $allOk = (Step "PublicHealth" $false "curl failed" "Run: curl.exe --ssl-no-revoke -I $PublicHealthUrl") -and $allOk
}

if ($allOk) {
    Write-Host "`nALL PASS ✅" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "`nSOME FAIL ❌ (ดู FIX ต่อ step)" -ForegroundColor Red
    exit 1
}