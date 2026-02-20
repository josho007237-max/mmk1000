# สรุปผู้บริหาร

เราได้วิเคราะห์ **TMNOne.js** (NodeJS) และ **TMNOne.php** (PHP) ซึ่งเป็นไลบรารีส่งคำสั่ง TrueMoney API และโค้ดโปรเจกต์ MMK1000 ที่เรียกใช้งานฟังก์ชันเหล่านี้ พบฟังก์ชันหลัก (เช่น `transferP2P`, `getRecipientInfo`, `#wallet_connect`, `#getShieldID`, `transferQRPromptpay`, `transferBankAC`) มี flow การดึง token จาก `loginWithPin6` และ *shield_id* จาก API เพื่อนำไปใช้ใน header (เช่น `X-Shield-Session-Id`) ทำรายการโอน (P2P, พร้อมเพย์, ธนาคาร) และมีการจัดการ error (เช่น **"shield_id is expired"** ต้องรีเฟรช)【47†L181-L189】【47†L189-L193】. 

ตรวจสอบโค้ด MMK1000 พบการแมป `job.type` แบบเดิมคือ `"wallet"→wallet_id` (ทรูไปทรู) และ `"promptpay"→proxy_value` (พร้อมเพย์) เท่านั้น (ไม่มี alias `"p2p"` ให้ใช้ `"wallet_id"`)【47†L181-L189】. ใน `server.mjs` ยังใช้ `missingTmnFields(cfg)` เช็คค่า TMN config (โดยตัดช่องว่างแบบเข้มงวด)【7†L67-L74】 และ **แมร์ค job เป็น `sent` แม้เกิด error** (ไม่มีเช็ค `r.ok`/`r.error`) ซึ่งเป็นความเสี่ยงสูง. นอกจากนี้ยังมีปัญหา validation “PromptPay 15 หลัก” (ไม่รองรับ e-wallet) และ logging ที่เปิดเผย header บางส่วน (แม้ถูก *redact* แล้ว) เป็นต้น.

เราได้ออกแบบ **แพตช์แบบ minimal-diff** ดังนี้:  
a) ใน **TMNOne.js** แทรก retry เมื่อเจอคำตอบ “shield_id is expired” (เรียก `getShieldID()` ใหม่แล้วลอง request อีกครั้ง) (เพิ่มแค่ 1-2 บรรทัด)  
b) ใน **server.mjs** แก้รหัส `/withdraw/:id/send` ให้ตรวจผลจาก `tmnSendTransfer` หากมี `!r.ok` หรือ `r.result.error` ให้ `markWithdrawalResult(...,"failed",r)` และส่ง error กลับ (ไม่ mark sent)  
c) รองรับ alias **`type="p2p"`** โดย normalize ให้เท่ากับ `"wallet"` (อาจทำใน front-end หรือ createWithdrawal)  
d) ปรับหน้าเว็บ (index.html/app.js) เพิ่ม dropdown หรือ radio เลือก “ทรูมันนี่ (Wallet) / พร้อมเพย์ / ธนาคาร” พร้อมช่องกรอกให้แยกชัดเจนและ validate ฝั่ง client (เช่น เบอร์/บัตร 10/13 หลัก, account non-empty)

ต่อไปนี้เป็นรายละเอียดวิเคราะห์และขั้นตอนเสนอการแก้ไข พร้อมตัวอย่างโค้ด (diff) คำสั่ง PowerShell สำหรับ restart/backup และชุดคำสั่งทดสอบ (create→approve→send) ทั้ง wallet (P2P) และ promptpay (Mock) รวมถึงตารางที่สรุป mapping และ flow charts พร้อมตัวอย่าง log ที่เกี่ยวข้อง. 

# 1. โครงสร้างและฟังก์ชันสำคัญของ TMNOne.js/ TMNOne.php

จากเอกสารทางการของ TMNOne (NodeJS/PHP) พบฟังก์ชันหลักของไลบรารีดังนี้【1†L159-L167】【47†L181-L189】:

