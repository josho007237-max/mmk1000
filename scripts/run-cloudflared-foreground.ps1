Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$cfg = 'C:\Users\ADMIN\.cloudflared\mmk1000.yml'

Stop-Service -Name Cloudflared -Force
& cloudflared.exe --loglevel debug --config $cfg tunnel run
