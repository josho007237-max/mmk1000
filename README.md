# MMK1000 Quick Runbook

## Env (PowerShell)
Set the API base and admin key for smoke tests:
```
$env:MMK_BASE="http://127.0.0.1:4100"
$env:ADMIN_KEY="mmk1000"
```

## Quick Checks
Syntax check:
```
.\tools\check-syntax.ps1
```

Smoke test:
```
node .\scripts\smoke.mjs
```

## Localhost vs 127.0.0.1
Do not switch between `localhost` and `127.0.0.1` for the UI. They are different origins and do not share `localStorage`.

## Clear SW + Storage (Chrome)
1. DevTools > Application > Service Workers: click Unregister.
2. DevTools > Application > Storage: click Clear site data.

## Chrome DevTools: Clear storage
1. Go to DevTools > Application tab.
2. In the left sidebar, scroll up above Session storage and click "Clear storage".
3. Check all boxes, then click "Clear site data".
4. Verify `ADMIN_KEY` is gone from Session storage/local storage.

## Clear Site Data (Safe)
1. DevTools > Application > Storage.
2. Check: Unregister service workers, Local and session storage, Cache storage.
3. Click Clear site data, then refresh.
4. This clears browser data for this origin only (does not affect code).
# mmk1000
