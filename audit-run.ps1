Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-ProjectRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $pkg = Join-Path $Path "package.json"
    $server = Join-Path $Path "src\\server.mjs"
    $index = Join-Path $Path "public\\index.html"

    if (Test-Path -LiteralPath $pkg) {
        if ((Test-Path -LiteralPath $server) -or (Test-Path -LiteralPath $index)) {
            return $true
        }
    }
    return $false
}

function Find-ProjectRootUpward {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StartPath
    )

    $current = (Resolve-Path -LiteralPath $StartPath).Path
    while ($true) {
        if (Test-ProjectRoot -Path $current) {
            return $current
        }
        $parent = Split-Path -Parent -Path $current
        if ($parent -eq $current) { break }
        $current = $parent
    }
    return $null
}

function Find-ProjectRootsRecursive {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StartPath
    )

    $roots = @()
    $pkgs = Get-ChildItem -LiteralPath $StartPath -Recurse -Filter "package.json" -File -ErrorAction SilentlyContinue
    foreach ($pkg in $pkgs) {
        $dir = $pkg.Directory.FullName
        $server = Join-Path $dir "src\\server.mjs"
        $index = Join-Path $dir "public\\index.html"
        if ((Test-Path -LiteralPath $server) -or (Test-Path -LiteralPath $index)) {
            $roots += [pscustomobject]@{
                Root = $dir
                HasServer = (Test-Path -LiteralPath $server)
                HasIndex = (Test-Path -LiteralPath $index)
            }
        }
    }
    return $roots
}

$start = (Get-Location).Path
$root = Find-ProjectRootUpward -StartPath $start

if (-not $root) {
    Write-Host "Root not found by upward search from: $start"
    Write-Host "Searching recursively..."
    $found = Find-ProjectRootsRecursive -StartPath $start
    if ($found.Count -gt 0) {
        Write-Host "Found candidate roots:"
        $found | ForEach-Object {
            Write-Host ("- {0} (server.mjs={1}, index.html={2})" -f $_.Root, $_.HasServer, $_.HasIndex)
        }
    } else {
        Write-Host "No candidate roots found."
    }
    exit 1
}

Write-Host "Root: $root"

$srcPath = Join-Path $root "src"
$publicPath = Join-Path $root "public"
$serverPath = Join-Path $root "src\\server.mjs"
$indexPath = Join-Path $root "public\\index.html"
$swPath = Join-Path $root "public\\sw.js"

Write-Host ("Test-Path .\\src: {0}" -f (Test-Path -LiteralPath $srcPath))
Write-Host ("Test-Path .\\public: {0}" -f (Test-Path -LiteralPath $publicPath))
Write-Host ("Test-Path .\\src\\server.mjs: {0}" -f (Test-Path -LiteralPath $serverPath))
Write-Host ("Test-Path .\\public\\index.html: {0}" -f (Test-Path -LiteralPath $indexPath))

if (Test-Path -LiteralPath $serverPath) {
    Write-Host "Select-String import/require in src\\server.mjs:"
    Select-String -LiteralPath $serverPath -Pattern "import|require"
}

if (Test-Path -LiteralPath $indexPath) {
    Write-Host "Select-String serviceWorker/sw.js/register in public\\index.html:"
    Select-String -LiteralPath $indexPath -Pattern "serviceWorker|sw\\.js|register"
}

if (Test-Path -LiteralPath $swPath) {
    $item = Get-Item -LiteralPath $swPath
    Write-Host ("public\\sw.js LastWriteTime: {0}" -f $item.LastWriteTime)
    Write-Host ("public\\sw.js Length: {0}" -f $item.Length)
}