- **`setData(keyid, msisdn, loginToken, tmnId, deviceId)`** – กำหนดข้อมูลเบื้องต้น (Key ID, เบอร์ Wallet, token, tmn_id, device_id)  
- **`loginWithPin6(pin)`** – เข้าระบบด้วย PIN 6 หลัก เพื่อดึง **Access Token** ใหม่ ถ้า token หมดอายุ (ต้องเก็บผลในคลาส)  
- **`getBalance()`** – ดึงยอดเงินคงเหลือ  
- **`getRecipientInfo(payee_wallet_id)`** – ดึงข้อมูล wallet ปลายทาง (TrueMoney wallet)【1†L159-L167】  
- **`transferP2P(payee_wallet_id, amount, personal_msg)`** – โอนเงิน P2P ไป wallet ปลายทาง【1†L159-L167】  
- **`transferQRPromptpay(payee_proxy_value, amount)`** – โอนเงิน *พร้อมเพย์* (PromptPay) ไปยังหมายเลข Proxy (เบอร์หรือเลขบัตร)【47†L181-L185】  
- **`transferBankAC(bank_code, bank_ac, amount, wallet_pin)`** – โอนเงินออกไปบัญชีธนาคาร (ต้องใช้ PIN)【47†L189-L193】  
- **`getTransferP2PStatus(draft_id)`** – ตรวจสถานะโอน P2P  
- **(PHP) `fetchTransactionHistory`, `fetchTransactionInfo` ฯลฯ** – ดึงรายการธุรกรรม (เหมือน Node)  

ทั้งสองคลาสจะมีเมทอดภายใน (private) เช่น **`#wallet_connect(uri, headers, body, method)`** และ **`#getShieldID()`** (ใน PHP อาจเรียกว่า `getShieldID()`) เพื่อติดต่อกับ TrueMoney Gateway โดยอัตโนมัติ. Flow การทำงานทั่วไปของโค้ดกลุ่มนี้คือ:

```mermaid
sequenceDiagram
    participant Client as YourAppp
    participant TMN as TMNOne.Class
    participant API as TrueMoney API

    %% เมื่อต้องการโอนเงิน
    Client->>TMN: setData(...); loginWithPin6(pin) 
    note right of API: (1) ได้ AccessToken
    API-->>TMN: AccessToken
    Client->>TMN: (อาจ set device_id, etc.)
    Client->>TMN: getShieldID() 
    note right of API: (2) ได้ shield_id (X-Shield-Session-Id)
    API-->>TMN: shield_id
    
    Client->>TMN: transferP2P(...) \n (ใช้ shield_id ใน header X-Shield-Session-Id)
    API-->>TMN: { success response or error }
    alt หาก "shield_id is expired"
        TMN->>TMN: #wallet_connect พบ shield_id expired
        TMN->>TMN: #getShieldID() (retry)
        TMN->>API: (retry transferP2P)
        API-->>TMN: new { success or error }
    end
    TMN-->>Client: result object
```

จากเอกสาร【47†L181-L185】【47†L189-L193】 เราเห็นว่าหลัง login และตั้งค่าสมาชิก (setData) TMNOne จะใส่ค่า `loginToken` และ `deviceId` ใน header ทุกครั้ง. ส่วน `getShieldID()` จะติดต่อ API ของ TrueMoney เพื่อรับ `shield_id` ใหม่ (บันทึกในคลาส เช่น `this.shield_session_id`). เวลาทำธุรกรรม (`transferP2P`, `transferQRPromptpay`, `transferBankAC`) จะเรียก `#wallet_connect` ซึ่งต่อ API ทำรายการ โดยส่ง header ประกอบด้วย เช่น:  

- `Authorization: Bearer ${accessToken}`  
- `X-TMN-Session-Id: ${loginToken}` (Header อื่นอาจมีรูปแบบคล้ายๆ นี้)  
- `X-Shield-Session-Id: ${shield_id}`  
- `X-TMN-Device-Id: ${deviceId}`  

หลัง API ตอบ, หากเกิดข้อความแสดงความผิดพลาดว่า **“shield_id is expired”** (API ส่งกลับ `message` แบบนั้น) โค้ดจะรีเฟรช shield ด้วย `getShieldID()` แล้วลองส่งคำขอซ้ำ (retry) 【47†L181-L185】【47†L189-L193】. การจัดการ token/session (loginWithPin6) จะตรวจดูว่า token ยังไม่หมดอายุ หากหมดอายุก็ login ใหม่โดยอัตโนมัติ. 

ทั้งนี้ รูปแบบ request/response และ error handling ของ TMNOne จะต่างกันตามเมทอด เช่น: `transferP2P` ส่ง JSON body {"payee_wallet_id":..., "amount":..., "personal_msg":...} และได้ response ที่มี `report_id` หรือ `error` ส่วน `transferQRPromptpay` ส่ง {"payee_proxy_value":..., "amount":...} ตามเอกสาร【47†L181-L185】. Error เช่น “shield_id expired” หรือปัญหาทั่วไปจะถูกใส่ใน `error` หรือ `message` ในผลลัพธ์.

