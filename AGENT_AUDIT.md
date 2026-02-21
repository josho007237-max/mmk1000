# AGENT_AUDIT

เอกสารนี้เก็บสรุปแนวปฏิบัติสำหรับการ audit/agent change ในรีโปนี้ เพื่อใช้เป็น baseline ระหว่างรอบ deploy

## Baseline checks
- ตรวจ syntax ก่อนทุกครั้ง: `./tools/check-syntax.ps1`
- ตรวจสุขภาพ API: `curl http://127.0.0.1:4100/api/health`
- ตรวจ queue auth: `curl -H "x-admin-key: <ADMIN_KEY>" http://127.0.0.1:4100/api/withdraw/queue`

## Withdrawal safety checklist
- ยอมรับประเภท `bank`, `promptpay`, `wallet` เท่านั้น
- normalize alias `p2p` -> `wallet` ก่อนบันทึก job
- route `/api/withdraw/:id/send` ต้อง block เมื่อ:
  - ไม่ใช่โหมด `real`
  - job ไม่อยู่สถานะ `approved`
  - ปลายทางไม่ถูกต้องตามประเภท
  - ปลายทางซ้ำกับเบอร์ต้นทาง

## Operational checklist
- backup `data/withdraw-queue.json` ก่อน approve/send
- ห้าม bypass `x-admin-key` ใน admin routes
- บันทึก trace (`x-request-id`/`x-rid`) สำหรับ send path

## Release checks
- run preflight ก่อนส่งเงินจริง
- ตรวจ Cloudflared tunnel ปลายทางตรงพอร์ต service
- ตรวจ log หลัง deploy อย่างน้อย 1 release window

> Source: imported from attached project handoff document.
