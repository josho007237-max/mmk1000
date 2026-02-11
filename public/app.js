/* MMK1000 Panel client */

const ADMIN_KEY_KEY = "mmk1000_admin_key";
const TMN_CFG_KEY   = "mmk1000_tmn_cfg";
const DEBUG_KEY     = "mmk1000_debug";
const LAST_TAB_KEY  = "mmk1000_last_tab";
const TMN_MODE_KEY  = "mmk1000_tmn_mode";
const LANG_KEY      = "mmk1000_lang";

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

function isValidAdminKey(v) {
  const s = (v || "").trim();
  // กันเคสหลุดอย่าง /queue, space, แปลกๆ
  return /^[A-Za-z0-9._:-]{3,64}$/.test(s) && !s.includes("/");
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
    localStorage.removeItem(ADMIN_KEY_KEY);
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
  if (!line) return;
  const k = localStorage.getItem(ADMIN_KEY_KEY);
  line.textContent = `adminKey exists?: ${k ? "true" : "false"}`;
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

async function verifyAdminKey(candidate) {
  const key = (candidate || "").trim();
  if (!key) return false;
  try {
    const r = await fetch("/api/withdraw/queue", {
      method: "GET",
      headers: { "x-admin-key": sanitizeHeaderValue(key) }
    });
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
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;";
  overlay.innerHTML = `
    <div style="background:#fff;padding:16px;border-radius:10px;max-width:360px;width:92%;box-shadow:0 10px 35px rgba(0,0,0,.2);">
      <h3 style="margin:0 0 8px;">${t("login_title")}</h3>
      <div style="margin:0 0 10px;color:#555;">${t("login_desc")}</div>
      <input id="loginPassword" type="password" placeholder="${t("login_placeholder")}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;" />
      <div id="loginError" style="color:#b42318;min-height:20px;margin-top:8px;"></div>
      <button id="loginSubmitBtn" type="button" style="margin-top:6px;width:100%;">${t("login_submit")}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = $("loginPassword");
  const err = $("loginError");
  const submit = $("loginSubmitBtn");
  if (input) input.value = (localStorage.getItem(ADMIN_KEY_KEY) || "").trim();

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
    localStorage.setItem(ADMIN_KEY_KEY, pwd);
    if ($("adminKey")) $("adminKey").value = pwd;
    setAdminFieldState("ok");
    overlay.remove();
    return true;
  };

  submit?.addEventListener("click", doLogin);
  input?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") await doLogin();
  });
  input?.focus();
  return false;
}

function logout() {
  localStorage.removeItem(ADMIN_KEY_KEY);
  if ($("adminKey")) $("adminKey").value = "";
  setAdminFieldState("");
  location.reload();
}

function getAdminKey() {
  const v = ($("adminKey")?.value || "").trim();
  return v || localStorage.getItem(ADMIN_KEY_KEY) || "";
}

function restoreAdminKey() {
  const saved = (localStorage.getItem(ADMIN_KEY_KEY) || "").trim();
  if ($("adminKey") && saved) $("adminKey").value = saved;
  if (saved && isValidAdminKey(saved)) setAdminFieldState("ok");
}

function persistAdminKeyIfPresent() {
  const value = ($("adminKey")?.value || "").trim();
  if (!value) return;
  localStorage.setItem(ADMIN_KEY_KEY, value);
  setAdminFieldState(isValidAdminKey(value) ? "ok" : "bad");
  refreshDebugBox();
}

function saveAdminKey() {
  const v = ($("adminKey")?.value || "").trim();
  if (!v) return;
  if (!isValidAdminKey(v)) {
    setAdminFieldState("bad");
    setBanner("error", t("admin_invalid"));
    return;
  }
  localStorage.setItem(ADMIN_KEY_KEY, v);
  setAdminFieldState("ok");
  setBanner("ok", t("admin_saved"));
  refreshDebugBox();
}

function bindAdminKeyPersistence() {
  const input = $("adminKey");
  if (!input) return;
  input.addEventListener("change", persistAdminKeyIfPresent);
  input.addEventListener("blur", persistAdminKeyIfPresent);
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
    const r = await fetch("/api/health", { method:"GET", headers: headers() });
    const t = await r.text();
    setBanner("info", `health: ${r.status} ${t}`);
  } catch (e) {
    setBanner("error", `${t("health_error")}: ${e.message || e}`);
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
    const r = await fetch("/api/withdraw/queue", { headers: headers(), method:"GET" });
    const j = await r.json().catch(() => null);

    if (r.ok && j && j.ok) {
      setAdminFieldState("ok");
      setBanner("ok", t("auth_ok"));
      return true;
    }
    setAdminFieldState("bad");
    setBanner("error", `${t("auth_fail")} (${r.status}) ${j?.message || j?.error || "unauthorized"}`);
    return false;
  } catch (e) {
    setAdminFieldState("bad");
    setBanner("error", `${t("auth_error")}: ${e.message || e}`);
    return false;
  }
}

/* TMN Config */
function loadTmnCfg() {
  try { return JSON.parse(localStorage.getItem(TMN_CFG_KEY) || "{}"); }
  catch { return {}; }
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
  const cfg = loadTmnCfg();
  const map = {
    tmnone_keyid:"tmn_keyid",
    tmn_msisdn:"tmn_msisdn",
    tmn_login_token:"tmn_login_token",
    tmn_tmn_id:"tmn_tmn_id",
    tmn_device_id:"tmn_device_id",
    tmn_pin6:"tmn_pin6",
    proxy_ip:"tmn_proxy_ip",
    proxy_user:"tmn_proxy_user",
    proxy_pass:"tmn_proxy_pass"
  };
  for (const [k,id] of Object.entries(map)) {
    if ($(id)) $(id).value = cfg[k] || "";
  }
}

function saveTmnCfgFromForm() {
  const v = (id) => ($ (id)?.value || "").toString().trim();
  const cfg = {
    tmnone_keyid: v("tmn_keyid"),
    tmn_msisdn: v("tmn_msisdn"),
    tmn_login_token: v("tmn_login_token"),
    tmn_tmn_id: v("tmn_tmn_id"),
    tmn_device_id: v("tmn_device_id"),
    tmn_pin6: v("tmn_pin6"),
    proxy_ip: v("tmn_proxy_ip"),
    proxy_user: v("tmn_proxy_user"),
    proxy_pass: v("tmn_proxy_pass")
  };

  localStorage.setItem(TMN_CFG_KEY, JSON.stringify(cfg));
  updateTmnButtonState();

  if (!isTmnCfgComplete(cfg)) {
    setBanner("error", t("tmn_incomplete"));
    return false;
  }

  setBanner("ok", t("tmn_saved"));
  return true;
}

function clearTmnCfg() {
  localStorage.removeItem(TMN_CFG_KEY);
  fillTmnFormFromStorage();
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
    const r = await fetch(url, { method:"GET", headers: headers() });
    const j = await r.json().catch(() => null);

    if (!r.ok || !j || !j.ok) {
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
    setBanner("error", `${t("dashboard_error")}: ${e.message || e}`);
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

function renderWithdrawFields() {
  const type = $("wType")?.value || "bank";
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
          <div class="muted">wallet_id (P2P)</div>
          <input id="wallet_id" placeholder="wallet id" />
        </div>
      </div>
    `;
  }

  // Keyboard speed: Enter -> focus amount
  const moveToAmount = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("wAmount")?.focus();
    }
  };
  ["bank_ac","proxy_value","wallet_id"].forEach(id => $(id)?.addEventListener("keydown", moveToAmount));
}