# 2. การเรียกใช้งานจากโค้ดโปรเจกต์ MMK1000

จากการค้นในโค้ด **MMK1000** (ภายใน `src/tmn.adapter.mjs` และ `src/server.mjs`) พบจุดสำคัญดังนี้:

- **Mapping `job.type` กับฟิลด์:** ดู `src/tmn.adapter.mjs` (ฟังก์ชัน `tmnSendTransfer`)【13†L168-L177】: 

  ```js
  if (job.type === "bank") {
    // แบงก์
  }
  if (job.type === "promptpay") {
    // พร้อมเพย์ โดยใช้ job.dest.proxy_value
    const r = await tmn.transferQRPromptpay(job.dest.proxy_value, job.amount);
    return { ok: true, mode: "real", result: r };
  }
  if (job.type === "wallet") {
    // TrueMoney wallet (P2P) โดยใช้ job.dest.wallet_id
    const r = await tmn.transferP2P(job.dest.wallet_id, job.amount, job.note || "");
    return { ok: true, mode: "real", result: r };
  }
  ```

  => **Mapping:** `"wallet" ⇒ wallet_id` (ทรูมันนี่ P2P), `"promptpay" ⇒ proxy_value` (เบอร์/บัตร)【13†L176-L183】. (ไม่มี `"p2p"` alias จึงต้องเพิ่ม)  

- **การเช็ค config (getTmnCfg):** ใน `src/server.mjs` พบฟังก์ชัน `getTmnCfg(req)`【7†L85-L94】 ดึงค่า TMN config จาก header หรือ env หากไม่พบ header (fallback เป็นตัวแปรสิ่งแวดล้อมเช่น `process.env.TMNONE_KEYID` เป็นต้น). ฟิลด์หลักที่ต้องมีคือ `keyid, loginToken, tmnId, deviceId, pin6` (และ proxy สำหรับ HTTP proxy)【7†L94-L104】.

- **ฟังก์ชัน validateEnv:** มีตรวจค่าที่ต้องมี (Core ต้องมี key id, msisdn, login token, tmn_id, device_id, pin6; ถ้ามี proxy ก็รวม proxy keys)【7†L107-L115】.  

- **Route `/dashboard`:** มี log เพื่อ debug ว่า cfg ถูกเซ็ตหรือไม่ (ใน code snippet user เปิด log)【7†L228-L234】.  

- **Route `/withdraw/:id/send`:** โค้ดเดิม (จาก user logs)【22†L293-L302】:  
  ```js
    if ((process.env.TMN_MODE || "mock") === "real") {
      const cfg = getTmnCfg(req);
      const missing = missingTmnFields(cfg);
      if (missing.length) {
        return sendErr(res, 400, "tmn_cfg_missing", { missing_fields: missing });
      }
    }
    const r = await tmnSendTransfer(job, getTmnCfg(req));
    const saved = await markWithdrawalResult(job.id, "sent", r);
    sendOk(res, { job: saved });
  ```
  สังเกตว่า **mark เป็น sent โดยไม่ตรวจสอบว่า `r.ok` หรือมี `r.result.error`** (ความเสี่ยง: อาจ mark sent แม้โอนไม่สำเร็จ). Logging ของ `/withdraw/*` แสดง progress แต่ไม่มี log เฉพาะ error (user logs ไม่มี `tmn_cfg_missing` ขึ้น).  

- **Validation ปัจจุบัน:** ใน `/withdraw/:id/approve` มีบล็อคพิเศษ “PromptPay 15 หลัก (E-Wallet ID) ยังไม่รองรับใน real mode”【22†L293-L302】. ซึ่งแปลว่าถ้ามี proxy_value ยาว 15 ดิจิต (เช่น ID wallet ภาคส่วน) จะหยุดด้วย error `ewallet_not_supported`. รายละเอียดในโค้ด:  
  ```js
  if (TMN_MODE==="real" && job.type==="promptpay") {
    const pv = String(job.dest.proxy_value).replace(/\D/g,"");
    if (pv.length === 15) {
      return sendErr(res, 400, "ewallet_not_supported", { hint: "..." });
    }
  }
  ```  
  (นั่นคือรองรับแค่ 10 หลักเลขโทรศัพท์หรือ 13 หลักบัตร ไม่รองรับ 15 หลัก e-wallet)【22†L293-L302】.

สรุปตาราง **Mapping type→field**:

