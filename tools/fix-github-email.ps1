Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$gitName = $env:GIT_NAME
if ([string]::IsNullOrWhiteSpace($gitName)) {
  $gitName = Read-Host 'Enter GIT_NAME'
}

$gitEmail = $env:GIT_EMAIL
if ([string]::IsNullOrWhiteSpace($gitEmail)) {
  $gitEmail = Read-Host 'Enter GIT_EMAIL'
}

git config user.name "$gitName"
git config user.email "$gitEmail"

git config --show-origin --get user.email

git commit --amend --reset-author --no-edit

git log -1 --pretty=format:"%h  %an <%ae>%n"
