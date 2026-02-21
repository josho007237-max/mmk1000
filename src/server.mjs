import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { tmnGetBalance, tmnFetchTx, tmnSendTransfer } from "./tmn.adapter.mjs";
import runPreflight from "./tmn.preflight.mjs";
import {
  ensureDataDir, listWithdrawals, createWithdrawal,
  approveWithdrawal, markWithdrawalResult, getWithdrawal, backupWithdrawQueue, tryLock, unlock,
  WITHDRAW_STORE, WITHDRAW_STORAGE_TYPE, WITHDRAW_STORAGE_PATH
} from "./withdraw.store.mjs";
// NOTE: Withdraw single source of truth = `data/withdraw-queue.json` via `withdraw.store.mjs`.

import { decodeQrPayloadFromImage, tryParsePromptPay } from "./qr.decode.mjs";

const IS_PROD = process.env.NODE_ENV === "production";
const envPath = process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), ".env");
const exists = fs.existsSync(envPath);
if (IS_PROD && process.env.DEBUG) {
  process.env.DEBUG = String(process.env.DEBUG)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.toLowerCase().startsWith("dotenv"))
    .join(",");
}
const dotenvResult = dotenv.config({
  path: envPath,
  override: String(process.env.DOTENV_CONFIG_OVERRIDE || "").toLowerCase() === "true",
  quiet: IS_PROD,
});
if (!IS_PROD) {
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
}

const app = express();
const BUILD_TIME = new Date().toISOString();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const started = Date.now();
  console.log(`[req] id=${requestId} ${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    const ms = Date.now() - started;
    console.log(`[res] id=${requestId} status=${res.statusCode} ms=${ms} ${req.method} ${req.originalUrl}`);
  });
  next();
});

const PORT = Number(process.env.PORT || 4100);
const port = PORT;
const host = process.env.HOST || "127.0.0.1";
const startupErrLogFile = path.join(process.cwd(), "logs", "web.err.log");
let startupPhase = true;
function logStartupCrash(err, context = "startup_crash") {
  try {
    fs.mkdirSync(path.dirname(startupErrLogFile), { recursive: true });
    const msg = String(err?.stack || err?.message || err || "unknown_error");
    const line = `[${new Date().toISOString()}] ${context} host=${host} port=${port} mode=${String(process.env.TMN_MODE || "mock")} pid=${process.pid} :: ${msg}\n`;
    fs.appendFileSync(startupErrLogFile, line, "utf8");
  } catch {}
}
process.on("uncaughtException", (err) => {
  if (startupPhase) logStartupCrash(err, "uncaught_exception");
});
process.on("unhandledRejection", (reason) => {
  if (startupPhase) logStartupCrash(reason, "unhandled_rejection");
});
const ADMIN_KEY = String(process.env.ADMIN_KEY || "").trim();
if (!ADMIN_KEY) {
  console.error("[MMK1000] ADMIN_KEY is required");
  process.exit(1);
}
const raw = process.env.ADMIN_KEYS || ADMIN_KEY;
const allowed = raw.split(",").map(s => s.trim()).filter(Boolean);
if (!allowed.length || allowed.some((k) => k.length < 32)) {
  console.error("[MMK1000] ADMIN_KEY/ADMIN_KEYS must be >= 32 chars");
  process.exit(1);
}
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
const BANK_CODE_ALLOWLIST = new Set([
  "SCB",
  "BBL",
  "BAY",
  "KBANK",
  "KTB",
  "TTB",
  "CIMB",
  "LHBANK",
  "UOB",
  "KKP",
  "GSB",
  "BAAC",
  "GHB",
  "ISBT",
  "TISCO",
  "TCRB",
]);
const PREFLIGHT_FAIL_WINDOW_MS = 5 * 60 * 1000;
const PREFLIGHT_CACHE_MS = 30_000;
let tmnPreflightCache = null;

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

function redactToken(text) {
  if (!text) return "";
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer ***")
    .replace(/(token|key|secret|password|pin6|login)[^=:]*[:=]\s*([^\s]+)/gi, "$1=***");
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

function isRetryableTmnError(msg, detail = {}) {
  const s = String(msg || "").toLowerCase();
  if (s.includes("sign256 failed")) return true;
  if (s.includes("timeout") || s.includes("etimedout") || s.includes("econn") || s.includes("socket hang up")) {
    return true;
  }
  const status = Number(
    detail?.status ||
    detail?.http_status ||
    detail?.code ||
    detail?.response?.status ||
    detail?.result?.status ||
    detail?.result?.http_status ||
    0
  );
  return status >= 500;
}

function isNonRetryableWithdrawError(errLike) {
  const text = String(
    errLike?.error ??
    errLike?.detail ??
    errLike?.message ??
    errLike?.result?.error ??
    errLike?.result?.message ??
    ""
  ).toLowerCase();
  return (
    text.includes("bank_dest_invalid") ||
    text.includes("fnc-40128004") ||
    text.includes("ewallet_not_supported") ||
    text.includes("dest_same_as_source")
  );
}

function is200(code) {
  return typeof code === "string" && code.endsWith("-200");
}

function requireKey(keys) {
  return (req, res, next) => {
    const k = req.header("x-admin-key");
    if (!k || !keys.includes(k)) {
      if (!k) {
        console.log(`auth_fail missing_x_admin_key ip=${req.ip}`);
        return res.status(401).json({
          ok: false,
          error: "unauthorized",
          message: "missing x-admin-key header",
        });
      }
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
    if (!key) {
      console.log(`auth_fail missing_x_admin_key ip=${req.ip}`);
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "missing x-admin-key header",
      });
    }
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
const requireAdminKey = requireAdmin;

app.get("/api/health", (req, res) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[MMK1000] health request ${req.method} ${req.originalUrl}`);
  }
  return sendOk(res, {
    buildTime: BUILD_TIME,
    pid: process.pid,
    nodeVersion: process.version,
    hasDotenvPath: fs.existsSync(process.env.DOTENV_CONFIG_PATH || ""),
    hasLoginToken: Boolean(String(process.env.TMN_LOGIN_TOKEN || "").trim()),
  });
});