| `job.type`    | API ฟิลด์            | หมายเหตุ                  |
|:-------------|:---------------------|:-------------------------|
| `"wallet"`   | `wallet_id`          | TrueMoney Wallet ID (เบอร์ทรู) |
| `"promptpay"`| `payee_proxy_value`  | เบอร์โทรหรือเลขบัตร (TLV Tag 01/02/03)【40†L752-L760】【40†L760-L763】 |
| `"bank"`     | `bank_code`, `bank_ac`, `wallet_pin` | บัญชีธนาคาร + PIN |

ข้อสังเกต: ควรเพิ่ม `"p2p"` → treat as `"wallet"` (alias) เพื่อ UX.

# 3. จุดบกพร่องและความเสี่ยง

จากข้อ (1)-(2) สรุปปัญหาและความเสี่ยงได้ดังนี้:

- **ไม่มี retry เมื่อ shield หมดอายุ:** ฟังก์ชัน `#wallet_connect` ของ TMNOne น่าจะต้องจับ “shield_id expired” แล้วเรียก `getShieldID()` และรีส่งคำขออีกครั้ง【47†L181-L185】【47†L189-L193】. ปัจจุบันโค้ดโปรเจกต์ไม่ได้ทำ ส่วน TMNOne เขาอาจไม่มี retry อัตโนมัติ (จึงเกิด error ที่ user พบ). ต้องเพิ่ม retry logic.  
- **mark sent แม้ error:** `server.mjs` mark Withdrawal เป็น sent ทันที โดยไม่เช็ค `r.ok` หรือ `r.result.error` ทำให้สถานะ job ไม่น่าเชื่อถือ (อาจแสดงเป็นส่งสำเร็จแม้โอนจริงๆ ล้มเหลว)【22†L293-L302】. ควรเปลี่ยนให้ mark เป็น failed กรณี `r.ok==false` หรือมี `r.result.error`.  
- **Race Condition/การล็อค:** อาจมีความเสี่ยง race หากมีการส่งคำขอพร้อมกันหลายจังหวะ เช่น 2 admin กดส่งพร้อมกัน (ควร check status & lock) –แต่ยังไม่พบในโค้ด.  
- **Logging ข้อมูลลับ:** ปัจจุบันโค้ดใช้ `redactHeaders` เพื่อซ่อน header บางตัว【7†L77-L83】 แต่ไม่ชัดเจนว่า `TMNONE_KEYID` หรือ token ถูกไม่ log (ดูโค้ด). ควรตรวจว่าไม่มีการ log secret เช่น loginToken หรือ pin (ดู output พบ `tmn_cfg_missing` log ไม่น่ารั่ว).  
- **Validation 邏輯:** เฉพาะ E-Wallet PromptPay ID 15 หลักถูก block แต่ไม่มี validation อื่น (เช่น ถ้าใส่เบอร์ 10 หลักโดยไม่มี 66 นำหน้า?). อาจแจ้งป้อนผิด.  
- **Alias type:** ไม่มีรองรับ `"p2p"` ในการสร้าง job หรือ UI ทำให้ต้องใส่ `"wallet"`. อาจทำให้ user สับสน.

ตาราง **Error→Action** (เฉพาะที่สำคัญ):

| ข้อผิดพลาด (Error)       | การตอบโต้ปัจจุบัน                     | ปัญหา/ข้อเสนอแก้ไข                          |
|:----------------------|:--------------------------------------|:------------------------------------------|
| `missingTmnFields`     | คืน 400 `"tmn_cfg_missing"` (good)     | OK                                         |
| Shield expired error  | (TMNOne replies msg)                   | ต้องดักใน TMNOne.js, retry shield id【47†L181-L185】 |
| Withdraw transfer `error` | Mark sent (ไม่มีเช็ค)【22†L293-L302】  | เปลี่ยนให้ Mark failed และตอบ error (patch) |
| E-Wallet 15 หลัก       | คืน 400 `"ewallet_not_supported"`【22†L293-L302】 | OK (เหมาะสม)                            |
| กรอก `type=p2p` (alias)  | ไม่รองรับ (ต้องพิมพ์ wallet)         | เพิ่ม alias ใน code/UI                   |

# 4. แพตช์แบบ minimal-diff (ระบุไฟล์/บรรทัด)

## a) เพิ่ม retry ใน TMNOne.js

ไฟล์ **TMNOne.js** (หากอยู่ใน root) ในเมทอดที่ทำ API request (เช่น `#wallet_connect` หรือหลังจากคำขอ transfer) ให้ตรวจสอบข้อความ “shield_id is expired” หากพบจึงเรียก `#getShieldID()` แล้ว retry 1 ครั้ง ตัวอย่าง diff (pseudo-code):

