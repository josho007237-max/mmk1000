param()

$domain = "mmk1000-dev.bn9.app"
$server = "1.1.1.1"

Write-Host ("Resolving A record for {0} via {1}..." -f $domain, $server)
$aRecords = Resolve-DnsName -Name $domain -Type A -Server $server -ErrorAction SilentlyContinue
if ($aRecords) {
  $aRecords | Where-Object { $_.IPAddress } | ForEach-Object { Write-Host ("A: {0}" -f $_.IPAddress) }
} else {
  Write-Host "No A records returned."
}

Write-Host ""
Write-Host ("Resolving AAAA record for {0} via {1}..." -f $domain, $server)
$aaaaRecords = Resolve-DnsName -Name $domain -Type AAAA -Server $server -ErrorAction SilentlyContinue
if ($aaaaRecords) {
  $aaaaRecords | Where-Object { $_.IPAddress } | ForEach-Object { Write-Host ("AAAA: {0}" -f $_.IPAddress) }
} else {
  Write-Host "No AAAA records returned."
}

Write-Host ""
Write-Host "Note: If this hostname is behind a proxy with CNAME flattening,"
Write-Host "direct CNAME lookups can return no answers even though A/AAAA resolve."