const adminApi = express.Router();
adminApi.use(requireAdmin);
const dashboardEmptyValueLogged = { balance: false, txRes: false };

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

adminApi.get("/doctor/env", (req, res) => {
  const dotenvPath = process.env.DOTENV_CONFIG_PATH || envPath;
  return sendOk(res, {
    TMN_MODE: String(process.env.TMN_MODE || "mock"),
    dotenv_path: dotenvPath,
    port,
  });
});

app.get("/api/tmn/preflight", requireAdminKey, async (req, res) => {
  const now = Date.now();
  if (tmnPreflightCache && now - Number(tmnPreflightCache.ts || 0) < PREFLIGHT_CACHE_MS) {
    return res.status(200).json(tmnPreflightCache);
  }
  const tmn = {
    getBalance: () => tmnGetBalance(getTmnCfg(req)),
  };
  const result = await runPreflight({
    mode: String(process.env.TMN_MODE || "mock"),
    tmn,
  });
  tmnPreflightCache = {
    ok: Boolean(result?.ok),
    mode: String(process.env.TMN_MODE || "mock"),
    ts: now,
    ...(result?.error ? { error: String(result.error) } : {}),
  };
  return res.status(200).json(tmnPreflightCache);
});

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
    const balanceResp0 = await tmnGetBalance(cfg);
    if (balanceResp0?.ok === false && balanceResp0?.error === "tmn_cfg_invalid") {
      return sendErr(res, 400, "tmn_cfg_invalid", { detail: balanceResp0?.detail || {} });
    }
    console.log(`[MMK1000] tx request start=${start} end=${end} limit=20 page=1`);
    const txResp0 = await tmnFetchTx(start, end, 20, 1, cfg);
    if (txResp0?.ok === false && txResp0?.error === "tmn_cfg_invalid") {
      return sendErr(res, 400, "tmn_cfg_invalid", { detail: txResp0?.detail || {} });
    }
    const balanceResp =
      (balanceResp0 && typeof balanceResp0?.balance === "object" && !Array.isArray(balanceResp0.balance) ? balanceResp0.balance : null) ??
      (balanceResp0 && typeof balanceResp0?.res === "object" && !Array.isArray(balanceResp0.res) ? balanceResp0.res : null) ??
      (balanceResp0 && typeof balanceResp0 === "object" && !Array.isArray(balanceResp0) ? balanceResp0 : null);
    const txResp =
      (txResp0 && typeof txResp0?.res === "object" && !Array.isArray(txResp0.res) ? txResp0.res : null) ??
      (txResp0 && typeof txResp0 === "object" && !Array.isArray(txResp0) ? txResp0 : null);
    const balRaw = balanceResp?.balance ?? balanceResp;
    const txRaw  = txResp?.res ?? txResp;
    const balCode = balRaw?.code;
    const txCode = txRaw?.code;
    const balance = {
      value: (balRaw?.data?.current_balance != null) ? Number(balRaw.data.current_balance) : null,
      balance: balRaw,
    };
    const tx = {
      res: txRaw,
      items: txRaw?.data?.activities ?? txRaw?.data?.transactions ?? txRaw?.data?.items ?? [],
    };
    tx.count = Array.isArray(tx.items) ? tx.items.length : 0;
    balance.ok = (typeof balCode === "string" && balCode.endsWith("-200") && Number.isFinite(balance.value));
    tx.ok = (typeof txCode === "string" && txCode.endsWith("-200"));
    const ok = balance.ok && tx.ok;
    const txRes = txRaw;
    const txResEmpty =
      txRes == null ||
      txRes === "" ||
      (typeof txRes === "object" && !Array.isArray(txRes) && Object.keys(txRes).length === 0);
    if (tx?.ok === true && txResEmpty && !dashboardEmptyValueLogged.txRes) {
      console.warn("[MMK1000] dashboard warn: tx.res empty while ok=true");
      dashboardEmptyValueLogged.txRes = true;
    }
    console.log(`dashboard ok=${ok} bal_code=${balCode} tx_code=${txCode} bal_value=${balance.value} tx_count=${tx.count}`);
    return res.status(200).json({
      ok,
      balance,
      tx,
      start,
      end,
    });
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
    const body = req.body || {};
    if (String(body.type || "") === "p2p") {
      body.type = "wallet";
    }
    if (String(body.type || "") === "bank") {
      const dest = body.dest || {};
      const bankCodeRaw = dest.bank_code ?? body.bank_code ?? "";
      const bankAccountRaw = dest.bank_account ?? dest.bank_ac ?? body.bank_account ?? "";
      const bankCode = String(bankCodeRaw || "").trim().replace(/\s+/g, "").toUpperCase();
      const bankAccount = String(bankAccountRaw || "").replace(/\s|-/g, "").trim();
      if (!bankCode || !bankAccount) {
        return sendErr(res, 400, "bank_fields_missing");
      }
      body.dest = {
        ...dest,
        bank_code: bankCode,
        bank_ac: bankAccount,
      };
    }
    const job = await createWithdrawal(body);
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
  let locked = false;
  let sendLogDone = false;
  const logWithdrawSend = (status, ok, err = "") => {
    if (sendLogDone) return;
    sendLogDone = true;
    const id = String(job?.id || req.params.id || "");
    const safeErr = redactToken(String(err || ""));
    console.log(`withdraw_send id=${id} status=${status} ok=${ok} err=${safeErr}`);
  };
  try {
    const badId = String(req.params.id || "");
    if (/[<>]/.test(badId) || badId === "ID") {
      try {
        await markWithdrawalResult(badId, "failed", {
          error: "invalid_id_placeholder",
          at: Date.now(),
        });
      } catch {}
      logWithdrawSend("failed", false, "invalid_id_placeholder");
      return sendErr(res, 400, "invalid_id_placeholder");
    }
    job = await getWithdrawal(req.params.id);
    if (!job) {
      console.log(`withdraw_send_not_found id=${req.params.id}`);
      logWithdrawSend("not_found", false, "not_found");
      return sendErr(res, 404, "not_found");
    }
    if (job.status === "sent") {
      logWithdrawSend("sent", false, "already_sent");
      return sendErr(res, 409, "already_sent");
    }
    if (String(process.env.TMN_MODE || "mock").toLowerCase() !== "real") {
      logWithdrawSend(job.status, false, "MODE_NOT_REAL");
      return sendErr(res, 400, "MODE_NOT_REAL");
    }
    if (job.status !== "approved") {
      logWithdrawSend(job.status, false, "NOT_APPROVED");
      return sendErr(res, 400, "NOT_APPROVED");
    }
    const lastPreflight = tmnPreflightCache;
    if (
      lastPreflight &&
      lastPreflight.ok === false &&
      Date.now() - Number(lastPreflight.ts || 0) <= PREFLIGHT_FAIL_WINDOW_MS
    ) {
      logWithdrawSend(job.status, false, "PREFLIGHT_REQUIRED");
      return sendErr(res, 400, "PREFLIGHT_REQUIRED");
    }
    const typeRaw = String(job?.type || "");
    const type = typeRaw === "p2p" ? "wallet" : typeRaw;
    const sourceMsisdn = String(process.env.TMN_MSISDN ?? "").replace(/\D/g, "");
    const walletDigits = String(job?.dest?.wallet_id ?? job?.dest?.proxy_value ?? "").replace(/\D/g, "");
    if (typeRaw === "p2p") {
      job = { ...job, type: "wallet", dest: { ...(job?.dest || {}), wallet_id: walletDigits } };
    }
    const sameAsSource =
      type === "wallet" &&
      walletDigits !== "" &&
      sourceMsisdn !== "" &&
      walletDigits === sourceMsisdn;
    const destRaw2 = job?.dest?.proxy_value ?? job?.dest?.wallet_id ?? job?.dest?.bank_ac ?? "";
    const destDigits = String(destRaw2 ?? "").replace(/\D/g, "");
    const destLen = destDigits.length || String(destRaw2 ?? "").length;
    console.log("[doctor] withdraw send meta", {
      type,
      amount: Number(job?.amount || 0),
      dest_len: destLen,
      same_as_source: sameAsSource,
    });
    const rid = String(req.requestId || req.get("x-request-id") || req.get("x-rid") || "");
    console.log(`withdraw_send id=${job.id} type=${type} trace=${rid}`);

    if (type === "wallet" && !/^\d{10}$/.test(walletDigits)) {
      try {
        await markWithdrawalResult(job.id, "failed", {
          error: "wallet_dest_invalid",
          hint: "เบอร์ปลายทางต้องเป็น 10 หลัก",
          at: Date.now(),
        });
      } catch {}
      console.log(`withdraw_send_fail id=${job.id} error=wallet_dest_invalid`);
      logWithdrawSend("failed", false, "wallet_dest_invalid");
      return sendErr(res, 400, "wallet_dest_invalid");
    }
    if (sameAsSource) {
      try {
        await markWithdrawalResult(job.id, "failed", {
          error: "dest_same_as_source",
          hint: "ปลายทางห้ามเป็นเบอร์เดียวกับต้นทาง",
          at: Date.now(),
        });
      } catch {}
      console.log(`withdraw_send_fail id=${job.id} error=dest_same_as_source`);
      logWithdrawSend("failed", false, "dest_same_as_source");
      return sendErr(res, 400, "dest_same_as_source");
    }
    if (type === "wallet") {
      const widDigits = String(job?.dest?.wallet_id || "").replace(/\D/g, "");
      if (widDigits && sourceMsisdn && widDigits === sourceMsisdn) {
        try {
          await markWithdrawalResult(job.id, "failed", {
            error: "dest_same_as_source",
            hint: "ปลายทางห้ามเป็นเบอร์เดียวกับต้นทาง",
            at: Date.now(),
          });
        } catch {}
        console.log(`withdraw_send_fail id=${job.id} error=dest_same_as_source`);
        logWithdrawSend("failed", false, "dest_same_as_source");
        return sendErr(res, 400, "dest_same_as_source");
      }
      if (widDigits && !/^\d{10}$/.test(widDigits)) {
        try {
          await markWithdrawalResult(job.id, "failed", {
            error: "wallet_dest_invalid",
            at: Date.now(),
          });
        } catch {}
        logWithdrawSend("failed", false, "wallet_dest_invalid");
        return sendErr(res, 400, "wallet_dest_invalid");
      }
    }
    const dest = job?.dest || {};
    const hasBankField = Object.keys(dest).some((k) => k.startsWith("bank_"));
    if (type === "bank" || hasBankField) {
      const bankCode = String(dest.bank_code || "").trim().replace(/\s+/g, "").toUpperCase();
      const bankAccount = String(dest.bank_account ?? dest.bank_ac ?? "").trim();
      if (!BANK_CODE_ALLOWLIST.has(bankCode) || !/^\d+$/.test(bankAccount) || bankAccount.length < 10) {
        try {
          await markWithdrawalResult(job.id, "failed", {
            error: "bank_dest_invalid",
            hint: "bank_code/bank_account ไม่ถูกต้อง",
            at: Date.now(),
          });
        } catch {}
        logWithdrawSend("failed", false, "bank_dest_invalid");
        return sendErr(res, 400, "bank_dest_invalid");
      }
    }

    const destLast4 = String(destRaw2).slice(-4);
    console.log(`withdraw_send_start id=${job.id} type=${type} dest_len=${destLen} amt=${job.amount}`);
    // BLOCK: PromptPay แบบ E-Wallet ID (15 หลัก) ยังไม่รองรับในโหมด real
    if ((process.env.TMN_MODE || "mock") === "real" && type === "promptpay") {
      const pv = String(job?.dest?.proxy_value ?? "").replace(/\D/g, "");
      if (destLen === 15) {
        const hint = "TMNOne transferQRPromptpay รองรับเฉพาะ เบอร์โทร/บัตรประชาชน (E-Wallet ID 15 หลักให้ใช้ช่องทางอื่น)";
        try {
          await markWithdrawalResult(job.id, "failed", {
            error: "ewallet_not_supported",
            hint,
            at: Date.now(),
          });
        } catch {}
        console.log(`withdraw_send_fail id=${job.id} error=ewallet_not_supported`);
        logWithdrawSend("failed", false, "ewallet_not_supported");
        return sendErr(res, 400, "ewallet_not_supported", { hint });
      }
    }
    if ((process.env.TMN_MODE || "mock") === "real") {
      const cfg = getTmnCfg(req);
      const missing = missingTmnFields(cfg);
      if (missing.length) {
        try {
          await markWithdrawalResult(job.id, "failed", {
            error: "tmn_cfg_missing",
            missing_fields: missing,
            at: Date.now(),
          });
        } catch {}
        logWithdrawSend("failed", false, "tmn_cfg_missing");
        return sendErr(res, 400, "tmn_cfg_missing", { missing_fields: missing });
      }
    }
    if (!tryLock(job.id)) {
      logWithdrawSend(job.status, false, "locked");
      return sendErr(res, 409, "locked");
    }
    locked = true;
    // NOTE: real mode TMNOne transferQRPromptpay ระบุรองรับ “เบอร์/บัตร” :contentReference[oaicite:6]{index=6}
    await backupWithdrawQueue();
    let r;
    try {
      r = await tmnSendTransfer(job, getTmnCfg(req));
    } catch (e) {
      if (e?.error === "tmn_cfg_invalid") {
        logWithdrawSend(job?.status || "unknown", false, "tmn_cfg_invalid");
        return sendErr(res, 400, "tmn_cfg_invalid", {
          detail: e?.detail || {},
          hint: "ต้องอัปเดต key/session ให้ตรงกัน",
        });
      }
      if (isRetryableTmnError(e?.message, e)) {
        console.log(`[MMK1000] tmn_unavailable reason=sign256_failed id=${job?.id || req.params.id}`);
        logWithdrawSend(job?.status || "unknown", false, "tmn_unavailable");
        return res.status(503).json({ ok: false, error: "tmn_unavailable", message: "sign256 failed" });
      }
      throw e;
    }
    if (r?.ok === false && r?.error === "tmn_cfg_invalid") {
      await markWithdrawalResult(job.id, "failed", r);
      logWithdrawSend(job?.status || "unknown", false, "tmn_cfg_invalid");
      return sendErr(res, 400, "tmn_cfg_invalid", {
        detail: r?.detail || {},
        hint: "ต้องอัปเดต key/session ให้ตรงกัน",
      });
    }
    if (!r?.ok || r?.result?.error || r?.error) {
      const failPayload = r || { error: "tmn_transfer_failed", detail: "empty transfer response" };
      const detail = r?.result?.error || r?.error || r?.message || r?.result?.message || "transfer failed";
      const saved = await markWithdrawalResult(job.id, "failed", failPayload);
      console.log(`[tmn_send_fail] id=${saved.id} type=${job.type} dest_last4=${destLast4} amt=${job.amount} err=${redactToken(detail)}`);
      logWithdrawSend(saved.status, false, detail);
      return sendErr(res, 500, "tmn_transfer_failed", { detail });
    }
    if (String(process.env.TMN_MODE || "mock").toLowerCase() === "real" && r?.mock === true) {
      await markWithdrawalResult(job.id, "failed", {
        error: "bank_mock_in_real",
        raw: r,
      });
      logWithdrawSend("failed", false, "bank_mock_in_real");
      return sendErr(res, 502, "tmn_transfer_failed", { detail: "bank_mock_in_real" });
    }
    const errorLevel1 = r?.error;
    const errorLevel2 = r?.result?.error;
    const errorLevel3 = r?.result?.result?.error;
    const failMsgRaw = [
      r?.message,
      r?.result?.message,
      r?.result?.result?.message,
    ]
      .filter((v) => v !== undefined && v !== null)
      .map((v) => String(v))
      .join(" ");
    const sendSuccess =
      r?.ok === true &&
      !errorLevel1 &&
      !errorLevel2 &&
      !errorLevel3;
    if (!sendSuccess) {
      const detail = errorLevel3 || errorLevel2 || errorLevel1 || failMsgRaw || "transfer failed";
      const saved = await markWithdrawalResult(job.id, "failed", r);
      console.log(`[tmn_send_fail] id=${saved.id} type=${job.type} dest_last4=${destLast4} amt=${job.amount} err=${redactToken(detail)}`);
      logWithdrawSend(saved.status, false, detail);
      return sendErr(res, 502, "tmn_transfer_failed", { detail });
    }
    const okCode = String(r?.result?.code || "ok");
    console.log(`withdraw_send_ok id=${job.id} code=${okCode}`);
    const saved = await markWithdrawalResult(job.id, "sent", r);
    console.log(`[tmn_send_ok] id=${saved.id} type=${job.type} dest_last4=${destLast4} amt=${job.amount}`);
    logWithdrawSend(saved.status, true, "");
    return sendOk(res, { job: saved });
  } catch (e) {
    if (e?.error === "tmn_cfg_invalid") {
      logWithdrawSend(job?.status || "unknown", false, "tmn_cfg_invalid");
      return sendErr(res, 400, "tmn_cfg_invalid", {
        detail: e?.detail || {},
        hint: "ต้องอัปเดต key/session ให้ตรงกัน",
      });
    }
    const detail = String(e?.message || e || "tmn unavailable");
    if (String(e?.message || "") === "already_sent") {
      logWithdrawSend("sent", false, "already_sent");
      return sendErr(res, 409, "already_sent");
    }
    if (isRetryableTmnError(e?.message, e)) {
      console.log(`[MMK1000] tmn_unavailable reason=sign256_failed id=${req.params.id}`);
      logWithdrawSend(job?.status || "unknown", false, "tmn_unavailable");
      return res.status(503).json({ ok: false, error: "tmn_unavailable", message: "sign256 failed" });
    }
    try { await markWithdrawalResult(req.params.id, "failed", { error: String(e?.message || e) }); } catch {}
    console.log(`[doctor] withdraw ${req.params.id} ${job?.status || "unknown"} -> failed persisted=${WITHDRAW_STORAGE_PATH}`);
    logWithdrawSend(job?.status || "unknown", false, detail);
    return sendErr(res, 500, e);
  } finally {
    if (locked && job?.id) unlock(job.id);
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
const bootDotenvPath = process.env.DOTENV_CONFIG_PATH || envPath;
const bootHasDotenvPath = fs.existsSync(bootDotenvPath);
const bootHasLoginToken = Boolean(String(process.env.TMN_LOGIN_TOKEN || "").trim());
const bootTs = new Date().toISOString();
console.log(`[BOOT] process.env.TMN_MODE=${String(process.env.TMN_MODE || "")} dotenv_path_used=${bootDotenvPath} mode_selected=${envCheck.mode}`);
console.log(`[BOOT] dotenv_path=${bootDotenvPath || "(empty)"} exists=${bootHasDotenvPath} hasLoginToken=${bootHasLoginToken} nodeVersion=${process.version}`);
console.log(`[BOOT] listen_target=${host}:${port} TMN_MODE=${String(process.env.TMN_MODE || "mock")}`);
console.log(`[BOOT] ts=${bootTs} pid=${process.pid} host=${host} port=${port} mode=${String(process.env.TMN_MODE || "mock")}`);
console.log(`[MMK1000] startup mode=${envCheck.mode} host=${host} port=${port} pid=${process.pid}`);
console.log(`[MMK1000] build=${Date.now()} pid=${process.pid} port=${port} mode=${process.env.TMN_MODE}`);
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
const server = app.listen(port, host, () => {
  startupPhase = false;
  console.log(`[MMK1000] server_listening host=${host} port=${port} mode=${String(process.env.TMN_MODE || "mock")} pid=${process.pid} url=http://${host}:${port}`);
});
server.on("error", (err) => {
  logStartupCrash(err, "listen_error");
  const ts = new Date().toISOString();
  const mode = String(process.env.TMN_MODE || "mock");
  const msg = String(err?.message || err);
  if (err?.code === "EADDRINUSE") {
    console.error(`[MMK1000] listen_error ts=${ts} code=EADDRINUSE host=${host} port=${port} mode=${mode} pid=${process.pid} message=${msg}`);
    process.exit(1);
  }
  console.error(`[MMK1000] listen_error ts=${ts} code=${String(err?.code || "UNKNOWN")} host=${host} port=${port} pid=${process.pid} mode=${mode} message=${msg}`);
  process.exitCode = 1;
  process.exit(1);
});