function readWithdrawForm() {
  const type = $("wType")?.value || "bank";
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
    if (!proxy_value) throw new Error(t("fill_proxy_required"));
    dest = { proxy_value };
  }

  if (type === "wallet") {
    const wallet_id = ($("wallet_id")?.value || "").trim();
    if (!wallet_id) throw new Error(t("fill_wallet_required"));
    dest = { wallet_id };
  }

  return { type, amount, dest };
}

async function createWithdraw() {
  try {
    const ok = await authCheck();
    if (!ok) return;

    const payload = readWithdrawForm();
    setBanner("info", t("creating_queue"));

    const r = await fetch("/api/withdraw/create", {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => null);

    if (!r.ok || !j || !j.ok) {
      setBanner("error", `${t("create_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
      return;
    }
    setBanner("ok", t("create_ok"));
    await loadQueue();
  } catch (e) {
    setBanner("error", e.message || String(e));
  }
}

function destToText(item) {
  const d = item?.dest || {};
  if (item.type === "bank") return `${d.bank_code || "-"}:${d.bank_ac || "-"}`;
  if (item.type === "promptpay") return `${d.proxy_value || "-"}`;
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

  setBanner("info", t("approve_loading"));
  setButtonLoading(btn, true, t("approve_loading"));
  const r = await fetch(`/api/withdraw/${encodeURIComponent(id)}/approve`, {
    method:"POST",
    headers: headers({ "content-type":"application/json" }),
    body: "{}"
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.ok) {
    setBanner("error", `${t("approve_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
    setButtonLoading(btn, false);
    return;
  }
  setBanner("ok", t("approve_ok"));
  await loadQueue();
  setButtonLoading(btn, false);
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

  setBanner("info", t("send_loading"));
  setButtonLoading(btn, true, t("send_loading"));
  const r = await fetch(`/api/withdraw/${encodeURIComponent(id)}/send`, {
    method:"POST",
    headers: headers({ "content-type":"application/json" }),
    body: "{}"
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.ok) {
    setBanner("error", `${t("send_fail")} (${r.status}) ${j?.message || j?.error || "error"}`);
    setButtonLoading(btn, false);
    return;
  }
  setBanner("ok", t("send_ok"));
  await loadQueue();
  setButtonLoading(btn, false);
}

async function loadQueue() {
  setBanner("info", t("queue_loading"));
  const r = await fetch("/api/withdraw/queue", { method:"GET", headers: headers() });
  const j = await r.json().catch(() => null);

  if (!r.ok || !j || !j.ok) {
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
    const r = await fetch("/api/qr/decode", { method:"POST", headers: headers(), body: fd });
    const j = await r.json().catch(() => null);

    if (!r.ok || !j || !j.ok) {
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
    setBanner("error", `${t("decode_error")}: ${e.message || e}`);
    setButtonLoading(btn, false);
  }
}

/* init */
function bindButtons() {
  $("tmn_save")?.addEventListener("click", saveTmnCfgFromForm);
  $("tmn_clear")?.addEventListener("click", clearTmnCfg);
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
  const isDevHost = (location.hostname === "localhost" || location.hostname === "127.0.0.1");

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
  renderWithdrawFields();
  preventWheelOnNumberInputs();
  buildDebugBox(isDevHost);

  window.addEventListener("storage", (e) => {
    if (e.key !== ADMIN_KEY_KEY) return;
    const v = (e.newValue || "").trim();
    if ($("adminKey") && v) $("adminKey").value = v;
    if (v && isValidAdminKey(v)) setAdminFieldState("ok");
    else if (v) setAdminFieldState("bad");
    else setAdminFieldState("");
    refreshDebugBox();
  });

  if ("serviceWorker" in navigator && isDevHost) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister()))
      .catch(() => {});
    if ("caches" in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    }
    setBanner("info", "Dev: SW disabled");
  }
  if ("serviceWorker" in navigator && !isDevHost) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
});
