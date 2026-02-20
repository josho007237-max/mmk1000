import "dotenv/config";
import TMNOne from "../TMNOne.js";

const MODE = (process.env.TMN_MODE || "mock").toLowerCase();
const is401 = (c) => typeof c === "string" && c.endsWith("-401");

// Observability: count shield-id retries surfaced by downstream responses
let SHIELD_RETRY_COUNT = 0;

let tmnSingleton = null;
let buildPromise = null;
let loginPromise = null;
let loggedIn = false;
let preflightDone = false;
let lastFingerprint = "";
let sign256PreflightWarned = false;

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function resolveCfg(cfg = {}) {
  const pick = (v, envV) => {
    const s = String(v ?? "").trim();
    if (s !== "") return s;
    return String(envV ?? "").trim();
  };
  return {
    keyid: pick(cfg.keyid, process.env.TMNONE_KEYID),
    msisdn: pick(cfg.msisdn, process.env.TMN_MSISDN),
    loginToken: pick(cfg.loginToken, process.env.TMN_LOGIN_TOKEN),
    tmnId: pick(cfg.tmnId, process.env.TMN_TMN_ID),
    deviceId: pick(cfg.deviceId, process.env.TMN_DEVICE_ID),
    pin6: pick(cfg.pin6, process.env.TMN_PIN6),
    proxyIp: pick(cfg.proxyIp, process.env.PROXY_IP),
    proxyUser: pick(cfg.proxyUser, process.env.PROXY_USERNAME),
    proxyPass: pick(cfg.proxyPass, process.env.PROXY_PASSWORD),
  };
}

function validateRealCfg(cfg) {
  if (MODE !== "real") return;
  const missing = [];
  if (!cfg.keyid) missing.push("TMNONE_KEYID");
  if (!cfg.msisdn) missing.push("TMN_MSISDN");
  if (!cfg.loginToken) missing.push("TMN_LOGIN_TOKEN");
  if (!cfg.tmnId) missing.push("TMN_TMN_ID");
  if (!cfg.pin6) missing.push("TMN_PIN6");
  if (missing.length) {
    throw new Error(`[TMN real] Missing: ${missing.join(",")}`);
  }
}

function assertCoreCfg(cfg) {
  const s = (v) => String(v ?? "").trim();
  const missing = [];
  if (s(cfg.keyid) === "") missing.push("keyid");
  if (s(cfg.loginToken) === "") missing.push("loginToken");
  if (s(cfg.tmnId) === "") missing.push("tmnId");
  if (s(cfg.deviceId) === "") missing.push("deviceId");
  if (s(cfg.msisdn) === "") missing.push("msisdn");
  if (missing.length) {
    const err = new Error("tmn_cfg_missing");
    err.code = "tmn_cfg_missing";
    err.missing_fields = missing;
    throw err;
  }
}

function isRetryableTmnError(reason = "", detail = {}) {
  const s = String(reason || "").toLowerCase();
  if (s.includes("invalid encrypted")) return false;
  if (s.includes("signature empty")) return false;
  if (s.includes("tmn_unavailable")) return true;
  if (s.includes("sign256 failed")) return true;
  if (s.includes("timeout") || s.includes("econn") || s.includes("etimedout")) return true;
  const status = Number(detail?.status || detail?.http_status || detail?.code || 0);
  if (status >= 500) return true;
  return false;
}

function toTmnUnavailable(reason = "tmn_unavailable", detail = {}) {
  return {
    ok: false,
    retryable: true,
    error: "tmn_unavailable",
    detail: {
      status: Number(detail?.status || detail?.http_status || detail?.code || 0),
      data_snip: String(detail?.data_snip || detail?.snip || detail?.data || "").slice(0, 300),
      reason: String(reason || "tmn_unavailable"),
    },
  };
}

