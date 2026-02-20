Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

git status -sb

$originUrl = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($originUrl)) {
  Write-Host 'remote origin not found' -ForegroundColor Red
  exit 1
}

git fetch origin --prune

$pushOutput = git push -u origin HEAD:main 2>&1
$pushExitCode = $LASTEXITCODE
$pushOutput | ForEach-Object { Write-Host $_ }

if ($pushExitCode -ne 0) {
  $pushText = ($pushOutput | Out-String)
  if ($pushText -match 'non-fast-forward' -or $pushText -match '\[rejected\]' -or $pushText -match 'fetch first') {
    Write-Host 'Push rejected (non-fast-forward). Try:' -ForegroundColor Yellow
    Write-Host 'git push origin HEAD:main --force-with-lease' -ForegroundColor Yellow
  }
  exit 1
}

git log -1 --pretty=format:"%h  %an <%ae>%n"
