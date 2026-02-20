Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($args -contains '--selftest') {
  $tokens = $null
  $errors = $null
  $content = Get-Content -LiteralPath $PSCommandPath -Raw
  [void][System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$errors)
  if ($errors -and $errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Host $_.Message -ForegroundColor Red }
    exit 1
  }
  exit 0
}

git status -sb

$originUrl = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($originUrl)) {
  Write-Host 'remote origin not found' -ForegroundColor Red
  exit 1
}

git fetch origin --prune

$emails = git log --pretty=format:"%ae%n%ce" origin/main..HEAD 2>$null | Sort-Object -Unique
if ($emails) {
  Write-Host 'Emails in commits to push:'
  $emails | ForEach-Object { Write-Host $_ }
  $nonNoreply = $emails | Where-Object { $_ -and ($_ -notmatch '@users\.noreply\.github\.com$') }
  if ($nonNoreply) {
    Write-Host 'GH007 risk: found non-noreply commit email(s).' -ForegroundColor Yellow
    Write-Host 'Suggested fix:' -ForegroundColor Yellow
    Write-Host "git filter-branch --env-filter 'export GIT_AUTHOR_EMAIL=\"YOUR@users.noreply.github.com\"; export GIT_COMMITTER_EMAIL=\"YOUR@users.noreply.github.com\"' origin/main..HEAD" -ForegroundColor Yellow
  }
}

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