function tryParseJson(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isInvalidEncryptedPayload(obj = {}) {
  if (!obj) return false;
  const responseDataRaw = obj?.response?.data;
  const responseData =
    typeof responseDataRaw === "string"
      ? (tryParseJson(responseDataRaw) || {})
      : (responseDataRaw || {});
  const code = Number(
    obj?.code ||
    obj?.status ||
    obj?.http_status ||
    obj?.response?.status ||
    responseData?.code ||
    responseData?.status ||
    responseData?.http_status ||
    0
  );
  const messages = [
    obj?.message,
    obj?.error,
    obj?.result?.error,
    responseData?.message,
    responseData?.error,
    responseData?.result?.error,
    responseData?.result?.message,
    (obj instanceof Error ? obj.message : ""),
  ]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);
  const isInvalidEncrypted = messages.some((m) => m === "invalid encrypted");
  return code === 400 && isInvalidEncrypted;
}

function toTmnCfgInvalid(detail = {}) {
  const responseDataRaw = detail?.response?.data;
  const responseData =
    typeof responseDataRaw === "string"
      ? (tryParseJson(responseDataRaw) || {})
      : (responseDataRaw || {});
  const status = Number(
    detail?.status ||
    detail?.http_status ||
    detail?.code ||
    detail?.response?.status ||
    responseData?.status ||
    responseData?.http_status ||
    responseData?.code ||
    0
  );
  const message = String(
    detail?.message ||
    detail?.error ||
    detail?.result?.error ||
    responseData?.message ||
    responseData?.error ||
    responseData?.result?.error ||
    ""
  ).slice(0, 300);
  return {
    ok: false,
    retryable: false,
    error: "tmn_cfg_invalid",
    detail: {
      reason: "keyid_loginToken_mismatch",
      ...(status ? { status } : {}),
      ...(message ? { message } : {}),
    },
  };
}

function fingerprint(cfg) {
  return [
    cfg.keyid, cfg.msisdn, cfg.loginToken, cfg.tmnId, cfg.deviceId,
    cfg.pin6, cfg.proxyIp, cfg.proxyUser, cfg.proxyPass
  ].join("|");
}

async function buildRealClient(cfgInput = {}) {
  const cfg = resolveCfg(cfgInput);
  if (String(cfg.loginToken || "").trim() === "") {
    return toTmnCfgInvalid();
  }
  validateRealCfg(cfg);
  assertCoreCfg(cfg);
  const fp = fingerprint(cfg);

  if (tmnSingleton && preflightDone && fp === lastFingerprint) return tmnSingleton;
  if (!buildPromise) {
    buildPromise = (async () => {
      if (!tmnSingleton || fp !== lastFingerprint) {
        const tmn = new TMNOne();
        tmn.setData(
          cfg.keyid,
          cfg.msisdn,
          cfg.loginToken,
          cfg.tmnId,
          cfg.deviceId || ""
        );

        if (cfg.proxyIp) {
          tmn.setProxy(
            cfg.proxyIp,
            cfg.proxyUser || "",
            cfg.proxyPass || ""
          );
        }

        tmnSingleton = tmn;
        preflightDone = false;
        loggedIn = false;
        lastFingerprint = fp;
      }

      const sig = await tmnSingleton.calculate_sign256("PING");
      const siglen = (typeof sig === "string") ? sig.length : 0;
      if (siglen !== 64) {
        if (!sign256PreflightWarned) {
          console.warn(`[TMN real] sign256 invalid siglen=${siglen}`);
          sign256PreflightWarned = true;
        }
        throw new Error("sign256 failed");
      }
      sign256PreflightWarned = false;
      preflightDone = true;
      return tmnSingleton;
    })();
  }

  try {
    return await buildPromise;
  } finally {
    if (!preflightDone) buildPromise = null;
  }
}