```diff
--- TMNOne.js (before)
+    // ส่ง request ปกติ
     const res = await this.#wallet_connect(uri, headers, body, method);
-    return res;
+    // หากตอบว่า shield_id หมดอายุ ให้รีเฟรชและ retry 1 ครั้ง
+    if (res?.message && res.message.toLowerCase().includes("shield_id is expired")) {
+      this._debug && console.log("[TMNOne] shield expired, retrying with new shield");
+      await this.#getShieldID();  // ดึง shield ใหม่
+      const res2 = await this.#wallet_connect(uri, headers, body, method);
+      return res2;
+    }
+    return res;
```
โดยใช้ `includes("shield_id is expired")` เพื่อจับ error แบบไม่ sensitive case. (พึงระวังไม่ loop).

## b) แก้ server.mjs: Mark failed แทน sendError

ไฟล์ **src/server.mjs** บรรทัด `// POST /withdraw/:id/send` (ใกล้บรรทัด 309 ใน [22]):

```diff
 adminApi.post("/withdraw/:id/send", async (req, res) => {
   let job;
   try {
     // ... หาข้อมูล job, approval check ...
     if ((process.env.TMN_MODE || "mock") === "real") {
       const cfg = getTmnCfg(req);
       const missing = missingTmnFields(cfg);
       if (missing.length) {
         return sendErr(res, 400, "tmn_cfg_missing", { missing_fields: missing });
       }
     }
-    const r = await tmnSendTransfer(job, getTmnCfg(req));
-    const saved = await markWithdrawalResult(job.id, "sent", r);
-    console.log(`[doctor] withdraw ${saved.id} sent`);
-    sendOk(res, { job: saved });
+    const r = await tmnSendTransfer(job, getTmnCfg(req));
+    // หาก API ล้มเหลว mark เป็น failed แล้วส่ง error กลับ
+    if (!r.ok || r.result?.error) {
+      const errMsg = r.result?.error || r.error || "TMN transfer failed";
+      await markWithdrawalResult(job.id, "failed", { error: errMsg });
+      console.log(`[doctor] withdraw ${job.id} failed: ${errMsg}`);
+      return sendErr(res, 500, errMsg);
+    }
+    const saved = await markWithdrawalResult(job.id, "sent", r);
+    console.log(`[doctor] withdraw ${saved.id} sent`);
+    sendOk(res, { job: saved });
   } catch (e) {
     // existing error handler
   }
 });
```

## c) รองรับ alias `type="p2p"`

ไฟล์สร้าง job (`adminApi.post("/withdraw/create")` in server.mjs หรือใน front-end): หากทาง front-end ใช้ง่ายๆ ก็ปรับใน JavaScript ที่ส่ง type: เช่น เมื่อเลือกถอนทรูให้ type="wallet", แต่ถ้มี code เพียวๆ อาจเพิ่ม:

```diff
@@ -src/server.mjs (withdraw/create)
- const job = await createWithdrawal(req.body);
+ if(req.body.type === "p2p") req.body.type = "wallet";
+ const job = await createWithdrawal(req.body);
```

(หรือปรับ UI ให้ dropdown ไม่มี “p2p” แต่ถ้อนุญาตผู้ใช้พิมพ์, ป้องกันที่ back-end).

## d) ปรับ public UI (index.html & app.js)

ตัวอย่าง diff เน้นจุดสำคัญ (HTML เพิ่ม dropdown, JS อ่านค่าตาม type):

**index.html** (เพิ่ม `<select id="withdrawType">` และ input group):

```diff
 <form id="withdrawForm">
+  <label for="withdrawType">ประเภทโอน:</label>
+  <select id="withdrawType">
+    <option value="wallet">TrueMoney Wallet (P2P)</option>
+    <option value="promptpay">PromptPay (เบอร์/บัตร)</option>
+    <option value="bank">บัญชีธนาคาร</option>
+  </select>
+  <div id="walletFields">
+    <label>TrueMoney Wallet ID:</label><input id="walletId" type="text" />
+  </div>
+  <div id="promptpayFields" style="display:none;">
+    <label>PromptPay (เบอร์ 10 หลัก/บัตร 13 หลัก):</label><input id="ppValue" type="text" />
+  </div>
+  <div id="bankFields" style="display:none;">
+    <label>รหัสธนาคาร:</label><input id="bankCode" type="text" /><br/>
+    <label>เลขบัญชี:</label><input id="bankAccount" type="text" />
+  </div>
+  <label>จำนวนเงิน:</label><input id="amount" type="number" step="0.01" /><br/>
+  <button type="submit">สร้างงานถอน</button>
 </form>
```

