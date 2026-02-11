# MMK1000 Team Guide (TH)

คู่มือทีมฉบับสั้นสำหรับ setup, run และแชร์การใช้งาน MMK1000 อย่างปลอดภัย

## 1) Clone โปรเจกต์ (รองรับ private repo)

```powershell
git clone <repo-url>
cd MMK1000
```

ถ้าขึ้น `Repository not found` ให้ตรวจ 2 จุด:
- ชื่อ repo / owner ใน URL ผิด
- บัญชีที่ใช้ clone ไม่มีสิทธิ์เข้าถึง repo (private)

## 2) Clone ด้วย PAT (แทน password)

ใช้ username ปกติ และใช้ `PAT` แทน password ตอน `git clone`/`git pull`

ตัวอย่าง:
```powershell
git clone https://github.com/<owner>/<repo>.git
```

เมื่อระบบถาม:
- `Username`: ใส่ GitHub username
- `Password`: ใส่ Personal Access Token (PAT)

## 3) ติดตั้งและรัน

```powershell
npm install
node src/server.mjs
```

เปิดเว็บที่:
- `http://127.0.0.1:4100` (หรือพอร์ตตาม `PORT`)

## 4) ใช้งานหน้าเว็บ

1. ใส่ `ADMIN KEY` แล้วกดบันทึก
2. เมนู `แดชบอร์ด`: ดูยอดและรายการ
3. เมนู `ถอนเงิน`: สร้างคิว / อนุมัติ / ส่งโอน
4. เมนู `สแกน QR`: ถอดรหัส QR เพื่อเติมปลายทาง

## 5) ตั้งค่าใช้งานจริง (real mode)

1. สร้างไฟล์ env:
   ```powershell
   Copy-Item .env.example .env
   ```
2. ตั้งค่าอย่างน้อย:
   - `TMN_MODE=real`
   - `DEBUG_HEADERS=0`
   - `NODE_ENV=production`
   - `ADMIN_KEY` (ห้ามใช้ค่าง่าย)
   - ชุด `TMN_*` ให้ครบ
3. ห้าม commit ไฟล์ `.env` และ secret ทุกชนิด

## 6) แชร์ให้ทีมใช้งาน

### แบบ LAN
- ให้ทีมเข้า `http://<LAN-IP-เครื่องคุณ>:4100`
- เปิด firewall เฉพาะพอร์ตที่จำเป็น

### แบบ Cloudflare Quick Tunnel
```powershell
cloudflared tunnel --url http://localhost:4100
```
- ส่ง URL ที่ได้จาก cloudflared ให้ทีม
- แนะนำเปิด Access control ก่อนใช้งานจริง

## 7) ข้อควรระวัง

- โหมด `mock` = ทดสอบ
- โหมด `real` = ธุรกรรมจริง มีความเสี่ยงเงินจริง
- ก่อนใช้งานจริง ให้ทดสอบ flow สำคัญใน `mock` ก่อนเสมอ