async function ensureLogin(cfgInput = {}) {
  const cfg = resolveCfg(cfgInput);
  if (String(cfg.loginToken || "").trim() === "") {
    return toTmnCfgInvalid();
  }
  validateRealCfg(cfg);
  assertCoreCfg(cfg);
  const fp = fingerprint(cfg);
  if (loggedIn && fp === lastFingerprint) return;
  if (!loginPromise) {
    loginPromise = (async () => {
      const tmn = await buildRealClient(cfg);
      if (tmn?.ok === false) return tmn;
      assertCoreCfg(cfg);
      const res = await tmn.loginWithPin6(cfg.pin6);
      if (res?.error) throw new Error(res.error);
      loggedIn = true;
      return;
    })();
  }

  try {
    return await loginPromise;
  } finally {
    loginPromise = null;
  }
}

function safeKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.keys(obj);
}

export async function tmnGetBalance(cfg) {
  if (MODE === "mock") return { ok: true, mode: "mock", balance: 12345.67 };
  const loginState = await ensureLogin(cfg);
  if (loginState?.ok === false) return loginState;
  const cfgResolved = resolveCfg(cfg);
  const tmn = tmnSingleton;
  let r = await tmn.getBalance();
  if (is401(r?.code)) {
    const relogin = await tmn.loginWithPin6(process.env.TMN_PIN6 || cfgResolved.pin6);
    if (relogin?.error) throw new Error(relogin.error);
    r = await tmn.getBalance();
  }
  console.log("[MMK1000] balance resp summary", {
    keys: safeKeys(r),
    data_keys: safeKeys(r?.data),
  });
  return { ok: true, mode: "real", balance: r ?? {} };
}

export async function tmnFetchTx(start, end, limit = 20, page = 1, cfg) {
  if (MODE === "mock") {
    const res = {
      data: {
        activities: [
          { report_id: "mock-in-1", type: "IN", amount: 500, at: new Date().toISOString() },
          { report_id: "mock-out-1", type: "OUT", amount: 200, at: new Date().toISOString() },
        ],
      },
    };
    const items = res?.data?.activities ?? res?.data?.transactions ?? res?.data?.items ?? [];
    const count = Array.isArray(items) ? items.length : 0;
    return {
      ok: true,
      mode: "mock",
      start, end, limit, page,
      res,
      count,
      items,
    };
  }
  const loginState = await ensureLogin(cfg);
  if (loginState?.ok === false) return loginState;
  const cfgResolved = resolveCfg(cfg);
  const tmn = tmnSingleton;
  let r = await tmn.fetchTransactionHistory(start, end, limit, page);
  if (is401(r?.code)) {
    const relogin = await tmn.loginWithPin6(process.env.TMN_PIN6 || cfgResolved.pin6);
    if (relogin?.error) throw new Error(relogin.error);
    r = await tmn.fetchTransactionHistory(start, end, limit, page);
  }
  const items = r?.data?.activities ?? r?.data?.transactions ?? r?.data?.items ?? [];
  const count = Array.isArray(items) ? items.length : 0;
  console.log("[MMK1000] tx resp summary", {
    keys: safeKeys(r),
    data_keys: safeKeys(r?.data),
    count,
  });
  if (!Array.isArray(items)) {
    return { ok: false, mode: "real", error: "tx_parse_failed" };
  }
  return { ok: true, mode: "real", res: r ?? {}, count, items };
}

