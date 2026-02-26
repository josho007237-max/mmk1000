# MMK1000 Fix 502 Runbook (One-shot)

เอกสารนี้สรุปขั้นตอนสั้น ๆ สำหรับแก้ปัญหา 502 ให้รันได้ครั้งเดียวและตรวจผลได้ทันทีบน Windows

## 1) Smoke check ก่อน/หลังแก้

รัน:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-domain.ps1
```

ตัวเลือกสำคัญ:

```powershell
$env:MMK_LOCAL="http://127.0.0.1:4100"
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-domain.ps1 -Domain "mmk1000.bn9.app"
```

คาดหวังเมื่อระบบปกติ:
- local health = `200`
- domain health = `200` (หรือ `403` หากมี Cloudflare Access policy)
- `summary_overall=PASS` และ exit code = `0`

## 2) One-shot แก้พอร์ต cloudflared

รัน:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\fix-cloudflared-port.ps1
```

สิ่งที่สคริปต์ทำอัตโนมัติ:
- หา port จริงจาก `$env:PORT` หรือ probe `http://127.0.0.1:<port>/api/health`
- หา service cloudflared และ parse `--config`
- backup config ก่อนแก้ (`*.bak_yyyyMMdd_HHmmss`)
- แก้ `service: http://127.0.0.1:PORT` ให้ตรงพอร์ตจริง
- validate ด้วย `cloudflared tunnel ingress validate`
- restart service cloudflared
- เทส domain health ซ้ำ และสรุป PASS/FAIL พร้อม exit code

ตัวอย่างกำหนดพอร์ตเอง:

```powershell
$env:PORT="4100"
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\fix-cloudflared-port.ps1
```

## 3) สรุปอาการว่า "หายแล้ว"

ต้องเห็นอย่างน้อย:
- local `/api/health` ได้ `200`
- domain `https://mmk1000.bn9.app/api/health` ได้ `200` หรือ `403`

จากนั้นรัน smoke ซ้ำอีกครั้งเพื่อยืนยันผล:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-domain.ps1
```