**app.js** (Javascript):

```js
// แสดง/ซ่อนกลุ่ม input ตามเลือกประเภท
document.getElementById("withdrawType").addEventListener("change", function(){
  const type = this.value;
  document.getElementById("walletFields").style.display = (type==="wallet" ? "" : "none");
  document.getElementById("promptpayFields").style.display = (type==="promptpay" ? "" : "none");
  document.getElementById("bankFields").style.display = (type==="bank" ? "" : "none");
});

document.getElementById("withdrawForm").onsubmit = async function(e){
  e.preventDefault();
  const type = document.getElementById("withdrawType").value;
  const amount = document.getElementById("amount").value;
  let dest = {};
  // Validate & set dest
  if(type==="wallet"){
    const wid = document.getElementById("walletId").value.trim();
    if(!wid) { alert("กรุณาระบุ Wallet ID"); return; }
    dest.wallet_id = wid;
  } else if(type==="promptpay"){
    const pp = document.getElementById("ppValue").value.trim();
    if(!/^\d{10,13}$/.test(pp)) { alert("PromptPay ต้องเป็น 10 หรือ 13 หลัก"); return; }
    dest.proxy_value = pp;
  } else if(type==="bank"){
    const bc = document.getElementById("bankCode").value.trim();
    const ba = document.getElementById("bankAccount").value.trim();
    if(!bc || !ba) { alert("กรุณาระบุธนาคารและเลขบัญชี"); return; }
    dest.bank_code = bc;
    dest.bank_ac = ba;
  }
  const job = await createWithdrawal({type,type, amount, dest});
  // show result...
};
```

(ดูว่าระบบใช้งาน axios/fetch หรือไม่ – ใช้ syntax สร้าง request ตามเดิม).

# 5. ตัวอย่าง patch (diff) แต่ละไฟล์ & คำสั่ง PowerShell

**Diff (ตัวอย่าง)** แสดงเฉพาะส่วนสำคัญ:

```diff
--- a/TMNOne.js
+++ b/TMNOne.js
@@ class TMNOne {
   async #wallet_connect(uri, headers = [], body = '', custom_method = null) {
     // ส่ง request ไป TMN API
     const res = await this.#fetch(uri, headers, body, custom_method);
+    // หากพบ error shield_id หมดอายุ ให้ refresh และ retry 1 ครั้ง
+    if (res?.message && res.message.toLowerCase().includes("shield_id is expired")) {
+      this._debug && console.log("[TMNOne] Shield expired, retry fetching new shield");
+      await this.#getShieldID();
+      return await this.#fetch(uri, headers, body, custom_method);
+    }
     return res;
   }

--- a/src/server.mjs
+++ b/src/server.mjs
@@ -301,8 +301,18 @@ adminApi.post("/withdraw/:id/send", requireFullAdmin, async (req, res) => {
     }
-    const r = await tmnSendTransfer(job, getTmnCfg(req));
-    const saved = await markWithdrawalResult(job.id, "sent", r);
-    console.log(`[doctor] withdraw ${saved.id} sent`);
-    sendOk(res, { job: saved });
+    const r = await tmnSendTransfer(job, getTmnCfg(req));
+    // ตรวจผลโอน TrueMoney
+    if (!r.ok || r.result?.error) {
+      const err = r.result?.error || r.error || "TMN transfer failed";
+      await markWithdrawalResult(job.id, "failed", { error: String(err) });
+      console.log(`[doctor] withdraw ${job.id} failed: ${err}`);
+      return sendErr(res, 500, err);
+    }
+    const saved = await markWithdrawalResult(job.id, "sent", r);
+    console.log(`[doctor] withdraw ${saved.id} sent`);
+    sendOk(res, { job: saved });
   } catch (e) {
```

นอกจากนี้ ปรับ **public/index.html** และ **public/app.js** ตามข้างต้น (not shown as diff) เพื่อเพิ่ม dropdown และ validate.  

**คำสั่ง PowerShell (ตัวอย่าง):**

- **Restart service (nssm)** (หลัง apply patch):

  ```powershell
  PS> nssm restart mmk1000-web
  ```

- **Backup ฐานข้อมูล** (`withdraw-queue.json`) ก่อน deploy:

  ```powershell
  PS> Copy-Item "C:\Users\ADMIN\MMK1000\data\withdraw-queue.json" -Destination "C:\Users\ADMIN\MMK1000\data\withdraw-queue.json.bak" -Force
  ```

