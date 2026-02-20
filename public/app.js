/* MMK1000 Panel client */

const ADMIN_KEY_KEY = "mmk1000_admin_key";
const REMEMBER_KEY  = "mmk1000_admin_remember";
const TMN_CFG_KEY   = "mmk1000_tmn_cfg";
const DEBUG_KEY     = "mmk1000_debug";
const LAST_TAB_KEY  = "mmk1000_last_tab";
const TMN_MODE_KEY  = "mmk1000_tmn_mode";
const LANG_KEY      = "mmk1000_lang";
const WITHDRAW_STATE_KEY = "mmk1000_withdraw_state";

let DEBUG = (localStorage.getItem(DEBUG_KEY) === "1");
let LAST_QUEUE_MAP = new Map(); // id -> item
let LAST_TMN_MODE = (localStorage.getItem(TMN_MODE_KEY) || "").toLowerCase();
let LANG = (localStorage.getItem(LANG_KEY) || "th").toLowerCase();

const $ = (id) => document.getElementById(id);

const I18N = {
  th: {
    login_title: "เข้าสู่ระบบ",
    login_desc: "ใส่รหัสผ่านผู้ดูแล (ADMIN KEY)",
    login_placeholder: "รหัสผ่าน",
    login_submit: "เข้าสู่ระบบ",
    login_failed: "เข้าสู่ระบบไม่สำเร็จ",
    logout: "ออกจากระบบ",
    lang_th: "ไทย",
    lang_en: "EN",
    safe_mode: "ใช้คีย์โหมด REAL เฉพาะหลัง Cloudflare Access เท่านั้น",
    loading: "กำลังโหลด...",
    missing_admin_key: "ไม่พบ ADMIN KEY",
    admin_invalid: "ADMIN KEY ไม่ถูกต้อง (ใช้ตัวอักษร/ตัวเลข/._:- เท่านั้น และห้ามมี /)",
    admin_saved: "บันทึก ADMIN KEY แล้ว (แนะนำกดตรวจสิทธิ์อีกครั้ง)",
    health_error: "เช็ก health ไม่สำเร็จ",
    debug_on: "DEBUG เปิดแล้ว",
    debug_off: "DEBUG ปิดแล้ว",
    auth_checking: "กำลังตรวจสิทธิ์...",
    auth_ok: "ตรวจสิทธิ์ผ่าน ✅",
    auth_fail: "ตรวจสิทธิ์ไม่ผ่าน",
    auth_error: "ตรวจสิทธิ์ผิดพลาด",
    tmn_saved: "บันทึก TMN สำเร็จ ✅",
    tmn_cleared: "ล้าง TMN แล้ว",
    tmn_incomplete: "TMN ยังไม่ครบ: ต้องมี KEYID, MSISDN, LOGIN_TOKEN, TMN_ID, PIN6",
    tmn_paste_label: "Paste block (KEY=VALUE หลายบรรทัด)",
    tmn_apply_paste: "Apply Paste",
    tmn_export_json: "Export config (.json)",
    tmn_import_json: "Import config (.json)",
    tmn_paste_empty: "กรุณาวาง KEY=VALUE ก่อน",
    tmn_paste_no_keys: "ไม่พบคีย์ TMN ที่รองรับในข้อความที่วาง",
    tmn_paste_applied: "นำค่า Paste เข้า TMN แล้ว ✅",
    tmn_exported: "Export TMN config แล้ว ✅",
    tmn_export_failed: "Export TMN config ไม่สำเร็จ",
    tmn_imported: "Import TMN config แล้ว ✅",
    tmn_import_failed: "Import TMN config ไม่สำเร็จ",
    tmn_test_balance_btn: "ทดสอบโหมดจริง (Balance)",
    tmn_test_loading: "กำลังทดสอบโหมดจริง...",
    tmn_test_pass: "PASS: โหมดจริงพร้อมใช้งาน",
    tmn_test_fail: "FAIL: ทดสอบโหมดจริงไม่ผ่าน",
    tmn_test_relogin: "FAIL: ต้องทำ login/face ใหม่",
    tmn_test_relogin_hint: "ต้องทำ login/face ใหม่ แล้วลองอีกครั้ง",
    choose_date: "กรุณาเลือกวันที่เริ่ม/สิ้นสุด",
    dashboard_loading: "กำลังโหลดแดชบอร์ด...",
    dashboard_ok: "แดชบอร์ดโหลดสำเร็จ ✅",
    dashboard_fail: "โหลดแดชบอร์ดไม่สำเร็จ",
    dashboard_error: "แดชบอร์ดผิดพลาด",
    creating_queue: "กำลังสร้างคิว...",
    create_ok: "เพิ่มคิวสำเร็จ ✅",
    create_fail: "สร้างคิวไม่สำเร็จ",
    approve_action: "อนุมัติ",
    approve_loading: "กำลังอนุมัติ...",
    approve_ok: "อนุมัติสำเร็จ ✅",
    approve_fail: "อนุมัติไม่สำเร็จ",
    send_action: "ส่งโอน",
    send_loading: "กำลังส่งโอน...",
    send_ok: "ส่งโอนสำเร็จ ✅",
    send_fail: "ส่งโอนไม่สำเร็จ",
    queue_loading: "กำลังโหลดคิว...",
    queue_ok: "คิวพร้อมใช้งาน ✅",
    queue_fail: "โหลดคิวไม่สำเร็จ",
    decode_loading: "กำลังถอดรหัส QR...",
    decode_fail: "ถอดรหัสไม่สำเร็จ",
    decode_error: "ถอดรหัสผิดพลาด",
    qr_choose_file: "เลือกไฟล์รูป QR ก่อน",
    login_required: "กรุณาเข้าสู่ระบบก่อนใช้งาน",
    real_prompt: "REAL MODE: พิมพ์ SEND เพื่อยืนยัน",
    transfer_cancelled: "ยกเลิกการโอน (ยืนยันไม่ถูกต้อง)",
    proxy_missing: "ถอดรหัสได้ แต่ไม่พบ proxy_value",
    fill_proxy_ok: "เติม proxy_value แล้ว ✅ กรอกจำนวนต่อได้เลย",
    ewallet_warn: "⚠️ proxy_value 15 หลัก (E-Wallet ID) — แนะนำระวังโหมด real",
    withdraw_hint_bank: "Tip: กด Enter ที่ bank_ac จะไปโฟกัส Amount",
    withdraw_hint_promptpay: "ถ้า proxy_value 15 หลัก (E-Wallet ID) แนะนำระวังโหมด real",
    withdraw_hint_p2p: "P2P: ใส่เบอร์ทรู 10 หลัก (ห้ามตรงกับเบอร์ต้นทาง)",
    amount_invalid: "จำนวนเงินไม่ถูกต้อง",
    fill_bank_required: "กรอก bank_code / bank_ac ให้ครบ",
    fill_proxy_required: "กรอก proxy_value ให้ครบ",
    fill_wallet_required: "กรอก wallet_id ให้ครบ",
    confirm_footer: "กดยืนยันเพื่อทำรายการ",
    tab_dashboard: "แดชบอร์ด",
    tab_withdraw: "ถอนเงิน",
    tab_qr: "สแกน QR",
    tmn_panel_title: "ตั้งค่า TMN โหมดจริง",
    save: "บันทึก",
    auth_check: "ตรวจสิทธิ์",
    health_btn: "ตรวจ /api/health",
    refresh: "รีเฟรช",
    refresh_queue: "รีเฟรชคิว",
    add_queue: "เพิ่มเข้าคิว",
    decode_btn: "ถอดรหัส",
    approve_btn: "อนุมัติ",
    send_btn: "ส่งโอน",
    status: "สถานะ",
    type: "ประเภท",
    amount: "จำนวน",
    dest: "ปลายทาง",
    action: "การทำงาน",
    debug_on_label: "DEBUG: ON",
    debug_off_label: "DEBUG: OFF",
    queue_items: "รายการ",
  },
  en: {
    login_title: "Login",
    login_desc: "Enter admin password (ADMIN KEY)",
    login_placeholder: "Password",
    login_submit: "Login",
    login_failed: "Login failed",
    logout: "Logout",
    lang_th: "TH",
    lang_en: "EN",
    safe_mode: "Use REAL keys only behind Cloudflare Access",
    loading: "Loading...",
    missing_admin_key: "Missing ADMIN KEY",
    admin_invalid: "Invalid ADMIN KEY (letters/numbers/._:- only, no /)",
    admin_saved: "ADMIN KEY saved (recommended: run Auth Check)",
    health_error: "Health check error",
    debug_on: "DEBUG enabled",
    debug_off: "DEBUG disabled",
    auth_checking: "Auth checking...",
    auth_ok: "Auth OK ✅",
    auth_fail: "Auth failed",
    auth_error: "Auth error",
    tmn_saved: "TMN saved ✅",
    tmn_cleared: "TMN cleared",
    tmn_incomplete: "TMN incomplete: KEYID, MSISDN, LOGIN_TOKEN, TMN_ID, PIN6 required",
    tmn_paste_label: "Paste block (multi-line KEY=VALUE)",
    tmn_apply_paste: "Apply Paste",
    tmn_export_json: "Export config (.json)",
    tmn_import_json: "Import config (.json)",
    tmn_paste_empty: "Please paste KEY=VALUE first",
    tmn_paste_no_keys: "No supported TMN keys found in pasted text",
    tmn_paste_applied: "Pasted TMN values applied ✅",
    tmn_exported: "TMN config exported ✅",
    tmn_export_failed: "TMN config export failed",
    tmn_imported: "TMN config imported ✅",
    tmn_import_failed: "TMN config import failed",
    tmn_test_balance_btn: "Test Real Mode (Balance)",
    tmn_test_loading: "Testing real mode...",
    tmn_test_pass: "PASS: real mode is ready",
    tmn_test_fail: "FAIL: real mode test failed",
    tmn_test_relogin: "FAIL: login/face is required",
    tmn_test_relogin_hint: "Do login/face again, then retry",
    choose_date: "Please select start/end date",
    dashboard_loading: "Loading dashboard...",
    dashboard_ok: "Dashboard loaded ✅",
    dashboard_fail: "Dashboard failed",
    dashboard_error: "Dashboard error",
    creating_queue: "Creating queue...",
    create_ok: "Queue added ✅",
    create_fail: "Create failed",
    approve_action: "Approve",
    approve_loading: "Approving...",
    approve_ok: "Approve success ✅",
    approve_fail: "Approve failed",
    send_action: "Send",
    send_loading: "Sending...",
    send_ok: "Send success ✅",
    send_fail: "Send failed",
    queue_loading: "Loading queue...",
    queue_ok: "Queue ready ✅",
    queue_fail: "Queue failed",
    decode_loading: "Decoding QR...",
    decode_fail: "Decode failed",
    decode_error: "Decode error",
    qr_choose_file: "Please choose a QR image",
    login_required: "Please login first",
    real_prompt: "REAL MODE: type SEND to confirm",
    transfer_cancelled: "Transfer cancelled (invalid confirmation)",
    proxy_missing: "Decoded, but proxy_value not found",
    fill_proxy_ok: "proxy_value filled ✅ please input amount",
    ewallet_warn: "⚠️ proxy_value 15 digits (E-Wallet ID) — caution in real mode",
    withdraw_hint_bank: "Tip: press Enter in bank_ac to focus Amount",
    withdraw_hint_promptpay: "If proxy_value has 15 digits (E-Wallet ID), be careful in real mode",
    withdraw_hint_p2p: "P2P: enter 10-digit TrueMoney phone (must differ from source)",
    amount_invalid: "Invalid amount",
    fill_bank_required: "Please fill bank_code / bank_ac",
    fill_proxy_required: "Please fill proxy_value",
    fill_wallet_required: "Please fill wallet_id",
    confirm_footer: "Press confirm to proceed",
    tab_dashboard: "Dashboard",
    tab_withdraw: "Withdraw",
    tab_qr: "QR",
    tmn_panel_title: "TMN Real Config",
    save: "Save",
    auth_check: "Auth Check",
    health_btn: "Ping /api/health",
    refresh: "Refresh",
    refresh_queue: "Refresh Queue",
    add_queue: "Add Queue",
    decode_btn: "Decode",
    approve_btn: "Approve",
    send_btn: "Send",
    status: "Status",
    type: "Type",
    amount: "Amount",
    dest: "Destination",
    action: "Actions",
    debug_on_label: "DEBUG: ON",
    debug_off_label: "DEBUG: OFF",
    queue_items: "items",
  }
};

