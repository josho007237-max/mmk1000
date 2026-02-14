Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsProjectRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Dir
  )

  $pkg = Join-Path $Dir "package.json"
  $server = Join-Path $Dir "src\server.mjs"
  $index = Join-Path $Dir "public\index.html"

  if (-not (Test-Path -LiteralPath $pkg -PathType Leaf)) { return $false }
  return (Test-Path -LiteralPath $server -PathType Leaf) -or (Test-Path -LiteralPath $index -PathType Leaf)
}

function Find-RootByAncestor {
  param(
    [Parameter(Mandatory = $true)][string]$StartDir
  )

  $current = Get-Item -LiteralPath $StartDir -ErrorAction SilentlyContinue
  while ($null -ne $current) {
    if (Test-IsProjectRoot -Dir $current.FullName) {
      return $current.FullName
    }
    $current = $current.Parent
  }
  return $null
}

$StartDir = (Get-Location).ProviderPath

Write-Host "== Root Resolution ==" -ForegroundColor Cyan
Write-Host ("[INFO] StartDir: {0}" -f $StartDir)

$selectedRoot = Find-RootByAncestor -StartDir $StartDir
if (-not $selectedRoot) {
  Write-Host "[WARN] No valid root found via ancestor walk. Searching recursively..." -ForegroundColor Yellow

  $candidates = @(
    Get-ChildItem -LiteralPath $StartDir -Filter package.json -File -Recurse -ErrorAction SilentlyContinue |
      ForEach-Object { Split-Path -Parent $_.FullName } |
      Where-Object { Test-IsProjectRoot -Dir $_ } |
      Sort-Object -Unique
  )

  if ($candidates.Count -eq 0) {
    Write-Host "[FAIL] Cannot find project root. Expected package.json and one of src/server.mjs or public/index.html." -ForegroundColor Red
    exit 1
  }

  Write-Host "[INFO] Candidate roots found:"
  foreach ($path in $candidates) {
    Write-Host (" - {0}" -f $path)
  }

  $selectedRoot = ($candidates | Sort-Object)[0]
  Write-Host ("[INFO] Picked deterministic candidate: {0}" -f $selectedRoot)
}

Write-Host ("Selected root: {0}" -f $selectedRoot)

$srcDir = Join-Path $selectedRoot "src"
$publicDir = Join-Path $selectedRoot "public"
$serverFile = Join-Path $selectedRoot "src\server.mjs"
$indexFile = Join-Path $selectedRoot "public\index.html"
$swFile = Join-Path $selectedRoot "public\sw.js"

Write-Host "`n== Path Checks ==" -ForegroundColor Cyan
Write-Host (".\src : {0}" -f (Test-Path -LiteralPath $srcDir))
Write-Host (".\public : {0}" -f (Test-Path -LiteralPath $publicDir))
Write-Host (".\src\server.mjs : {0}" -f (Test-Path -LiteralPath $serverFile -PathType Leaf))
Write-Host (".\public\index.html : {0}" -f (Test-Path -LiteralPath $indexFile -PathType Leaf))

Write-Host "`n== server.mjs import/require ==" -ForegroundColor Cyan
if (Test-Path -LiteralPath $serverFile -PathType Leaf) {
  $hits = @(Select-String -Path $serverFile -Pattern "import|require\s*\(")
  if ($hits.Count -eq 0) {
    Write-Host "(no match)"
  } else {
    foreach ($hit in $hits) {
      Write-Host ("{0}:{1}" -f $hit.LineNumber, $hit.Line.Trim())
    }
  }
} else {
  Write-Host "[WARN] .\src\server.mjs not found" -ForegroundColor Yellow
}

Write-Host "`n== index.html service worker hints ==" -ForegroundColor Cyan
if (Test-Path -LiteralPath $indexFile -PathType Leaf) {
  $hits = @(Select-String -Path $indexFile -Pattern "serviceWorker|sw\.js|register")
  if ($hits.Count -eq 0) {
    Write-Host "(no match)"
  } else {
    foreach ($hit in $hits) {
      Write-Host ("{0}:{1}" -f $hit.LineNumber, $hit.Line.Trim())
    }
  }
} else {
  Write-Host "[WARN] .\public\index.html not found" -ForegroundColor Yellow
}

Write-Host "`n== sw.js file info ==" -ForegroundColor Cyan
if (Test-Path -LiteralPath $swFile -PathType Leaf) {
  $sw = Get-Item -LiteralPath $swFile
  Write-Host ("LastWriteTime: {0}" -f $sw.LastWriteTime)
  Write-Host ("Length: {0}" -f $sw.Length)
} else {
  Write-Host "[WARN] .\public\sw.js not found" -ForegroundColor Yellow
}

exit 0