- **Smoke Test - สร้าง→อนุมัติ→ส่ง** (ตัวอย่างไม่ใช้ข้อมูลจริง):

  ```powershell
  $base="http://127.0.0.1:4100"
  $h=@{"x-admin-key"="mmk1000";"Content-Type"="application/json"}

  # กรณี TrueMoney Wallet (P2P)
  $body1=@{
    type="wallet"; amount="1.00";
    dest=@{ wallet_id="0800000001" }; note="test p2p"
  } | ConvertTo-Json -Depth 10
  $r1=Invoke-RestMethod -Method Post -Uri "$base/api/withdraw/create" -Headers $h -Body $body1
  $id1=$r1.job.id
  Invoke-RestMethod -Method Post -Uri "$base/api/withdraw/$id1/approve" -Headers $h
  Invoke-RestMethod -Method Post -Uri "$base/api/withdraw/$id1/send" -Headers $h | ConvertTo-Json

  # กรณี PromptPay (Mock mode)
  $body2=@{
    type="promptpay"; amount="1.00";
    dest=@{ proxy_value="0800000002" }; note="test promptpay"
  } | ConvertTo-Json -Depth 10
  $r2=Invoke-RestMethod -Method Post -Uri "$base/api/withdraw/create" -Headers $h -Body $body2
  $id2=$r2.job.id
  Invoke-RestMethod -Method Post -Uri "$base/api/withdraw/$id2/approve" -Headers $h
  Invoke-RestMethod -Method Post -Uri "$base/api/withdraw/$id2/send" -Headers $h | ConvertTo-Json
  ```

  **สังเกต:** คำตอบควรมี `ok:true` และ `job.status:"sent"` ใน 2 กรณี (promptpay ไม่ต้องส่งจริงทำ mock, wallet ต้องมี error จริงของ TMN ถ้าไม่ใช่ sandbox).

# 6. Test Cases (Unit/Integration/Manual) และ Expected Logs

- **Unit Tests:** ทดสอบฟังก์ชัน `missingTmnFields()` กับค่า cfg ต่างๆ (all fields present/ขาด 1 คอลัมน์) ควรคืน list ที่ถูกต้อง. ทดสอบ `getTmnCfg()` ว่า fallback to `process.env` ถูกต้อง.  
- **Integration Tests:**
  1. **Shield Retry:** Simulate API ตอบกลับ `"message":"shield_id is expired"`. คาดว่า TMNOne.js จะเรียก `getShieldID()` ใหม่และลองส่งอีกครั้ง. ควรสังเกต log `[TMNOne] shield expired, retry ...` (ตาม patch)【53†L883-L891】 และถ้ามี retry สำเร็จควรได้ `ok`.  
  2. **Withdraw Flow Success:** สร้าง job (wallet/promptpay) แล้วผ่าน approve/send ทุกขั้นตอน. คาดว่า log ของ `doctor withdraw ... sent` ปรากฏ (stdout)【22†L311-L319】 และ status ใน `storage` เป็น "sent".  
  3. **Withdraw Flow Failure:** สร้าง job แต่ทำให้ TMN transfer ล้มเหลว (เช่น ใส่ wallet_id ผิด) คาดว่า `/withdraw/:id/send` ต้อง mark เป็น failed และตอบ error เช่น `tmn_cfg_missing` หรือ error message (ตาม patch). ดูใน log ว่ามีข้อความ `[doctor] withdraw {id} failed: ...`. ตรวจสอบว่า job status เป็น "failed".  
  4. **Validation Errors:** พิมพ์ promptpay 15 หลักใน approve คาด error 400 “ewallet_not_supported”【22†L293-L302】. ใส่ type="p2p" ใน create ควรทำเป็น wallet (ถ้าเพิ่ม alias) หรือบล็อค ถ้าต้องเพิ่ม.  
  5. **UI Validation (Manual):** กรอก form แบบผิด (e.g. เบอร์ 9 หลัก, ปล่อยว่าง) ควร alert/ไม่ส่ง API.  
- **Expected Logs:**   
  - `"[dotenv@17.2.4] injecting env ..."` จาก startup (เช็คว่า env ถูกโหลด)【53†L898-L900】  
  - บรรทัด debug ใหม่ `[TMNOne] shield expired ...` (หาก debug mode on)  
  - `[doctor] withdraw {id} failed: ...` เมื่อโอนล้มเหลว (หลัง patch)  
  - `[doctor] withdraw {id} sent` เมื่อสำเร็จ  
  - **(ของเดิม)** `"tmn_cfg_missing"` log ของกรณี missing cfg.  