function t(key) {
  return I18N[LANG]?.[key] || I18N.th[key] || key;
}

function setBanner(type, msg) {
  const b = $("statusBanner");
  if (!b) return;
  b.className = type;
  b.textContent = msg || "";
  b.style.display = msg ? "block" : "none";
}

function ensureSafeModeBanner() {
  if (location.hostname === "localhost") return;
  if (document.getElementById("safeModeBanner")) return;
  const banner = document.createElement("div");
  banner.id = "safeModeBanner";
  banner.textContent = t("safe_mode");
  banner.style.cssText = [
    "margin:10px 0 12px",
    "padding:10px 12px",
    "border:1px solid #b42318",
    "background:#ffe4e4",
    "color:#8a0000",
    "font-weight:600",
    "border-radius:8px"
  ].join(";");
  const h1 = document.querySelector("h1");
  if (h1) h1.insertAdjacentElement("afterend", banner);
  else document.body.insertBefore(banner, document.body.firstChild);
}

function setTmnMode(mode) {
  const m = (mode || "").toString().toLowerCase();
  if (!m) return;
  LAST_TMN_MODE = m;
  localStorage.setItem(TMN_MODE_KEY, m);
}

function isRealMode() {
  return ["real","live","production","prod"].includes(LAST_TMN_MODE);
}

function setButtonLoading(btn, isLoading, loadingText) {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.prevText) btn.dataset.prevText = btn.textContent;
    btn.textContent = loadingText || t("loading");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
  } else {
    if (btn.dataset.prevText) btn.textContent = btn.dataset.prevText;
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    delete btn.dataset.prevText;
  }
}

function sanitizeHeaderValue(v) {
  return (v || "").toString().replace(/[\r\n\0]/g, "").trim();
}

function headers(extra = {}) {
  const h = new Headers();
  const ak = getAdminKey();
  if (!ak) {
    setBanner("error", t("missing_admin_key"));
    throw new Error("Missing ADMIN KEY");
  }
  h.set("x-admin-key", sanitizeHeaderValue(ak));

  // TMN config -> headers (สำหรับ real mode)
  const cfg = loadTmnCfg();
  if (cfg && typeof cfg === "object") {
    const map = {
      tmnone_keyid: "x-tmn-keyid",
      tmn_msisdn: "x-tmn-msisdn",
      tmn_login_token: "x-tmn-login-token",
      tmn_tmn_id: "x-tmn-tmn-id",
      tmn_device_id: "x-tmn-device-id",
      tmn_pin6: "x-tmn-pin6",
      proxy_ip: "x-proxy-ip",
      proxy_user: "x-proxy-username",
      proxy_pass: "x-proxy-password",
    };
    for (const [k, headerName] of Object.entries(map)) {
      if (cfg[k]) h.set(headerName, sanitizeHeaderValue(cfg[k]));
    }
  }

  for (const [k, v] of Object.entries(extra || {})) {
    if (v !== undefined && v !== null && v !== "") h.set(k, sanitizeHeaderValue(v));
  }
  return h;
}

function resolveFetchUrl(input) {
  if (typeof input === "string") return input;
  if (input && typeof input.url === "string") return input.url;
  return "";
}