export async function tmnSendTransfer(job, cfg) {
  if (MODE === "mock") {
    return { ok: true, mode: "mock", result: { report_id: `mock-${Date.now()}`, job } };
  }

  if (job.type === "bank") {
    const dest = job?.dest || {};
    const bankCode = String(dest.bank_code || "").trim().toUpperCase();
    let bankAc = dest.bank_ac ?? dest.bank_account ?? dest.account ?? dest.account_no ?? "";
    bankAc = String(bankAc).replace(/\s|-/g, "").trim();
    if (!bankCode || !/^\d+$/.test(bankAc)) {
      return { error: "bank_dest_invalid", result: { error: "bank_dest_invalid" } };
    }
  }

  try {
    const loginState = await ensureLogin(cfg);
    if (loginState?.ok === false) return loginState;
  } catch (e) {
    if (/signature empty/i.test(String(e?.message || e || ""))) {
      return toTmnCfgInvalid(e);
    }
    if (isInvalidEncryptedPayload(e)) {
      return toTmnCfgInvalid(e);
    }
    const reason = e?.message || e;
    if (isRetryableTmnError(reason, e)) {
      return toTmnUnavailable(reason, e);
    }
    throw e;
  }
  const tmn = tmnSingleton;

  const wrap = (kind, res) => {
    if (isInvalidEncryptedPayload(res)) {
      return toTmnCfgInvalid(res);
    }
    const draftTransactionId = res?.draft_transaction_id || res?.data?.draft_transaction_id;
    const toText = (val) => {
      if (val === null || val === undefined) return "";
      if (typeof val === "string") return val;
      if (typeof val === "object") return String(val?.message || "");
      return String(val);
    };
    const errorLevel1 = res?.error;
    const errorLevel2 = res?.result?.error;
    const errorLevel3 = res?.result?.result?.error;
    const resultErrorText = toText(errorLevel2);
    const nestedResultErrorText = toText(errorLevel3);
    const resultMessageText = toText(res?.result?.message);
    const nestedResultMessageText = toText(res?.result?.result?.message);
    const errText = [
      toText(errorLevel1),
      toText(res?.message),
      toText(errorLevel2),
      toText(errorLevel3),
      resultMessageText,
      nestedResultMessageText,
    ].filter(Boolean).join(" | ");
    const shieldExpired = /shield_id is expired/i.test(errText);
    const recipientNotVerified =
      /trc-55407/i.test(errText) || /register and verify their identity/i.test(errText);
    const hasError = Boolean(errorLevel1) || Boolean(errorLevel2) || Boolean(errorLevel3);
    const ok = !hasError && !shieldExpired && !recipientNotVerified;
    if (shieldExpired) SHIELD_RETRY_COUNT += 1;
    let retryable = isRetryableTmnError(
      errText || toText(errorLevel3) || toText(errorLevel2) || toText(errorLevel1) || res?.message || resultMessageText || nestedResultMessageText,
      res
    );
    if (shieldExpired) retryable = true;
    if (recipientNotVerified) retryable = false;
    const errorText =
      toText(errorLevel3) ||
      toText(errorLevel2) ||
      toText(errorLevel1) ||
      nestedResultMessageText ||
      resultErrorText ||
      resultMessageText ||
      toText(res?.message) ||
      "transfer_failed";
    return {
      ok,
      retryable,
      mode: "real",
      kind,
      result: res,
      ...(draftTransactionId ? { draft_transaction_id: draftTransactionId } : {}),
      ...(ok ? {} : {
        error: errorText,
        shield_expired: shieldExpired,
        ...(recipientNotVerified ? { code: "recipient_not_verified" } : {}),
      }),
      shield_retry_count: SHIELD_RETRY_COUNT,
    };
  };

  if (job.type === "bank") {
    const pin6 = resolveCfg(cfg).pin6;
    const dest = job?.dest || {};
    const bankCode = String(dest.bank_code || "").trim().toUpperCase();
    let bankAc = dest.bank_ac ?? dest.bank_account ?? dest.account ?? dest.account_no ?? "";
    bankAc = String(bankAc).replace(/\s|-/g, "").trim();
    const r = await tmn.transferBankAC(bankCode, bankAc, job.amount, pin6);
    return wrap("bank", r);
  }
  if (job.type === "p2p") {
    const to = job.dest?.proxy_value;
    const r = await tmn.transferP2P(to, job.amount, job.note || "");
    return wrap("p2p", r);
  }
  if (job.type === "promptpay") {
    const r = await tmn.transferQRPromptpay(job.dest.proxy_value, job.amount);
    return wrap("promptpay", r);
  }
  if (job.type === "wallet") {
    const r = await tmn.transferP2P(job.dest.wallet_id, job.amount, job.note || "");
    return wrap("wallet", r);
  }

  throw new Error("unsupported_withdraw_type");
}