- **Mermaid Timeline:** แสดง flow **Shield Retry**:
  
  ```mermaid
  sequenceDiagram
    participant U as User/Admin
    participant S as Server (/withdraw/send)
    participant T as TMNOne.Class
    participant A as TMN API

    U->>S: POST /withdraw/:id/send
    S->>T: tmnSendTransfer(job)
    T->>A: wallet_connect (transferP2P)
    A-->>T: { message: "shield_id is expired", ... }
    T->>T: console.log("[TMNOne] shield expired, retry...")
    T->>A: getShieldID() -> A (new shield)
    A-->>T: shield_id
    T->>A: wallet_connect (retry transferP2P)
    A-->>T: { ok:true, report_id:"..." }
    T-->>S: r={ok:true,...}
    S->>Server: markWithdrawalResult(...,"sent")
    S-->>U: 200 OK (job sent)
  ```

# 7. Rollback Plan & Monitoring

- **Rollback Plan:** หากเกิดปัญหา สามารถคืนค่าจาก backup ด้วยการ stop service, replaceไฟล์ด้วยเวอร์ชันเดิม และ restart. แนะนำสำรอง `withdraw-queue.json` และโค้ดเดิมก่อน deploy.  
- **Monitor หลัง Deploy:**  
  - ตรวจสอบ log อัตโนมัติ (grep) เช่น: `web.out.log` หา keywords “withdraw * sent/failed”, “tmn_cfg_missing” เพื่อดูภาวะระบบ  
  - มี *health endpoint* หรือ response จาก `/dashboard` ที่คงเป็นปกติ (เช่นลอง /dashboard เฉพาะ balance)  
  - Alert condition: หากมีจำนวน `tmn_cfg_missing` เกิน threshold หรือ error 5xx เกินปกติ, หรือ job ที่ถูก markเป็น failed เพิ่มขึ้นผิดปกติ.  
  - เจาะจง log retry: ถ้าพบ `shield expired, retry` บ่อยมาก อาจชี้ว่ากระแสข้อมูล token/shield ผิดพลาด หรือ TMN API เปลี่ยน behavior.

# 8. Executive Summary & ขั้นตอน Deploy

**สรุปการเปลี่ยนแปลงสำคัญ:** เพิ่มการ retry shield ใน TMNOne (แก้ปัญหาข้อผิดพลาด *“shield_id is expired”*) และปรับ server.mjs ให้ mark job เป็น failed เมื่อโอนล้มเหลว แทน mark sent เฉย ๆ【47†L181-L189】【22†L293-L302】. นอกจากนี้เพิ่มตัวเลือก UI/Type เพื่อให้แยก *Wallet (P2P)* / *PromptPay* / *Bank* ชัดเจน (ป้องกันกรอกผิด) และเพิ่ม alias `p2p`. หลังแก้แล้ว TMN config จะถูกดึงจาก env (`process.env`) หากไม่ได้ส่ง header【7†L85-L94】. ความเสี่ยงที่เหลือ: ต้องแน่ใจว่าไม่มีข้อมูลลับรั่วใน log และตรวจสอบการใช้งานหลัง deploy (เช่น token/session ใช้ถูกต้อง, ไม่มี race ข้อมูล). 

**ขั้นตอน Deploy:** 
1. **Backup:** stop service, สำรอง `withdraw-queue.json` และไฟล์โปรเจกต์ก่อนแก้ไข (เช่น `git diff > backup.patch`)  
2. **Apply Patch:** คัดลอกโค้ด diff ข้างต้นไปแก้ในโค้ด `TMNOne.js`, `server.mjs`, `index.html`, `app.js`  
3. **Restart Service:** รัน `nssm restart mmk1000-web`  
4. **Smoke Tests:** รันคำสั่งทดสอบ create→approve→send (ทั้ง wallet/promptpay) ตรวจสอบผลลัพธ์ครบถ้วน  
5. **ตรวจสอบ Logs:** ดู log ว่ามีข้อความ error เช่น “failed” หรือ “shield expired” เพียงเล็กน้อย (คาดว่าปกติอาจเกิด **shield retry** บ้าง) และคีย์ลับไม่ปรากฏ  
6. **เปิดใช้งานระบบเต็ม:** หลังผ่าน Smoke Tests, ส่งมอบให้ใช้งานจริง, พร้อม monitor ตามข้อ 7.  

อ้างอิงข้อมูลหลักจากเอกสาร TMNOne【1†L159-L167】【47†L181-L189】, PromptPay QR TLV spec (BOT)【40†L752-L760】【40†L760-L763】 และ dotenv README【53†L883-L891】【53†L898-L900】【53†L919-L927】.