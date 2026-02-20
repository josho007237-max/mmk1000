# Reset Book + Audit Suite (MMK1000)

## 1) Architecture
- Runtime: Node.js + Express (`src/server.mjs`) พอร์ตค่าเริ่มต้น `4100`
- Storage หลักฝั่งถอน: `data/withdraw-queue.json` ผ่าน `src/withdraw.store.mjs` (single source of truth)
- Integrations:
  - TMN adapter: `src/tmn.adapter.mjs`
  - Preflight: `src/tmn.preflight.mjs`
  - QR decode: `src/qr.decode.mjs`
- Service mode:
  - `TMN_MODE=mock` ใช้ mock flow
  - `TMN_MODE=real` บังคับตรวจ env ครบก่อนบูต

## 2) File Map
- `src/server.mjs` API entrypoint + auth + withdraw orchestration
- `src/withdraw.store.mjs` queue read/write/lock/backup
- `src/tmn.adapter.mjs` TMN API bridge (balance/tx/transfer)
- `src/tmn.preflight.mjs` readiness check ก่อนส่งเงินจริง
- `data/withdraw-queue.json` queue data จริง
- `public/` dashboard/static UI
- `logs/web.out.log`, `logs/web.err.log` runtime logs
- `scripts/restart-service.ps1` restart + health + log fallback
- `tools/audit.ps1` audit snapshot -> `logs/audit_<stamp>.txt`

## 3) Confirmed Endpoints
- Public:
  - `GET /api/health`
  - `GET /api/tmn/preflight` (ต้องมี `x-admin-key`)
- Admin under `/api` (`adminApi`, ต้องมี `x-admin-key`):
  - `GET /api/doctor/env`
  - `GET /api/dashboard`
  - `POST /api/qr/decode`
  - `GET /api/withdraw/queue`
  - `POST /api/withdraw/create`
  - `POST /api/withdraw/:id/approve` (full admin key)
  - `POST /api/withdraw/:id/send` (full admin key)
- Dev-only (`NODE_ENV != production`):
  - `GET /api/routes`
  - `GET /api/_debug/storage`

## 4) Withdraw Flow
1. `POST /api/withdraw/create` -> สร้างรายการ `new` (normalize บาง type/field)
2. `POST /api/withdraw/:id/approve` -> เปลี่ยนเป็น `approved`
3. `POST /api/withdraw/:id/send` -> ตรวจเงื่อนไขก่อนส่ง:
   - mode ต้องเป็น `real`
   - สถานะต้อง `approved`
   - preflight ล่าสุดต้องไม่ fail ภายใน window
   - validate ปลายทางตาม type (`p2p/wallet/bank/promptpay`)
   - lock job, backup queue, เรียก TMN transfer
4. Result:
   - success -> `sent`
   - failure -> `failed` + detail ใน queue/log

## 5) Env
- จาก `.env.example`:
  - `TMN_MODE`, `TMNONE_KEYID`, `TMN_MSISDN`, `TMN_LOGIN_TOKEN`
  - `TMN_TMN_ID`, `TMN_DEVICE_ID`, `TMN_PIN6`
  - `ADMIN_KEY`, `PORT`
- Real mode (`TMN_MODE=real`) ต้องมีค่าหลักครบ ไม่ครบจะ `process.exit(1)`

## 6) Runbook Service
- Restart service + health:
  - `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-service.ps1`
- ตรวจ service:
  - `sc.exe queryex mmk1000-web`
- ตรวจ health:
  - `curl.exe -sS http://127.0.0.1:4100/api/health`
- เก็บ audit:
  - `pwsh -NoProfile -ExecutionPolicy Bypass -File .\tools\audit.ps1`

## 7) Current Blockers
- ต้องรัน script/service บางตัวด้วยสิทธิ์ Administrator
- `GET /api/routes` เปิดเฉพาะ non-production
- ส่ง withdraw ไม่ได้ถ้า:
  - `TMN_MODE` ไม่ใช่ `real`
  - preflight fail ล่าสุดยังอยู่ใน fail window
  - config TMN ขาด (`tmn_cfg_missing` / `tmn_cfg_invalid`)
  - ปลายทางไม่ผ่าน validation (`bank_dest_invalid`, `dest_same_as_source`, etc.)
  - PromptPay แบบ E-Wallet ID 15 หลัก ยังไม่รองรับ (`ewallet_not_supported`)

## 8) Next Phases
- เพิ่ม endpoint routes dump ที่อ่านได้ใน production แบบจำกัดสิทธิ์ (ไม่พึ่ง dev-only)
- เพิ่ม structured audit JSON ควบคู่ txt เพื่อ diff อัตโนมัติ
- เพิ่ม smoke test ชุด withdraw happy/fail path หลัง restart service
- เพิ่ม log correlation (`x-request-id`) ให้ครบทุก critical path
