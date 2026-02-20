$ErrorActionPreference = "Continue"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$logsDir = Join-Path $repo "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$out = Join-Path $logsDir ("audit_{0}.txt" -f $stamp)
if ([string]::IsNullOrWhiteSpace([string]$out)) {
  $out = Join-Path $repo ("logs\audit_{0}.txt" -f $stamp)
}
$outDir = Split-Path -Parent $out
if ($outDir) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
Set-Content -Path $out -Value @("MMK1000 audit bootstrap", ("generatedAt={0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))) -Encoding UTF8
$health = New-Object System.Collections.Generic.List[string]
$health.Add("== health output ==")
foreach ($url in @("http://127.0.0.1:4100/api/health", "http://127.0.0.1:4100/health")) {
  try {
    $resp = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 10 -ErrorAction Stop
    $health.Add(("GET {0} => {1}" -f $url, [int]$resp.StatusCode))
  } catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status) {
      $health.Add(("GET {0} => {1}" -f $url, $status))
    } else {
      $health.Add(("GET {0} => ERROR: {1}" -f $url, $_.Exception.Message))
    }
  }
}
Add-Content -Path $out -Value $health -Encoding UTF8

$report = New-Object System.Collections.Generic.List[string]

function Add-Section([string]$title) {
  $report.Add("")
  $report.Add(("== {0} ==" -f $title))
}

function Add-Lines([object]$lines) {
  if ($null -eq $lines) { return }
  foreach ($line in @($lines)) { $report.Add([string]$line) }
}

function Run-Cmd([string]$label, [scriptblock]$block) {
  Add-Section $label
  try {
    $result = & $block
    Add-Lines $result
  } catch {
    Add-Lines ("ERROR: {0}" -f $_.Exception.Message)
  }
}

$report.Add("MMK1000 audit")
$report.Add(("generatedAt={0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")))
$report.Add(("repo={0}" -f $repo))

Run-Cmd "snapshot files" {
  Get-ChildItem -Name
}

Run-Cmd "snapshot src/public/tools (top)" {
  Add-Lines ("src_count={0}" -f ((Get-ChildItem .\src -File -ErrorAction SilentlyContinue | Measure-Object).Count))
  Add-Lines ("public_count={0}" -f ((Get-ChildItem .\public -File -ErrorAction SilentlyContinue | Measure-Object).Count))
  Add-Lines ("tools_count={0}" -f ((Get-ChildItem .\tools -File -ErrorAction SilentlyContinue | Measure-Object).Count))
  Get-ChildItem .\src -File -ErrorAction SilentlyContinue | Select-Object -First 30 -ExpandProperty Name
}

Run-Cmd "node/npm" {
  @(
    ("node={0}" -f (node -v 2>$null)),
    ("npm={0}" -f (npm -v 2>$null))
  )
}

Run-Cmd "env (selected)" {
  $keys = @(
    "NODE_ENV","PORT","TMN_MODE","TMNONE_KEYID","TMN_LOGIN_TOKEN","TMN_TMN_ID","TMN_DEVICE_ID"
  )
  foreach ($k in $keys) {
    $v = [string][Environment]::GetEnvironmentVariable($k)
    if ([string]::IsNullOrWhiteSpace($v)) {
      "env.{0}=<empty>" -f $k
    } else {
      "env.{0}=<set,len={1}>" -f $k, $v.Length
    }
  }
}

Run-Cmd "env dump (.env top non-comment)" {
  $envFile = Join-Path $repo ".env"
  if (Test-Path $envFile) {
    Get-Content $envFile |
      Where-Object { $_ -and $_.Trim() -notmatch '^\s*#' } |
      ForEach-Object {
        if ($_ -match '^\s*([^=]+)=') {
          "{0}=<set>" -f $matches[1].Trim()
        } else {
          $_
        }
      } |
      Select-Object -First 40
  } else {
    ".env not found"
  }
}

