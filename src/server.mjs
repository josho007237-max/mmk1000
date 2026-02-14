import fs from "fs";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { tmnGetBalance, tmnFetchTx, tmnSendTransfer } from "./tmn.adapter.mjs";
import {
  ensureDataDir, listWithdrawals, createWithdrawal,
  approveWithdrawal, markWithdrawalResult, getWithdrawal,
  WITHDRAW_STORE, WITHDRAW_STORAGE_TYPE, WITHDRAW_STORAGE_PATH
} from "./withdraw.store.mjs";
// NOTE: Withdraw single source of truth = `data/withdraw-queue.json` via `withdraw.store.mjs`.

import { decodeQrPayloadFromImage, tryParsePromptPay } from "./qr.decode.mjs";

const envPath = process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), ".env");
const exists = fs.existsSync(envPath);
const dotenvResult = dotenv.config({
  path: envPath,
  override: String(process.env.DOTENV_CONFIG_OVERRIDE || "").toLowerCase() === "true",
});
console.log("[MMK1000] dotenv path=", envPath, "exists=", exists);
if (dotenvResult.error) {
  console.warn("[MMK1000] dotenv load error=", String(dotenvResult.error?.message || dotenvResult.error));
}
console.log(
  "[MMK1000] env set? keyid=",
  !!process.env.TMNONE_KEYID,
  "login=",
  !!process.env.TMN_LOGIN_TOKEN,
  "tmn=",
  !!process.env.TMN_TMN_ID,
  "dev=",
  !!process.env.TMN_DEVICE_ID
);

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 4100);
const ADMIN_KEY = process.env.ADMIN_KEY || "mmk1000";
const raw = process.env.ADMIN_KEYS || ADMIN_KEY;
const allowed = raw.split(",").map(s => s.trim()).filter(Boolean);
const viewRaw = process.env.ADMIN_KEYS_VIEW || raw;
const fullRaw = process.env.ADMIN_KEYS_FULL || raw;
const viewKeys = viewRaw.split(",").map((s) => s.trim()).filter(Boolean);
const fullKeys = fullRaw.split(",").map((s) => s.trim()).filter(Boolean);
const DEBUG_HEADERS = process.env.NODE_ENV !== "production" && process.env.DEBUG_HEADERS === "1";
const SENSITIVE = new Set([
  "x-admin-key",
  "authorization",
  "cookie",
  "set-cookie",
  "x-tmn-keyid",
  "x-tmn-msisdn",
  "x-tmn-login-token",
  "x-tmn-pin6",
  "x-tmn-tmn-id",
  "x-tmn-device-id",
  "x-tmn-proxy-ip",
  "x-tmn-proxy-user",
  "x-tmn-proxy-pass",
]);

function missingTmnFields(cfg = {}) {
  const missing = [];
  const s = (v) => String(v ?? "").trim();
  if (s(cfg.keyid) === "") missing.push("keyid");
  if (s(cfg.loginToken) === "") missing.push("loginToken");
  if (s(cfg.tmnId) === "") missing.push("tmnId");
  if (s(cfg.deviceId) === "") missing.push("deviceId");
  return missing;
}

function redactHeaders(h = {}) {
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = SENSITIVE.has(String(k).toLowerCase()) ? "***" : v;
  }
  return out;
}

function getTmnCfg(req) {
  const mode = String(process.env.TMN_MODE || "mock").toLowerCase();
  if (mode !== "real") return {};
  const s = (v) => String(v ?? "").trim();
  const pick = (headerName, envName) => {
    const headerVal = s(req.get(headerName));
    if (headerVal !== "") return headerVal;
    return s(process.env[envName]);
  };
  return {
    keyid: pick("x-tmn-keyid", "TMNONE_KEYID"),
    msisdn: pick("x-tmn-msisdn", "TMN_MSISDN"),
    loginToken: pick("x-tmn-login-token", "TMN_LOGIN_TOKEN"),
    tmnId: pick("x-tmn-tmn-id", "TMN_TMN_ID"),
    deviceId: pick("x-tmn-device-id", "TMN_DEVICE_ID"),
    pin6: pick("x-tmn-pin6", "TMN_PIN6"),
    proxyIp: pick("x-tmn-proxy-ip", "PROXY_IP"),
    proxyUser: pick("x-tmn-proxy-user", "PROXY_USERNAME"),
    proxyPass: pick("x-tmn-proxy-pass", "PROXY_PASSWORD"),
  };
}