function isApiRequest(input) {
  const raw = resolveFetchUrl(input);
  if (!raw) return false;
  if (raw.startsWith("/api/")) return true;
  try {
    const u = new URL(raw, location.origin);
    return u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function formatApiErrorMessage(err) {
  const base = String(err?.message || err || "error");
  const body = String(err?.bodyText || "").trim();
  return body ? `${base} | ${body}` : base;
}

async function fetchApi(input, init) {
  const res = await fetch(input, init);
  if (!isApiRequest(input) || res.ok) return res;

  let bodyText = "";
  try {
    bodyText = String(await res.clone().text() || "").trim();
  } catch {}

  const statusText = String(res.statusText || "").trim();
  const statusLine = `HTTP ${res.status} ${statusText}`.trim();
  const full = bodyText ? `${statusLine} | ${bodyText}` : statusLine;
  const url = resolveFetchUrl(input);
  console.error(`[api] ${url} -> ${full}`);
  setBanner("error", full);
  if ($("debugLogLine")) $("debugLogLine").textContent = `Last action: API fail ${full}`;

  const err = new Error(statusLine);
  err.status = res.status;
  err.statusText = res.statusText;
  err.bodyText = bodyText;
  err.url = url;
  throw err;
}

function isValidAdminKey(v) {
  const s = (v || "").trim();
  return s.length >= 1;
}

function setAdminFieldState(state) {
  const el = $("adminKey");
  if (!el) return;
  el.classList.remove("field-ok", "field-bad");
  if (state === "ok") el.classList.add("field-ok");
  if (state === "bad") el.classList.add("field-bad");
}

function getAppJsVersion() {
  const el = document.querySelector('script[src*="app.js"]');
  const src = el?.getAttribute("src") || "";
  const i = src.indexOf("v=");
  if (i < 0) return "-";
  const v = src.slice(i + 2).split("&")[0];
  return v || "-";
}

function isDevHostName(hostname) {
  const h = (hostname || "").toLowerCase().trim();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function resolveDevHost() {
  if (typeof window.__MMK_DEV_HOST__ === "boolean") return window.__MMK_DEV_HOST__;
  return isDevHostName(location.hostname);
}

function resolveDisableSw(isDevHost) {
  if (isDevHost) return true;
  if (typeof window.__MMK_DISABLE_SW__ === "boolean") return window.__MMK_DISABLE_SW__;
  return false;
}

async function unregisterSwAndClearCache() {
  let swCount = 0;
  let cacheCount = 0;
  if ("serviceWorker" in navigator) {
    const rs = await navigator.serviceWorker.getRegistrations();
    swCount = rs.length;
    await Promise.all(rs.map((r) => r.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    cacheCount = keys.length;
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  return { swCount, cacheCount };
}

function setupDevSwResetButton(isDevHost) {
  const btn = $("devSwResetBtn");
  if (!btn) return;
  if (!isDevHost) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const r = await unregisterSwAndClearCache();
      setBanner("ok", `Dev reset done: SW ${r.swCount}, cache ${r.cacheCount}`);
    } catch (e) {
      setBanner("error", `Dev reset failed: ${e?.message || e}`);
    } finally {
      btn.disabled = false;
    }
  });
}

function buildDebugBox(isDevHost) {
  const card = $("adminKey")?.closest(".card");
  if (!card || $("debugBox")) return;

  const box = document.createElement("div");
  box.id = "debugBox";
  box.style.cssText = [
    "margin-top:6px",
    "font-size:12px",
    "background:#f5f7ff",
    "padding:8px",
    "border-radius:6px",
    "border:1px solid #dce3ff",
    "display:flex",
    "flex-direction:column",
    "gap:4px"
  ].join(";");

  const originLine = document.createElement("div");
  originLine.textContent = `Origin: ${location.origin}`;

  const verLine = document.createElement("div");
  verLine.textContent = `Loaded app.js version: ${getAppJsVersion()}`;

  const keyLine = document.createElement("div");
  keyLine.id = "debugAdminKeyLine";
  keyLine.textContent = "adminKey exists?: (loading)";

  const logLine = document.createElement("div");
  logLine.id = "debugLogLine";
  logLine.textContent = "Last action: -";

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex; gap:6px; flex-wrap:wrap;";

  const btnClear = document.createElement("button");
  btnClear.type = "button";
  btnClear.textContent = "Clear Local Keys";
  btnClear.style.cssText = "padding:4px 8px; font-size:12px;";
  btnClear.addEventListener("click", () => {
    clearAll();
    localStorage.removeItem(TMN_CFG_KEY);
    location.reload();
  });

  const btnSw = document.createElement("button");
  btnSw.type = "button";
  btnSw.textContent = "Unregister SW (DEV)";
  btnSw.style.cssText = "padding:4px 8px; font-size:12px;";
  btnSw.addEventListener("click", () => {
    if (!("serviceWorker" in navigator)) {
      setBanner("error", "SW not supported");
      return;
    }
    navigator.serviceWorker.getRegistrations()
      .then(rs => Promise.all(rs.map(r => r.unregister())))
      .then(() => location.reload())
      .catch(() => setBanner("error", "Unregister failed"));
  });

  const btnCache = document.createElement("button");
  btnCache.type = "button";
  btnCache.textContent = "Clear Cache Storage";
  btnCache.style.cssText = "padding:4px 8px; font-size:12px;";
  btnCache.addEventListener("click", async () => {
    if (!("caches" in window)) {
      setBanner("error", "Cache API not available");
      return;
    }
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
      location.reload();
    } catch {
      setBanner("error", "Clear cache failed");
    }
  });

  const btnHardReset = document.createElement("button");
  btnHardReset.type = "button";
  btnHardReset.textContent = "Hard Reset (Dev)";
  btnHardReset.style.cssText = "padding:4px 8px; font-size:12px;";
  btnHardReset.addEventListener("click", async () => {
    const logs = [];
    let swBefore = 0;
    let swAfter = 0;
    let cacheBefore = [];
    let cacheAfter = [];
    let lsBefore = [];
    let lsAfter = [];
    let ssBefore = [];
    let ssAfter = [];
    if ("serviceWorker" in navigator) {
      try {
        const rs = await navigator.serviceWorker.getRegistrations();
        swBefore = rs.length;
        await Promise.all(rs.map(r => r.unregister()));
        const rs2 = await navigator.serviceWorker.getRegistrations();
        swAfter = rs2.length;
        logs.push(`serviceWorker: ${swBefore} -> ${swAfter}`);
      } catch {
        logs.push("serviceWorker: failed");
      }
    }
    if ("caches" in window) {
      try {
        cacheBefore = await caches.keys();
        await Promise.all(cacheBefore.map(k => caches.delete(k)));
        cacheAfter = await caches.keys();
        logs.push(`caches: [${cacheBefore.join(", ")}] -> [${cacheAfter.join(", ")}]`);
      } catch {
        logs.push("caches: failed");
      }
    }
    try {
      lsBefore = Object.keys(localStorage || {});
      ssBefore = Object.keys(sessionStorage || {});
      localStorage.clear();
      sessionStorage.clear();
      lsAfter = Object.keys(localStorage || {});
      ssAfter = Object.keys(sessionStorage || {});
      logs.push(`localStorage keys: [${lsBefore.join(", ")}] -> [${lsAfter.join(", ")}]`);
      logs.push(`sessionStorage keys: [${ssBefore.join(", ")}] -> [${ssAfter.join(", ")}]`);
    } catch {
      logs.push("storage: failed");
    }
    if ($("debugLogLine")) $("debugLogLine").textContent = "Last action: " + logs.join(", ");
    refreshDebugBox();
  });

  btnRow.appendChild(btnClear);
  btnRow.appendChild(btnSw);
  btnRow.appendChild(btnCache);
  btnRow.appendChild(btnHardReset);

  box.appendChild(originLine);
  box.appendChild(verLine);
  box.appendChild(keyLine);
  box.appendChild(logLine);
  box.appendChild(btnRow);

  if (isDevHost) {
    const warn = document.createElement("div");
    warn.textContent = "ห้ามสลับ localhost กับ 127.0.0.1 เพราะ localStorage คนละชุด";
    warn.style.cssText = "color:#b42318; font-weight:600;";
    box.appendChild(warn);
  }

  card.appendChild(box);
  refreshDebugBox();
}

function refreshDebugBox() {
  const line = $("debugAdminKeyLine");
  const k = localStorage.getItem(ADMIN_KEY_KEY);
  if (line) line.textContent = `adminKey exists?: ${k ? "true" : "false"}`;
  refreshAdminKeyStorageInfo();
}

function refreshAdminKeyStorageInfo() {
  const line = $("adminKeyStorageInfo");
  if (!line) return;
  const hasStorageKey = !!(localStorage.getItem(ADMIN_KEY_KEY) || "").trim();
  line.textContent = `Origin: ${location.origin} | key-in-storage: ${hasStorageKey ? "true" : "false"}`;
}

function setLang(nextLang) {
  LANG = nextLang === "en" ? "en" : "th";
  localStorage.setItem(LANG_KEY, LANG);
  applyI18nStatic();
  renderWithdrawFields();
  if ($("debugBtn")) {
    $("debugBtn").textContent = DEBUG ? t("debug_on_label") : t("debug_off_label");
  }
}

function mountTopControls() {
  if (document.getElementById("topControls")) return;
  const h1 = document.querySelector("h1");
  if (!h1) return;
  const box = document.createElement("div");
  box.id = "topControls";
  box.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0 10px;";
  box.innerHTML = `
    <button id="langThBtn" type="button">${t("lang_th")}</button>
    <button id="langEnBtn" type="button">${t("lang_en")}</button>
    <button id="logoutBtn" type="button">${t("logout")}</button>
  `;
  h1.insertAdjacentElement("afterend", box);
  $("langThBtn")?.addEventListener("click", () => setLang("th"));
  $("langEnBtn")?.addEventListener("click", () => setLang("en"));
  $("logoutBtn")?.addEventListener("click", logout);
}

function applyI18nStatic() {
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };
  setText('button[data-tab="dashboard"]', t("tab_dashboard"));
  setText('button[data-tab="withdraw"]', t("tab_withdraw"));
  setText('button[data-tab="qr"]', t("tab_qr"));
  setText("#tmnToggleBtn", t("tmn_panel_title"));
  setText("#tmnPanel h3", t("tmn_panel_title"));
  setText('button[onclick="saveAdminKey()"]', t("save"));
  setText('button[onclick="authCheck()"]', t("auth_check"));
  setText('button[onclick="pingHealth()"]', t("health_btn"));
  setText('button[onclick="loadDashboard()"]', t("refresh"));
  setText('button[onclick="createWithdraw()"]', t("add_queue"));
  setText('button[onclick="loadQueue()"]', t("refresh_queue"));
  setText('button[onclick="decodeQrIntoWithdraw(this)"]', t("decode_btn"));
  setText("#tmnPasteLabel", t("tmn_paste_label"));
  setText("#tmn_apply_paste", t("tmn_apply_paste"));
  setText("#tmn_export_json", t("tmn_export_json"));
  setText("#tmn_import_json", t("tmn_import_json"));
  setText("#tmn_test_balance", t("tmn_test_balance_btn"));
  setText("#tab-dashboard h3", `1) ${t("tab_dashboard")}`);
  setText("#tab-withdraw h3", `2) ${t("tab_withdraw")} ${LANG === "en" ? "(queue + approve)" : "(คิว + อนุมัติ)"}`);
  setText('#qTable thead th:nth-child(1)', t("status"));
  setText('#qTable thead th:nth-child(2)', t("type"));
  setText('#qTable thead th:nth-child(3)', t("amount"));
  setText('#qTable thead th:nth-child(4)', t("dest"));
  setText('#qTable thead th:nth-child(5)', t("action"));
  if ($("logoutBtn")) $("logoutBtn").textContent = t("logout");
  if ($("langThBtn")) $("langThBtn").textContent = t("lang_th");
  if ($("langEnBtn")) $("langEnBtn").textContent = t("lang_en");
}

async function verifyAdminKey(pwd) {
  pwd = (pwd || "").trim();
  if (!pwd) return false;
  try {
    const r = await fetchApi("/api/withdraw/queue", {
      method: "GET",
      headers: { "x-admin-key": pwd }
    });
    console.log("[login] status", r.status);
    const j = await r.json().catch(() => null);
    return !!(r.ok && j?.ok);
  } catch {
    return false;
  }
}

async function showLoginModal() {
  if (document.getElementById("loginModal")) return true;
  const overlay = document.createElement("div");
  overlay.id = "loginModal";
  overlay.className = "login-overlay";
  overlay.innerHTML = `
    <div class="login-box">
      <h3 style="margin:0 0 8px;">${t("login_title")}</h3>
      <div style="margin:0 0 10px;color:#555;">${t("login_desc")}</div>
      <div class="login-hint">กรุณาวาง (paste) ADMIN KEY ให้ครบ</div>
      <div class="login-pass-wrap">
        <input id="loginPassword" type="password" placeholder="${t("login_placeholder")}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;" />
        <button id="loginTogglePwdBtn" type="button" class="login-toggle-btn">Show</button>
      </div>
      <label class="login-remember-row">
        <input id="loginRememberAdmin" type="checkbox"> จำคีย์ในเครื่องนี้
      </label>
      <button id="loginPasteFromAdminBtn" type="button" class="login-paste-btn">วางคีย์จากช่อง ADMIN KEY ด้านหลัง</button>
      <div id="loginError" style="color:#b42318;min-height:20px;margin-top:8px;"></div>
      <button id="loginSubmitBtn" type="button" style="margin-top:6px;width:100%;">${t("login_submit")}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = $("loginPassword");
  const err = $("loginError");
  const submit = $("loginSubmitBtn");
  const togglePwdBtn = $("loginTogglePwdBtn");
  const loginRemember = $("loginRememberAdmin");
  const pasteFromAdminBtn = $("loginPasteFromAdminBtn");
  if (!$("adminKey") && pasteFromAdminBtn) pasteFromAdminBtn.style.display = "none";
  if (input) input.value = getAdminKey();
  if (loginRemember) loginRemember.checked = localStorage.getItem(REMEMBER_KEY) === "1";

  const doLogin = async () => {
    const pwd = (input?.value || "").trim();
    if (!pwd) {
      if (err) err.textContent = t("missing_admin_key");
      return false;
    }
    setButtonLoading(submit, true, t("login_submit"));
    const ok = await verifyAdminKey(pwd);
    setButtonLoading(submit, false);
    if (!ok) {
      if (err) err.textContent = t("login_failed");
      return false;
    }
    const rememberThisDevice = !!loginRemember?.checked;
    if (!saveAdminKey(pwd, rememberThisDevice)) {
      if (err) err.textContent = t("admin_invalid");
      return false;
    }
    overlay.remove();
    return true;
  };

  submit?.addEventListener("click", doLogin);
  togglePwdBtn?.addEventListener("click", () => {
    if (!input) return;
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    togglePwdBtn.textContent = willShow ? "Hide" : "Show";
    input.focus();
  });
  pasteFromAdminBtn?.addEventListener("click", () => {
    const fromAdminField = ($("adminKey")?.value || "").trim();
    if (!fromAdminField) {
      if (err) err.textContent = "ไม่พบค่าในช่อง ADMIN KEY ด้านหลัง";
      return;
    }
    if (input) input.value = fromAdminField;
    if (err) err.textContent = "";
    input?.focus();
  });
  input?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") await doLogin();
  });
  input?.focus();
  return false;
}

function maskAdminKeyForLog(value) {
  const s = (value || "").toString().trim();
  return (s ? s.slice(0, 6) : "") + "...";
}

function getRememberChoice() {
  const remember = $("rememberAdmin");
  if (remember) return !!remember.checked;
  return localStorage.getItem(REMEMBER_KEY) === "1";
}

function setRememberChoice(v) {
  if ($("rememberAdmin")) $("rememberAdmin").checked = !!v;
  if (v) localStorage.setItem(REMEMBER_KEY, "1");
  else localStorage.removeItem(REMEMBER_KEY);
}

function clearAll() {
  sessionStorage.removeItem(ADMIN_KEY_KEY);
  localStorage.removeItem(ADMIN_KEY_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  if ($("adminKey")) $("adminKey").value = "";
  if ($("rememberAdmin")) $("rememberAdmin").checked = false;
  setAdminFieldState("");
  refreshDebugBox();
}

function logout() {
  clearAll();
  location.reload();
}

function getAdminKey() {
  const fromInput = ($("adminKey")?.value || "").trim();
  if (fromInput) return fromInput;
  return (localStorage.getItem(ADMIN_KEY_KEY) || "").trim();
}

function restoreAdminKey() {
  const saved = (localStorage.getItem(ADMIN_KEY_KEY) || "").trim();
  const remembered = (localStorage.getItem(REMEMBER_KEY) === "1");
  if ($("adminKey")) $("adminKey").value = saved;
  setRememberChoice(remembered);
  if (saved) setAdminFieldState("ok");
  else setAdminFieldState("");
  refreshDebugBox();
}

function saveAdminKey(value, remember) {
  const hasValueArg = arguments.length >= 1;
  const hasRememberArg = arguments.length >= 2;
  const v = ((hasValueArg ? value : $("adminKey")?.value) || "").trim();

  if (!v) {
    refreshDebugBox();
    return false;
  }

  if (!isValidAdminKey(v)) {
    setAdminFieldState("bad");
    if (!hasValueArg) setBanner("error", t("admin_invalid"));
    refreshDebugBox();
    return false;
  }

  localStorage.setItem(ADMIN_KEY_KEY, v);
  const rememberChoice = hasRememberArg ? !!remember : getRememberChoice();
  setRememberChoice(rememberChoice);
  if ($("adminKey")) $("adminKey").value = v;
  setAdminFieldState("ok");
  if (!hasValueArg) setBanner("ok", t("admin_saved"));
  refreshDebugBox();
  return true;
}

function bindAdminKeyPersistence() {
  const input = $("adminKey");
  if (!input) return;
  input.addEventListener("change", () => saveAdminKey(input.value, getRememberChoice()));
  input.addEventListener("blur", () => saveAdminKey(input.value, getRememberChoice()));
  $("rememberAdmin")?.addEventListener("change", () => saveAdminKey(getAdminKey(), getRememberChoice()));
}

function mmkDebug() {
  const keyNow = getAdminKey();
  return {
    origin: location.origin,
    adminKey: keyNow ? "SET" : "EMPTY",
  };
}

async function pingHealth() {
  try {
    const r = await fetchApi("/api/health", { method:"GET", headers: headers() });
    const t = await r.text();
    setBanner("info", `health: ${r.status} ${t}`);
  } catch (e) {
    setBanner("error", `${t("health_error")}: ${formatApiErrorMessage(e)}`);
  }
}

async function clearClientData() {
  clearAll();
  localStorage.removeItem(TMN_CFG_KEY);

  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }

  if (window.caches) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  location.reload();
}

async function testBalance() {
  try {
    const r = await fetchApi("/api/balance", { method: "GET", headers: headers() });
    const data = await r.json().catch(() => null);
    if (data?.ok) {
      alert("PASS: balance ok");
      return;
    }
    alert("FAIL: " + (data?.error || r.status));
  } catch (e) {
    alert("FAIL: " + formatApiErrorMessage(e));
  }
}

function toggleDebug() {
  DEBUG = !DEBUG;
  localStorage.setItem(DEBUG_KEY, DEBUG ? "1" : "0");
  $("debugBtn").textContent = DEBUG ? t("debug_on_label") : t("debug_off_label");
  setBanner("info", DEBUG ? t("debug_on") : t("debug_off"));
}

async function authCheck() {
  setBanner("info", t("auth_checking"));
  try {
    const r = await fetchApi("/api/withdraw/queue", { headers: headers(), method:"GET" });
    const j = await r.json().catch(() => null);

    if (j && j.ok) {
      setAdminFieldState("ok");
      setBanner("ok", t("auth_ok"));
      return true;
    }
    setAdminFieldState("bad");
    setBanner("error", `${t("auth_fail")} (${r.status}) ${j?.message || j?.error || "unauthorized"}`);
    return false;
  } catch (e) {
    setAdminFieldState("bad");
    setBanner("error", `${t("auth_error")}: ${formatApiErrorMessage(e)}`);
    return false;
  }
}

/* TMN Config */
const TMN_FORM_FIELD_MAP = {
  tmnone_keyid: "tmn_keyid",
  tmn_msisdn: "tmn_msisdn",
  tmn_login_token: "tmn_login_token",
  tmn_tmn_id: "tmn_tmn_id",
  tmn_device_id: "tmn_device_id",
  tmn_pin6: "tmn_pin6",
  proxy_ip: "tmn_proxy_ip",
  proxy_user: "tmn_proxy_user",
  proxy_pass: "tmn_proxy_pass"
};

const TMN_ALIAS_TO_KEY = {
  TMNONE_KEYID: "tmnone_keyid",
  TMN_KEYID: "tmnone_keyid",
  TMN_MSISDN: "tmn_msisdn",
  MSISDN: "tmn_msisdn",
  TMN_LOGIN_TOKEN: "tmn_login_token",
  LOGIN_TOKEN: "tmn_login_token",
  TMN_TMN_ID: "tmn_tmn_id",
  TMN_ID: "tmn_tmn_id",
  TMN_DEVICE_ID: "tmn_device_id",
  DEVICE_ID: "tmn_device_id",
  TMN_PIN6: "tmn_pin6",
  PIN6: "tmn_pin6",
  PROXY_IP: "proxy_ip",
  PROXY_USERNAME: "proxy_user",
  PROXY_USER: "proxy_user",
  PROXY_PASSWORD: "proxy_pass",
  PROXY_PASS: "proxy_pass",
};

function emptyTmnCfg() {
  const cfg = {};
  for (const key of Object.keys(TMN_FORM_FIELD_MAP)) cfg[key] = "";
  return cfg;
}

function normalizeTmnKey(inputKey) {
  const key = (inputKey || "").toString().trim();
  if (!key) return "";
  return TMN_ALIAS_TO_KEY[key.toUpperCase()] || "";
}

function stripWrappingQuotes(value) {
  const v = (value || "").toString().trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

function normalizeTmnCfg(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = normalizeTmnKey(rawKey);
    if (!key) continue;
    out[key] = stripWrappingQuotes(rawValue);
  }
  return out;
}

function parseTmnPasteBlock(block) {
  const out = {};
  const lines = String(block || "").split(/\r?\n/);
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    line = line.replace(/^export\s+/i, "").trim();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const rawKey = line.slice(0, eq).trim();
    const rawValue = line.slice(eq + 1).trim();
    const key = normalizeTmnKey(rawKey);
    if (!key) continue;
    out[key] = stripWrappingQuotes(rawValue);
  }
  return out;
}

function readTmnCfgFromForm() {
  const cfg = emptyTmnCfg();
  for (const [key, id] of Object.entries(TMN_FORM_FIELD_MAP)) {
    cfg[key] = ($(id)?.value || "").toString().trim();
  }
  return cfg;
}

function applyTmnCfgToForm(cfg) {
  const normalized = normalizeTmnCfg(cfg);
  const merged = { ...emptyTmnCfg(), ...normalized };
  for (const [key, id] of Object.entries(TMN_FORM_FIELD_MAP)) {
    if ($(id)) $(id).value = merged[key] || "";
  }
}

function loadTmnCfg() {
  try {
    const raw = JSON.parse(localStorage.getItem(TMN_CFG_KEY) || "{}");
    return { ...emptyTmnCfg(), ...normalizeTmnCfg(raw) };
  } catch {
    return emptyTmnCfg();
  }
}

function isTmnCfgComplete(cfg) {
  if (!cfg) return false;
  const need = ["tmnone_keyid","tmn_msisdn","tmn_login_token","tmn_tmn_id","tmn_pin6"];
  return need.every(k => (cfg[k] || "").toString().trim().length > 0);
}

function updateTmnButtonState() {
  const btn = $("tmnToggleBtn");
  const st  = $("tmnStatus");
  const cfg = loadTmnCfg();

  if (!btn) return;
  btn.classList.toggle("ok", isTmnCfgComplete(cfg));

  if (st) {
    st.textContent = isTmnCfgComplete(cfg)
      ? (LANG === "en" ? "TMN complete ✅ (button turns green)" : "บันทึกครบแล้ว ✅ (ปุ่ม TMN เป็นสีเขียว)")
      : (LANG === "en" ? "TMN incomplete (KEYID/MSISDN/TOKEN/TMN_ID/PIN6)" : "ยังไม่ครบ (กรอก KEYID/MSISDN/TOKEN/TMN_ID/PIN6)");
  }
}

function fillTmnFormFromStorage() {
  applyTmnCfgToForm(loadTmnCfg());
}

function saveTmnCfgFromForm() {
  const cfg = readTmnCfgFromForm();

  localStorage.setItem(TMN_CFG_KEY, JSON.stringify(cfg));
  updateTmnButtonState();

  if (!isTmnCfgComplete(cfg)) {
    setBanner("error", t("tmn_incomplete"));
    return false;
  }

  setBanner("ok", t("tmn_saved"));
  return true;
}

function setTmnTestStatus(ok, message) {
  const el = $("tmnTestStatus");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = ok ? "#067647" : "#b42318";
}

function isReloginOrFaceError(message) {
  const raw = String(message || "");
  const s = raw.toLowerCase();
  return (
    /-428|face|biometric|session|expired|re-?login|log\s*in|login|reauth|verify|pin\/login/.test(s) ||
    /ต้อง.*login|ต้อง.*เข้าสู่ระบบ|หมดอายุ|สแกนหน้า|ใบหน้า|ยืนยันตัวตน/.test(raw)
  );
}

async function testRealModeBalance(btn) {
  const saved = saveTmnCfgFromForm();
  if (!saved) {
    setTmnTestStatus(false, t("tmn_test_fail"));
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const url = `/api/dashboard?start=${encodeURIComponent(today)}&end=${encodeURIComponent(today)}`;
  setTmnTestStatus(false, t("tmn_test_loading"));
  setBanner("info", t("tmn_test_loading"));
  setButtonLoading(btn, true, t("tmn_test_loading"));

  try {
    const r = await fetchApi(url, { method: "GET", headers: headers() });
    const j = await r.json().catch(() => null);

    if (j?.ok) {
      setTmnMode(j.TMN_MODE || j.tmn_mode || j.mode || "");
      const passMsg = `${t("tmn_test_pass")} (balance ${fmtMoney(j.balance)})`;
      setTmnTestStatus(true, passMsg);
      setBanner("ok", passMsg);
      return;
    }

    const rawMsg = String(j?.message || j?.error || `http_${r.status}`);
    if (isReloginOrFaceError(rawMsg)) {
      setTmnTestStatus(false, t("tmn_test_relogin"));
      setBanner("error", `${t("tmn_test_relogin")} - ${t("tmn_test_relogin_hint")}`);
      return;
    }

    const failMsg = `${t("tmn_test_fail")} (${r.status}) ${rawMsg}`;
    setTmnTestStatus(false, failMsg);
    setBanner("error", failMsg);
  } catch (e) {
    const rawMsg = formatApiErrorMessage(e);
    if (isReloginOrFaceError(rawMsg)) {
      setTmnTestStatus(false, t("tmn_test_relogin"));
      setBanner("error", `${t("tmn_test_relogin")} - ${t("tmn_test_relogin_hint")}`);
    } else {
      const failMsg = `${t("tmn_test_fail")}: ${rawMsg}`;
      setTmnTestStatus(false, failMsg);
      setBanner("error", failMsg);
    }
  } finally {
    setButtonLoading(btn, false);
  }
}

function applyTmnPasteBlock() {
  const block = ($("tmn_paste_block")?.value || "").toString();
  if (!block.trim()) {
    setBanner("error", t("tmn_paste_empty"));
    return;
  }

  const parsed = parseTmnPasteBlock(block);
  if (!Object.keys(parsed).length) {
    setBanner("error", t("tmn_paste_no_keys"));
    return;
  }

  const merged = { ...readTmnCfgFromForm(), ...parsed };
  applyTmnCfgToForm(merged);
  const ok = saveTmnCfgFromForm();
  if (ok) setBanner("ok", t("tmn_paste_applied"));
}

function exportTmnCfgJson() {
  try {
    const cfg = readTmnCfgFromForm();
    const payload = JSON.stringify(cfg, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `tmn-config-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setBanner("ok", t("tmn_exported"));
  } catch (e) {
    setBanner("error", `${t("tmn_export_failed")}: ${e.message || e}`);
  }
}

