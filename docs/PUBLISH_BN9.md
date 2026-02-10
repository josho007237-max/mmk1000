# Publish to bn9.app (MMK1000)

## A1) Create cert.pem (login)
```powershell
cloudflared tunnel login
```

## A2) Route DNS
```powershell
cloudflared tunnel route dns mmk1000-panel mmk1000-dev.bn9.app
cloudflared tunnel route dns mmk1000-panel mmk1000.bn9.app
```

## A3) Verify DNS + HTTP
```powershell
ipconfig /flushdns
Resolve-DnsName mmk1000-dev.bn9.app
Resolve-DnsName mmk1000.bn9.app
nslookup mmk1000-dev.bn9.app
nslookup mmk1000.bn9.app
curl https://mmk1000-dev.bn9.app/ -I
curl https://mmk1000.bn9.app/ -I
```

## CNAME expectation
- Cloudflare Tunnel routing creates a CNAME that points to `<UUID>.cfargotunnel.com`.
- Current tunnel UUID: `9c17b990-878f-4a6d-a0fa-13a3df5b9a86`.

## Run tunnel with config.yml
```powershell
cloudflared tunnel --config "$env:USERPROFILE\.cloudflared\config.yml" run mmk1000-panel
```