function validateEnv() {
  const mode = String(process.env.TMN_MODE || "mock").toLowerCase();
  if (mode !== "real") {
    return { mode, ok: true, issues: [] };
  }
  const requiredCore = [
    "TMNONE_KEYID",
    "TMN_MSISDN",
    "TMN_LOGIN_TOKEN",
    "TMN_TMN_ID",
    "TMN_DEVICE_ID",
    "TMN_PIN6",
  ];
  const proxyKeys = ["PROXY_IP", "PROXY_USERNAME", "PROXY_PASSWORD"];
  const issues = [];

  const proxyAnySet = proxyKeys.some((key) => String(process.env[key] || "").trim());
  const required = proxyAnySet ? [...requiredCore, ...proxyKeys] : requiredCore;

  const status = {};
  for (const key of [...requiredCore, ...proxyKeys]) {
    status[key] = String(process.env[key] || "").trim() ? "(set)" : "missing";
  }

  for (const key of required) {
    if (!String(process.env[key] || "").trim()) {
      issues.push(`missing_real_config:${key}`);
    }
  }
  if (proxyAnySet && issues.length) {
    issues.push("proxy_partial_config");
  }
  console.log("[MMK1000] real env status", status);
  if (issues.length) {
    console.error("[MMK1000] real mode config missing:", issues.join(", "));
    process.exit(1);
  }
  return { mode, ok: issues.length === 0, issues };
}

function sendOk(res, data = {}, status = 200) {
  return res.status(status).json({ ...data, ok: true });
}

function sendErr(res, status, error, extra = {}) {
  const msg = typeof error === "string" ? error : String(error?.message || error);
  const message = msg || String(error || "unknown_error");
  return res.status(status).json({ ...extra, ok: false, error: msg, message });
}

function requireKey(keys) {
  return (req, res, next) => {
    const k = req.header("x-admin-key");
    if (!k || !keys.includes(k)) {
      const len = k ? String(k).length : 0;
      console.warn(`[MMK1000] unauthorized x-admin-key present=${!!k} len=${len}`);
      if (DEBUG_HEADERS) {
        console.log("[MMK1000] unauthorized headers", redactHeaders(req.headers));
      }
      return sendErr(res, 401, "unauthorized");
    }
    next();
  };
}
const requireAdmin = (req, res, next) => {
  const viewAllowed = viewKeys.length ? viewKeys : allowed;
  const key = req.header("x-admin-key");
  if (!key || !viewAllowed.includes(key)) {
    const len = key ? String(key).length : 0;
    console.warn(`[MMK1000] unauthorized x-admin-key present=${!!key} len=${len}`);
    if (DEBUG_HEADERS) {
      console.log("[MMK1000] unauthorized headers", redactHeaders(req.headers));
    }
    return sendErr(res, 401, "unauthorized");
  }
  next();
};
const requireFullAdmin = requireKey(fullKeys.length ? fullKeys : allowed);