Run-Cmd "node --check (src/*.mjs + public/app.js + TMNOne.js)" {
  $targets = New-Object System.Collections.Generic.List[string]
  Get-ChildItem .\src -File -Filter *.mjs -ErrorAction SilentlyContinue | ForEach-Object {
    $targets.Add($_.FullName)
  }
  foreach ($p in @(".\public\app.js",".\TMNOne.js")) {
    if (Test-Path $p) { $targets.Add((Resolve-Path $p).Path) }
  }
  if ($targets.Count -eq 0) {
    "no target files"
  } else {
    foreach ($f in $targets) {
      try {
        node --check $f *> $null
        "OK  $f"
      } catch {
        "FAIL $f :: $($_.Exception.Message)"
      }
    }
  }
}

Run-Cmd "routes dump (source grep)" {
  if (Get-Command rg -ErrorAction SilentlyContinue) {
    rg -n "/api/|app\.(get|post|put|delete)|adminApi\.(get|post|put|delete)" .\src\server.mjs
  } else {
    Select-String -Path .\src\server.mjs -Pattern "/api/","app.get","app.post","adminApi.get","adminApi.post" |
      ForEach-Object { "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }
  }
}

Run-Cmd "routes dump (GET /api/routes)" {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:4100/api/routes" -Method Get -TimeoutSec 10 -ErrorAction Stop
    "GET /api/routes => {0}" -f [int]$r.StatusCode
    $r.Content
  } catch {
    "GET /api/routes => ERROR: {0}" -f $_.Exception.Message
  }
}

Run-Cmd "queue summary+sample (data/withdraw-queue.json)" {
  $qPath = Join-Path $repo "data\withdraw-queue.json"
  if (!(Test-Path $qPath)) {
    "withdraw-queue.json not found"
  } else {
    $raw = Get-Content $qPath -Raw
    $json = $raw | ConvertFrom-Json
    $items = @()
    if ($json -is [System.Collections.IEnumerable] -and -not ($json -is [string])) { $items = @($json) }
    elseif ($json.items) { $items = @($json.items) }
    "items_total={0}" -f $items.Count
    $groups = $items | Group-Object -Property status | Sort-Object Name
    foreach ($g in $groups) {
      "status.{0}={1}" -f ([string]$g.Name), $g.Count
    }
    if ($items.Count -gt 0) {
      $latest = $items | Sort-Object {
        $ts = 0
        if ($_.updatedAt -ne $null) { $ts = [long]$_.updatedAt }
        elseif ($_.updated_at -ne $null) { $ts = [long]$_.updated_at }
        elseif ($_.createdAt -ne $null) { $ts = [long]$_.createdAt }
        elseif ($_.created_at -ne $null) { $ts = [long]$_.created_at }
        $ts
      } -Descending | Select-Object -First 3
      foreach ($it in $latest) {
        "latest id={0} status={1} amount={2}" -f $it.id, $it.status, $it.amount
      }
      "sample_json:"
      $sample = $items | Select-Object -First 2
      ($sample | ConvertTo-Json -Depth 8 -Compress)
    }
  }
}

Run-Cmd "log grep (web.err.log + web.out.log)" {
  $pattern = "Invalid encrypted|shield|siglen|sent|failed|tmn_unavailable|listen_error"
  foreach ($name in @("web.err.log", "web.out.log")) {
    $logPath = Join-Path $repo ("logs\{0}" -f $name)
    if (!(Test-Path $logPath)) {
      "{0} not found" -f $name
      continue
    }
    "file={0}" -f $name
    Select-String -Path $logPath -Pattern $pattern -CaseSensitive:$false |
      Select-Object -Last 200 |
      ForEach-Object { "{0}:{1}: {2}" -f $_.Filename, $_.LineNumber, $_.Line.Trim() }
  }
}

$report | Add-Content -Encoding UTF8 $out
Write-Host ("OK => {0}" -f $out)