function openTmnImportPicker() {
  $("tmn_import_file")?.click();
}

function importTmnCfgFromFile(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      const normalized = normalizeTmnCfg(parsed);
      if (!Object.keys(normalized).length) {
        throw new Error(t("tmn_paste_no_keys"));
      }

      const next = { ...emptyTmnCfg(), ...normalized };
      applyTmnCfgToForm(next);
      const ok = saveTmnCfgFromForm();
      if (ok) setBanner("ok", t("tmn_imported"));
    } catch (e) {
      setBanner("error", `${t("tmn_import_failed")}: ${e.message || e}`);
    } finally {
      if (input) input.value = "";
    }
  };

  reader.onerror = () => {
    setBanner("error", `${t("tmn_import_failed")}: read_error`);
    if (input) input.value = "";
  };

  reader.readAsText(file);
}

function clearTmnCfg() {
  localStorage.removeItem(TMN_CFG_KEY);
  fillTmnFormFromStorage();
  if ($("tmn_paste_block")) $("tmn_paste_block").value = "";
  updateTmnButtonState();
  setBanner("info", t("tmn_cleared"));
}

function toggleDisclosure() {
  const panel = $("tmnPanel");
  const btn = $("tmnToggleBtn");
  if (!panel || !btn) return;
  const willOpen = panel.hasAttribute("hidden");
  if (willOpen) panel.removeAttribute("hidden");
  else panel.setAttribute("hidden", "");
  btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

/* Tabs */
function showTab(tabName) {
  const norm = (tabName || "dashboard").toLowerCase();
  const section = (norm === "withdraw" || norm === "qr") ? "withdraw" : "dashboard";

  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const sec = document.getElementById("tab-" + section);
  if (sec) sec.classList.add("active");

  let found = false;
  document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
    const isActive = btn.getAttribute("data-tab") === norm;
    if (isActive) found = true;
    btn.classList.toggle("active", isActive);
  });
  if (!found) {
    document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === "dashboard");
    });
  }

  localStorage.setItem(LAST_TAB_KEY, found ? norm : "dashboard");

  if (norm === "qr") {
    setTimeout(() => $("qrCard")?.scrollIntoView({ behavior:"smooth", block:"start" }), 0);
  }
}