app.get("/api/health", (req, res) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[MMK1000] health request ${req.method} ${req.originalUrl}`);
  }
  return sendOk(res, {});
});

const adminApi = express.Router();
adminApi.use(requireAdmin);

if (process.env.NODE_ENV !== "production") {
  adminApi.get("/routes", (req, res) => {
    sendOk(res, {
      routes: [
        { method: "GET", path: "/api/health" },
        { method: "GET", path: "/api/routes" },
        { method: "GET", path: "/api/_debug/storage" },
        { method: "GET", path: "/api/dashboard" },
        { method: "POST", path: "/api/qr/decode" },
        { method: "GET", path: "/api/withdraw/queue" },
        { method: "POST", path: "/api/withdraw/create" },
        { method: "POST", path: "/api/withdraw/:id/approve" },
        { method: "POST", path: "/api/withdraw/:id/send" },
      ],
    });
  });

  adminApi.get("/_debug/storage", (req, res) => {
    res.status(200).json({
      withdrawStore: WITHDRAW_STORE,
      storageType: WITHDRAW_STORAGE_TYPE,
      path: WITHDRAW_STORAGE_TYPE === "file" ? WITHDRAW_STORAGE_PATH : "",
    });
  });
}

adminApi.get("/dashboard", async (req, res) => {
  try {
    const start = String(req.query.start || new Date(Date.now() - 86400_000).toISOString().slice(0, 10));
    const end   = String(req.query.end   || new Date(Date.now() + 86400_000).toISOString().slice(0, 10));
    const cfg = getTmnCfg(req);
    const missingCfg = new Set(missingTmnFields(cfg));
    console.log("[MMK1000] dashboard cfg set?", {
      mode: process.env.TMN_MODE,
      keyid: !missingCfg.has("keyid"),
      loginToken: !missingCfg.has("loginToken"),
      tmnId: !missingCfg.has("tmnId"),
      deviceId: !missingCfg.has("deviceId"),
    });
    console.log(`[MMK1000] balance request start=${start} end=${end}`);
    const balance = await tmnGetBalance(cfg);
    console.log(`[MMK1000] tx request start=${start} end=${end} limit=20 page=1`);
    const tx = await tmnFetchTx(start, end, 20, 1, cfg);
    sendOk(res, { balance, tx, start, end });
  } catch (e) {
    sendErr(res, 500, e);
  }
});

// Upload QR
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

adminApi.post("/qr/decode", upload.single("image"), async (req, res) => {
  try {
    if (!req.file?.buffer) return sendErr(res, 400, "missing_file");

    const payload = await decodeQrPayloadFromImage(req.file.buffer);
    if (!payload) return sendErr(res, 200, "qr_not_found");

    const parsed = tryParsePromptPay(payload);
    sendOk(res, { payload, parsed });
  } catch (e) {
    sendErr(res, 500, e);
  }
});

// Withdraw
adminApi.get("/withdraw/queue", async (req, res) => {
  try { sendOk(res, { items: await listWithdrawals() }); }
  catch (e) { sendErr(res, 500, e); }
});

adminApi.post("/withdraw/create", async (req, res) => {
  try {
    const job = await createWithdrawal(req.body);
    console.log(`[doctor] withdraw ${job.id} new -> ${job.status} persisted=${WITHDRAW_STORAGE_PATH}`);
    sendOk(res, { job });
  }
  catch (e) { sendErr(res, 400, e); }
});

adminApi.post("/withdraw/:id/approve", requireFullAdmin, async (req, res) => {
  try {
    const job = await approveWithdrawal(req.params.id);
    console.log(`[doctor] withdraw ${job.id} pending -> ${job.status} persisted=${WITHDRAW_STORAGE_PATH}`);
    sendOk(res, { job });
  }
  catch (e) { sendErr(res, 400, e); }
});

adminApi.post("/withdraw/:id/send", requireFullAdmin, async (req, res) => {
  let job;
  try {
    job = await getWithdrawal(req.params.id);
    if (!job) return sendErr(res, 404, "not_found");
    if (job.status === "sent") return sendErr(res, 409, "already_sent");
    if (job.status !== "approved") return sendErr(res, 400, "not_approved");
    const type = String(job?.type || "");
    const sourceMsisdn = String(process.env.TMN_MSISDN ?? "").replace(/\D/g, "");
    const p2pProxy = String(job?.dest?.proxy_value ?? "").replace(/\D/g, "");
    const sameAsSource =
      type === "p2p" &&
      p2pProxy !== "" &&
      sourceMsisdn !== "" &&
      p2pProxy === sourceMsisdn;
    const destRaw = job?.dest?.proxy_value ?? job?.dest?.wallet_id ?? job?.dest?.bank_ac ?? "";
    const destDigits = String(destRaw ?? "").replace(/\D/g, "");
    const destLen = destDigits.length || String(destRaw ?? "").length;
    console.log("[doctor] withdraw send meta", {
      type,
      amount: Number(job?.amount || 0),
      dest_len: destLen,
      same_as_source: sameAsSource,
    });

    if (type === "p2p") {
      if (!/^\d{10}$/.test(p2pProxy)) {
        return sendErr(res, 400, "p2p_dest_invalid");
      }
      if (sameAsSource) {
        return sendErr(res, 400, "dest_same_as_source");
      }
    }

    // BLOCK: PromptPay แบบ E-Wallet ID (15 หลัก) ยังไม่รองรับในโหมด real
    if ((process.env.TMN_MODE || "mock") === "real" && type === "promptpay") {
      const pv = String(job?.dest?.proxy_value ?? "").replace(/\D/g, "");
      if (pv.length === 15) {
        return sendErr(res, 400, "ewallet_not_supported", {
          hint: "TMNOne transferQRPromptpay รองรับเฉพาะ เบอร์โทร/บัตรประชาชน (E-Wallet ID 15 หลักให้ใช้ช่องทางอื่น)",
        });
      }
    }
    if ((process.env.TMN_MODE || "mock") === "real") {
      const cfg = getTmnCfg(req);
      const missing = missingTmnFields(cfg);
      if (missing.length) {
        return sendErr(res, 400, "tmn_cfg_missing", { missing_fields: missing });
      }
    }
    // NOTE: real mode TMNOne transferQRPromptpay ระบุรองรับ “เบอร์/บัตร” :contentReference[oaicite:6]{index=6}
    const r = await tmnSendTransfer(job, getTmnCfg(req));
    if (r?.result?.error || r?.ok === false) {
      const saved = await markWithdrawalResult(job.id, "failed", r);
      console.log(`[doctor] withdraw ${saved.id} ${job.status || "unknown"} -> ${saved.status} persisted=${WITHDRAW_STORAGE_PATH}`);
      return sendErr(res, 500, "transfer_failed");
    }
    const saved = await markWithdrawalResult(job.id, "sent", r);
    console.log(`[doctor] withdraw ${saved.id} ${job.status || "unknown"} -> ${saved.status} persisted=${WITHDRAW_STORAGE_PATH}`);
    sendOk(res, { job: saved });
  } catch (e) {
    try { await markWithdrawalResult(req.params.id, "failed", { error: String(e?.message || e) }); } catch {}
    console.log(`[doctor] withdraw ${req.params.id} ${job?.status || "unknown"} -> failed persisted=${WITHDRAW_STORAGE_PATH}`);
    sendErr(res, 500, e);
  }
});

// Routes above are mounted under /api via adminApi
app.use("/api", adminApi);

// Static
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

const envCheck = validateEnv();
await ensureDataDir();
const isSet = (v) => Boolean(String(v || "").trim());
console.log("[doctor] cwd=", process.cwd());
console.log("[doctor] withdraw queue file=", WITHDRAW_STORAGE_PATH);
console.log("[doctor] withdraw source=", WITHDRAW_STORE);
console.log("[doctor] single source of truth: withdraw-queue.json");
console.log(`[MMK1000] startup mode=${envCheck.mode} port=${PORT}`);
console.log("[MMK1000] startup tmn env", {
  TMN_MODE: String(process.env.TMN_MODE || "mock"),
  TMNONE_KEYID_SET: isSet(process.env.TMNONE_KEYID),
  TMN_LOGIN_TOKEN_SET: isSet(process.env.TMN_LOGIN_TOKEN),
  TMN_TMN_ID_SET: isSet(process.env.TMN_TMN_ID),
  TMN_DEVICE_ID_SET: isSet(process.env.TMN_DEVICE_ID),
});
if (envCheck.mode === "real") {
  console.log(`[MMK1000] real config ready=${envCheck.ok} debug_headers=${String(process.env.DEBUG_HEADERS || "0")}`);
  if (!envCheck.ok) {
    console.warn("[MMK1000] WARNING real mode config not ready:", envCheck.issues.join(", "));
  }
}
const server = app.listen(PORT, "127.0.0.1", () => console.log(`[MMK1000] server listening http://127.0.0.1:${PORT}`));
server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`[MMK1000] EADDRINUSE: port ${PORT} is already in use`);
  }
  console.error("[MMK1000] failed to listen", {
    port: PORT,
    code: err?.code,
    message: String(err?.message || err),
  });
  process.exit(1);
});
