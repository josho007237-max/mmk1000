# Remaining Work Implementation Pack

## Phase A — Inventory + Access Baseline
**Tasks**
- Confirm Cloudflare account access and bn9.app zone ownership.
- Identify the tunnel name and Cloudflare Access application owners.
- Capture current production hostname list and DNS records.

**Definition of Done**
- Admin account with access to Cloudflare Zero Trust and DNS.
- Known list of hostnames and current DNS records.
- Tunnel name and owner recorded.

**PowerShell checks**
```powershell
cloudflared --version
cloudflared tunnel list
cloudflared tunnel info mmk1000-panel
```

## Phase B — Cloudflare Access Policy
**Tasks**
- Create Self-hosted app for `mmk1000-dev.bn9.app`.
- Add Allow policy for specific emails only.
- Ensure no "Everyone" rules exist on the app.

**Definition of Done**
- App exists with `mmk1000-dev.bn9.app` as the hostname.
- Allow rule lists specific email addresses.
- "Everyone" policy removed or disabled.

**PowerShell checks**
```powershell
Write-Host "Verify in Cloudflare Zero Trust UI: Access > Applications > mmk1000-dev.bn9.app"
```

## Phase C — Tunnel + DNS Routing
**Tasks**
- Create tunnel config for `mmk1000-dev.bn9.app`.
- Route DNS to the tunnel.
- Verify tunnel connects and hostname resolves.

**Definition of Done**
- Tunnel config points to `http://localhost:4100`.
- DNS CNAME shows cloudflared tunnel mapping.
- `mmk1000-dev.bn9.app` responds via Access.

**PowerShell checks**
```powershell
cloudflared tunnel route dns mmk1000-panel mmk1000-dev.bn9.app
nslookup mmk1000-dev.bn9.app
curl --ssl-no-revoke https://mmk1000-dev.bn9.app/ -I
```

## Phase D — Frontend Safety + Banner
**Tasks**
- Show warning banner when hostname is not localhost.
- Require typed confirmation "SEND" in real mode.

**Definition of Done**
- Banner is visible on non-localhost.
- "SEND" is required before any `/send` call in real mode.

**PowerShell checks**
```powershell
Write-Host "Open https://mmk1000-dev.bn9.app and confirm banner + SEND confirmation"
```

## Phase E — Audit + Health
**Tasks**
- Run `tools/audit.ps1` before each publish.
- Verify API health and queue authentication.

**Definition of Done**
- Audit script completes with green checks.
- `/api/health` OK and `/api/withdraw/queue` authorized.

**PowerShell checks**
```powershell
.\tools\audit.ps1 -AdminKey "YOUR_ADMIN_KEY"
```

## Phase F — Release + Monitoring
**Tasks**
- Publish through Cloudflare Access only.
- Monitor errors and access logs after release.

**Definition of Done**
- Access is enforced and tested by allowed emails only.
- No errors in Cloudflare or server logs after release window.

**PowerShell checks**
```powershell
Write-Host "Verify Access logs and server logs after release"
```