function initTabs() {
  document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      showTab(btn.getAttribute("data-tab"));
    });
  });
}

/* Dashboard */
function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtTime(ts) {
  try {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch {}
  return String(ts || "");
}

function guessInOut(tx) {
  // พยายามเดา in/out แบบไม่พัง ถ้า backend ให้ฟิลด์มา
  const amt = Number(tx.amount);
  const dir = (tx.direction || tx.dir || tx.type || "").toString().toLowerCase();

  if (Number.isFinite(amt) && amt < 0) return { in:0, out:Math.abs(amt) };
  if (dir.includes("out") || dir.includes("withdraw") || dir.includes("debit")) return { in:0, out:Math.abs(amt) };
  if (dir.includes("in")  || dir.includes("deposit")  || dir.includes("credit")) return { in:Math.abs(amt), out:0 };
  return { in:Math.max(0, amt), out:0 };
}

async function loadDashboard() {
  const start = $("start")?.value;
  const end   = $("end")?.value;

  if (!start || !end) {
    setBanner("error", t("choose_date"));
    return;
  }
  setBanner("info", t("dashboard_loading"));

  try {
    const url = `/api/dashboard?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const r = await fetchApi(url, { method:"GET", headers: headers() });
    const j = await r.json().catch(() => null);

    if (!j || !j.ok) {
      setBanner("error", `${t("dashboard_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
      return;
    }

    $("balance").textContent = fmtMoney(j.balance);
    $("balMode").textContent = j.mode ? `(${j.mode})` : "";
    $("accountName").textContent = j.account_name || j.accountName || j.name || "-";
    setTmnMode(j.TMN_MODE || j.tmn_mode || j.mode || "");

    const tx = Array.isArray(j.tx) ? j.tx : [];
    let sumIn = 0, sumOut = 0;

    const body = $("txBody");
    if (body) body.innerHTML = "";

    tx.forEach(item => {
      const io = guessInOut(item);
      sumIn += io.in;
      sumOut += io.out;

      if (!body) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtTime(item.time || item.created_at || item.ts || "")}</td>
        <td>${(item.type || item.direction || "-")}</td>
        <td>${fmtMoney(item.amount)}</td>
        <td class="muted">${(item.id || item.txid || "-")}</td>
      `;
      body.appendChild(tr);
    });

    $("sumIn").textContent  = fmtMoney(sumIn);
    $("sumOut").textContent = fmtMoney(sumOut);

    setBanner("ok", t("dashboard_ok"));
  } catch (e) {
    setBanner("error", `${t("dashboard_error")}: ${formatApiErrorMessage(e)}`);
  }
}

/* Withdraw */
function preventWheelOnNumberInputs() {
  document.querySelectorAll('input[type="number"]').forEach(inp => {
    inp.addEventListener("wheel", (e) => {
      // กันตัวเลขลั่นเวลาสกอลล์
      if (document.activeElement === inp) {
        e.preventDefault();
        inp.blur();
      }
    }, { passive:false });
  });
}

function loadWithdrawState() {
  try {
    const raw = localStorage.getItem(WITHDRAW_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveWithdrawState(state) {
  try {
    localStorage.setItem(WITHDRAW_STATE_KEY, JSON.stringify(state));
  } catch {}
}

function renderWithdrawFields() {
  const type = $("wType")?.value || "wallet";
  const box  = $("wFields");
  const hint = $("destHint");
  if (!box) return;

  box.innerHTML = "";
  if (hint) hint.textContent = "";

  if (type === "bank") {
    box.innerHTML = `
      <div class="row" style="align-items:flex-end;">
        <div style="min-width:160px; flex:1;">
          <div class="muted">bank_code</div>
          <select id="bank_code">
            <option value="scb">SCB</option>
            <option value="kbank">KBANK</option>
            <option value="bbl">BBL</option>
            <option value="ktb">KTB</option>
            <option value="bay">BAY</option>
            <option value="ttb">TTB</option>
            <option value="gsb">GSB</option>
            <option value="baac">BAAC</option>
            <option value="uob">UOB</option>
            <option value="cimb">CIMB</option>
          </select>
        </div>
        <div style="min-width:220px; flex:2;">
          <div class="muted">bank_ac</div>
          <input id="bank_ac" inputmode="numeric" placeholder="เลขบัญชี" />
        </div>
      </div>
    `;
    if (hint) hint.textContent = t("withdraw_hint_bank");
  }

  if (type === "promptpay") {
    box.innerHTML = `
      <div class="row" style="align-items:flex-end;">
        <div style="min-width:260px; flex:1;">
          <div class="muted">proxy_value (phone/id)</div>
          <input id="proxy_value" inputmode="numeric" placeholder="เช่น 0xxxxxxxxx หรือ 13 หลัก" />
        </div>
      </div>
    `;
    if (hint) hint.textContent = t("withdraw_hint_promptpay");
  }

  if (type === "wallet") {
    box.innerHTML = `
      <div class="row" style="align-items:flex-end;">
        <div style="min-width:260px; flex:1;">
          <div class="muted">wallet_id / phone (10 digits)</div>
          <input id="wallet_id" inputmode="numeric" placeholder="เช่น 0xxxxxxxxx" maxlength="10" />
        </div>
      </div>
    `;
    if (hint) hint.textContent = t("withdraw_hint_p2p");
  }

  // Keyboard speed: Enter -> focus amount
  const moveToAmount = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("wAmount")?.focus();
    }
  };
  ["bank_ac","proxy_value","wallet_id"].forEach(id => $(id)?.addEventListener("keydown", moveToAmount));

  // Restore persisted destination inputs for this type
  const saved = loadWithdrawState();
  if (saved && saved.type === type) {
    if (type === "bank") {
      if (saved.dest?.bank_code && $("bank_code")) $("bank_code").value = saved.dest.bank_code;
      if (saved.dest?.bank_ac && $("bank_ac")) $("bank_ac").value = saved.dest.bank_ac;
    }
    if (type === "promptpay" && saved.dest?.proxy_value && $("proxy_value")) {
      $("proxy_value").value = saved.dest.proxy_value;
    }
    if (type === "wallet" && saved.dest?.wallet_id && $("wallet_id")) {
      $("wallet_id").value = saved.dest.wallet_id;
    }
  }
}

function readWithdrawForm() {
  const type = $("wType")?.value || "wallet";
  const amount = Number(($("wAmount")?.value || "").toString());

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(t("amount_invalid"));
  }

  let dest = {};
  if (type === "bank") {
    const bank_code = ($("bank_code")?.value || "").trim();
    const bank_ac   = ($("bank_ac")?.value || "").trim();
    if (!bank_code || !bank_ac) throw new Error(t("fill_bank_required"));
    dest = { bank_code, bank_ac };
  }

  if (type === "promptpay") {
    const proxy_value = ($("proxy_value")?.value || "").trim();
    const digits = proxy_value.replace(/\D/g, "");
    const lenOk = digits.length === 10 || digits.length === 13 || digits.length === 15;
    if (!lenOk) {
      throw new Error(t("fill_proxy_required"));
    }
    dest = { proxy_value: digits };
    if (digits.length === 15 && isRealMode()) {
      throw new Error(t("ewallet_warn"));
    }
  }

  if (type === "wallet") {
    const wallet_id = ($("wallet_id")?.value || "").trim();
    const digits = wallet_id.replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) throw new Error(t("fill_wallet_required"));
    dest = { wallet_id: digits };
  }

  saveWithdrawState({ type, amount, dest });
  return { type, amount, dest };
}

async function createWithdraw() {
  try {
    const ok = await authCheck();
    if (!ok) return;

    const payload = readWithdrawForm();
    setBanner("info", t("creating_queue"));

    const r = await fetchApi("/api/withdraw/create", {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => null);

    if (!j || !j.ok) {
      setBanner("error", `${t("create_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
      return;
    }
    setBanner("ok", t("create_ok"));
    await loadQueue();
  } catch (e) {
    setBanner("error", formatApiErrorMessage(e));
  }
}

function destToText(item) {
  const d = item?.dest || {};
  if (item.type === "bank") return `${d.bank_code || "-"}:${d.bank_ac || "-"}`;
  if (item.type === "promptpay") return `${d.proxy_value || "-"}`;
  if (item.type === "p2p") return `${d.proxy_value || "-"}`;
  if (item.type === "wallet") return `${d.wallet_id || "-"}`;
  return "-";
}

function actionConfirmText(action, item) {
  return [
    `${action} CONFIRM`,
    `id: ${item.id}`,
    `status: ${item.status}`,
    `type: ${item.type}`,
    `amount: ${fmtMoney(item.amount)}`,
    `dest: ${destToText(item)}`,
    "",
    t("confirm_footer")
  ].join("\n");
}

async function approve(id, btn) {
  const item = LAST_QUEUE_MAP.get(id);
  if (!item) return;

  if (!confirm(actionConfirmText(t("approve_action"), item))) return;

  try {
    setBanner("info", t("approve_loading"));
    setButtonLoading(btn, true, t("approve_loading"));
    const r = await fetchApi(`/api/withdraw/${encodeURIComponent(id)}/approve`, {
      method:"POST",
      headers: headers({ "content-type":"application/json" }),
      body: "{}"
    });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) {
      setBanner("error", `${t("approve_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
      return;
    }
    setBanner("ok", t("approve_ok"));
    await loadQueue();
  } catch (e) {
    setBanner("error", `${t("approve_fail")}: ${formatApiErrorMessage(e)}`);
  } finally {
    setButtonLoading(btn, false);
  }
}

async function sendNow(id, btn) {
  const item = LAST_QUEUE_MAP.get(id);
  if (!item) return;

  let text = actionConfirmText(t("send_action"), item);
  if (Number(item.amount) > 300) {
    text += "\n\n⚠️ จำนวนเกิน 300\nแน่ใจหรือไม่ว่าจะโอนจำนวนนี้?";
  }
  if (!confirm(text)) return;
  if (isRealMode()) {
    const typed = prompt(t("real_prompt"));
    if ((typed || "").trim() !== "SEND") {
      setBanner("info", t("transfer_cancelled"));
      return;
    }
  }

  try {
    setBanner("info", t("send_loading"));
    setButtonLoading(btn, true, t("send_loading"));
    const r = await fetchApi(`/api/withdraw/${encodeURIComponent(id)}/send`, {
      method:"POST",
      headers: headers({ "content-type":"application/json" }),
      body: "{}"
    });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) {
      setBanner("error", `${t("send_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
      return;
    }
    setBanner("ok", t("send_ok"));
    await loadQueue();
  } catch (e) {
    setBanner("error", `${t("send_fail")}: ${formatApiErrorMessage(e)}`);
  } finally {
    setButtonLoading(btn, false);
  }
}

async function loadQueue() {
  try {
    setBanner("info", t("queue_loading"));
    const r = await fetchApi("/api/withdraw/queue", { method:"GET", headers: headers() });
    const j = await r.json().catch(() => null);

    if (!j || !j.ok) {
      setBanner("error", `${t("queue_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
      return;
    }

    const items = Array.isArray(j.items) ? j.items : [];
    LAST_QUEUE_MAP = new Map(items.map(x => [x.id, x]));

    const tbody = $("qBody");
    const cards = $("qCards");
    if (tbody) tbody.innerHTML = "";
    if (cards) cards.innerHTML = "";

    items.forEach(it => {
      const canApprove = (it.status === "pending");
      const canSend    = (it.status === "approved");

      // table row
      if (tbody) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${it.status}</td>
          <td>${it.type}</td>
          <td>${fmtMoney(it.amount)}</td>
          <td>${destToText(it)}</td>
          <td>
            <button class="btn-approve" ${canApprove ? "" : "disabled"} onclick="approve('${it.id}', this)">${t("approve_btn")}</button>
            <button class="btn-send" ${canSend ? "" : "disabled"} onclick="sendNow('${it.id}', this)">${t("send_btn")}</button>
          </td>
        `;
        tbody.appendChild(tr);
      }

      // mobile card
      if (cards) {
        const div = document.createElement("div");
        div.className = "q-card";
        div.innerHTML = `
          <div class="muted">id</div>
          <div style="word-break:break-all;"><b>${it.id}</b></div>
          <div class="row" style="margin-top:8px;">
            <div style="flex:1;">
          <div class="muted">${t("status")}</div>
              <div>${it.status}</div>
            </div>
            <div style="flex:1;">
              <div class="muted">${t("type")}</div>
              <div>${it.type}</div>
            </div>
            <div style="flex:1;">
              <div class="muted">${t("amount")}</div>
              <div>${fmtMoney(it.amount)}</div>
            </div>
          </div>
          <div style="margin-top:8px;">
            <div class="muted">${t("dest")}</div>
            <div>${destToText(it)}</div>
          </div>
          <div class="row" style="margin-top:10px;">
            <button class="btn-approve" ${canApprove ? "" : "disabled"} onclick="approve('${it.id}', this)">${t("approve_btn")}</button>
            <button class="btn-send" ${canSend ? "" : "disabled"} onclick="sendNow('${it.id}', this)">${t("send_btn")}</button>
          </div>
        `;
        cards.appendChild(div);
      }
    });

    setBanner("ok", `${t("queue_ok")} (${items.length} ${t("queue_items")})`);
  } catch (e) {
    setBanner("error", `${t("queue_fail")}: ${formatApiErrorMessage(e)}`);
  }
}

/* QR decode into Withdraw */
async function decodeQrIntoWithdraw(btn) {
  const f = $("qrFile")?.files?.[0];
  if (!f) {
    setBanner("error", t("qr_choose_file"));
    return;
  }

  setBanner("info", t("decode_loading"));
  setButtonLoading(btn, true, t("decode_loading"));
  const fd = new FormData();
  fd.append("image", f);

  try {
    const r = await fetchApi("/api/qr/decode", { method:"POST", headers: headers(), body: fd });
    const j = await r.json().catch(() => null);

    if (!j || !j.ok) {
      setBanner("error", `${t("decode_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
      setButtonLoading(btn, false);
      return;
    }

    $("qrOut").textContent = JSON.stringify(j, null, 2);

    // รองรับ key หลายแบบ
    const pv =
      j?.parsed?.proxy_value ||
      j?.parsed?.proxyValue ||
      j?.proxy_value ||
      j?.proxyValue ||
      "";

    if (!pv) {
      setBanner("error", t("proxy_missing"));
      setButtonLoading(btn, false);
      return;
    }

    // switch type -> promptpay, fill proxy, focus amount
    $("wType").value = "promptpay";
    renderWithdrawFields();
    if ($("proxy_value")) $("proxy_value").value = pv;
    $("wAmount")?.focus();

    // warn 15 digits
    if (pv.toString().length === 15) {
      setBanner("info", t("ewallet_warn"));
    } else {
      setBanner("ok", t("fill_proxy_ok"));
    }
    setButtonLoading(btn, false);
  } catch (e) {
    setBanner("error", `${t("decode_error")}: ${formatApiErrorMessage(e)}`);
    setButtonLoading(btn, false);
  }
}

/* init */
function bindButtons() {
  $("tmn_save")?.addEventListener("click", saveTmnCfgFromForm);
  $("tmn_test_balance")?.addEventListener("click", function () { testRealModeBalance(this); });
  $("tmn_clear")?.addEventListener("click", clearTmnCfg);
  $("tmn_apply_paste")?.addEventListener("click", applyTmnPasteBlock);
  $("tmn_export_json")?.addEventListener("click", exportTmnCfgJson);
  $("tmn_import_json")?.addEventListener("click", openTmnImportPicker);
  $("tmn_import_file")?.addEventListener("change", importTmnCfgFromFile);
  $("btnClearClient")?.addEventListener("click", clearClientData);
  $("btnTestBalance")?.addEventListener("click", testBalance);
}

function initDates() {
  const s = $("start"), e = $("end");
  if (!s || !e) return;
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const y = today.getFullYear();
  const m = pad(today.getMonth() + 1);
  const d = pad(today.getDate());
  const iso = `${y}-${m}-${d}`;
  if (!s.value) s.value = iso;
  if (!e.value) e.value = iso;
}

window.toggleDisclosure = toggleDisclosure;
window.showTab = showTab;
window.saveAdminKey = saveAdminKey;
window.pingHealth = pingHealth;
window.toggleDebug = toggleDebug;
window.authCheck = authCheck;
window.loadDashboard = loadDashboard;
window.renderWithdrawFields = renderWithdrawFields;
window.createWithdraw = createWithdraw;
window.loadQueue = loadQueue;
window.approve = approve;
window.sendNow = sendNow;
window.decodeQrIntoWithdraw = decodeQrIntoWithdraw;
window.logout = logout;
window.setLang = setLang;
window.__mmkDebug = mmkDebug;

document.addEventListener("DOMContentLoaded", async () => {
  mountTopControls();
  applyI18nStatic();
  ensureSafeModeBanner();
  $("debugBtn").textContent = DEBUG ? t("debug_on_label") : t("debug_off_label");
  const isDevHost = resolveDevHost();
  const disableSw = resolveDisableSw(isDevHost);
  setupDevSwResetButton(isDevHost);

  const modalClosedImmediately = await showLoginModal();
  if (!modalClosedImmediately) {
    await new Promise((resolve) => {
      const check = () => {
        if (!document.getElementById("loginModal")) resolve();
        else setTimeout(check, 120);
      };
      check();
    });
  }

  restoreAdminKey();
  bindAdminKeyPersistence();
  fillTmnFormFromStorage();
  updateTmnButtonState();
  const panel = $("tmnPanel");
  const btn = $("tmnToggleBtn");
  if (panel && btn) {
    btn.setAttribute("aria-expanded", panel.hasAttribute("hidden") ? "false" : "true");
  }

  bindButtons();
  initTabs();
  const lastTab = localStorage.getItem(LAST_TAB_KEY) || "dashboard";
  showTab(lastTab);
  initDates();
  const savedW = loadWithdrawState();
  if (savedW?.type && $("wType")) {
    const opt = Array.from($("wType").options || []).some(o => o.value === savedW.type);
    $("wType").value = opt ? savedW.type : $("wType").value;
  }
  if (savedW?.amount && $("wAmount")) $("wAmount").value = savedW.amount;
  renderWithdrawFields();
  preventWheelOnNumberInputs();
  buildDebugBox(isDevHost);

  window.addEventListener("storage", (e) => {
    if (e.key !== ADMIN_KEY_KEY && e.key !== REMEMBER_KEY) return;
    restoreAdminKey();
  });

  if (disableSw) {
    unregisterSwAndClearCache().catch(() => {});
  } else if (!isDevHost && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
});
