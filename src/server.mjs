import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { tmnGetBalance, tmnFetchTx, tmnSendTransfer } from "./tmn.adapter.mjs";
import {
  ensureDataDir, listWithdrawals, createWithdrawal,
  approveWithdrawal, markWithdrawalResult, getWithdrawal
} from "./withdraw.store.mjs";

import { decodeQrPayloadFromImage, tryParsePromptPay } from "./qr.decode.mjs";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 4100);
const ADMIN_KEY = process.env.ADMIN_KEY || "devkey";
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
const WITHDRAW_DATA_DIR = path.resolve(process.cwd(), "data");
const WITHDRAW_QUEUE_FILE = path.join(WITHDRAW_DATA_DIR, "withdraw-queue.json");

function missingTmnFields(cfg = {}) {
  const missing = [];
  const check = (k) => {
    if (typeof cfg[k] !== "string" || !cfg[k].trim()) missing.push(k);
  };
  check("keyid");
  check("msisdn");
  check("loginToken");
  check("tmnId");
  check("deviceId");
  check("pin6");
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
  const g = (k) => req.get(k) || "";
  return {
    keyid: g("x-tmn-keyid") || process.env.TMNONE_KEYID || "",
    msisdn: g("x-tmn-msisdn") || process.env.TMN_MSISDN || "",
    loginToken: g("x-tmn-login-token") || process.env.TMN_LOGIN_TOKEN || "",
    tmnId: g("x-tmn-tmn-id") || process.env.TMN_TMN_ID || "",
    deviceId: g("x-tmn-device-id") || process.env.TMN_DEVICE_ID || "",
    pin6: g("x-tmn-pin6") || process.env.TMN_PIN6 || "",
    proxyIp: g("x-tmn-proxy-ip") || process.env.PROXY_IP || "",
    proxyUser: g("x-tmn-proxy-user") || process.env.PROXY_USERNAME || "",
    proxyPass: g("x-tmn-proxy-pass") || process.env.PROXY_PASSWORD || "",
  };
}

function validateEnv() {
  const mode = String(process.env.TMN_MODE || "mock").toLowerCase();
  if (mode !== "real") return;
  const required = [
    "TMNONE_KEYID",
    "TMN_MSISDN",
    "TMN_LOGIN_TOKEN",
    "TMN_TMN_ID",
    "TMN_DEVICE_ID",
    "TMN_PIN6",
    "PROXY_IP",
    "PROXY_USERNAME",
    "PROXY_PASSWORD",
  ];
  for (const key of required) {
    if (!String(process.env[key] || "").trim()) {
      throw new Error(`missing_real_config:${key}`);
    }
  }
}

function sendOk(res, data = {}, status = 200) {
  return res.status(status).json({ ...data, ok: true });
}

function sendErr(res, status, error, extra = {}) {
  const msg = typeof error === "string" ? error : String(error?.message || error);
  const message = msg || String(error || "unknown_error");
  return res.status(status).json({ ...extra, ok: false, error: msg, message });
}

function requireAdmin(req, res, next) {
  const k = req.headers["x-admin-key"];
  if (!k || k !== ADMIN_KEY) {
    if (DEBUG_HEADERS) {
      console.log("[MMK1000] unauthorized headers", redactHeaders(req.headers));
    }
    return sendErr(res, 401, "unauthorized");
  }
  next();
}

app.get("/api/health", (req, res) => sendOk(res, {}));

const adminApi = express.Router();
adminApi.use(requireAdmin);

if (process.env.NODE_ENV !== "production") {
  adminApi.get("/routes", (req, res) => {
    sendOk(res, {
      routes: [
        { method: "GET", path: "/api/health" },
        { method: "GET", path: "/api/routes" },
        { method: "GET", path: "/api/dashboard" },
        { method: "POST", path: "/api/qr/decode" },
        { method: "GET", path: "/api/withdraw/queue" },
        { method: "POST", path: "/api/withdraw/create" },
        { method: "POST", path: "/api/withdraw/:id/approve" },
        { method: "POST", path: "/api/withdraw/:id/send" },
      ],
    });
  });
}

adminApi.get("/dashboard", async (req, res) => {
  try {
    const start = String(req.query.start || new Date(Date.now() - 86400_000).toISOString().slice(0, 10));
    const end   = String(req.query.end   || new Date(Date.now() + 86400_000).toISOString().slice(0, 10));
    const cfg = getTmnCfg(req);
    const balance = await tmnGetBalance(cfg);
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
    console.log(`[doctor] withdraw ${job.id} new -> ${job.status} persisted=${WITHDRAW_QUEUE_FILE}`);
    sendOk(res, { job });
  }
  catch (e) { sendErr(res, 400, e); }
});

adminApi.post("/withdraw/:id/approve", async (req, res) => {
  try {
    const job = await approveWithdrawal(req.params.id);
    console.log(`[doctor] withdraw ${job.id} pending -> ${job.status} persisted=${WITHDRAW_QUEUE_FILE}`);
    sendOk(res, { job });
  }
  catch (e) { sendErr(res, 400, e); }
});

adminApi.post("/withdraw/:id/send", async (req, res) => {
  let job;
  try {
    job = await getWithdrawal(req.params.id);
    if (!job) return sendErr(res, 404, "not_found");
    if (job.status === "sent") return sendErr(res, 409, "already_sent");
    if (job.status !== "approved") return sendErr(res, 400, "not_approved");
        // BLOCK: PromptPay แบบ E-Wallet ID (15 หลัก) ยังไม่รองรับในโหมด real
    if ((process.env.TMN_MODE || "mock") === "real" && job?.type === "promptpay") {
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
    const saved = await markWithdrawalResult(job.id, "sent", r);
    console.log(`[doctor] withdraw ${saved.id} ${job.status || "unknown"} -> ${saved.status} persisted=${WITHDRAW_QUEUE_FILE}`);
    sendOk(res, { job: saved });
  } catch (e) {
    try { await markWithdrawalResult(req.params.id, "failed", { error: String(e?.message || e) }); } catch {}
    console.log(`[doctor] withdraw ${req.params.id} ${job?.status || "unknown"} -> failed persisted=${WITHDRAW_QUEUE_FILE}`);
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

validateEnv();
await ensureDataDir();
console.log("[doctor] cwd=", process.cwd());
console.log("[doctor] withdraw queue file=", WITHDRAW_QUEUE_FILE);
console.log("[doctor] withdraw source=withdraw.store.mjs");
console.log("[doctor] single source of truth: withdraw-queue.json");
console.log("[MMK1000] TMN_MODE=", process.env.TMN_MODE || "mock");
app.listen(PORT, () => console.log(`[MMK1000] http://127.0.0.1:${PORT}`));
