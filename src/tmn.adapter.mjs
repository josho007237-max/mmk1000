import "dotenv/config";
import TMNOne from "../TMNOne.js";

const MODE = (process.env.TMN_MODE || "mock").toLowerCase();

let tmnSingleton = null;
let buildPromise = null;
let loginPromise = null;
let loggedIn = false;
let preflightDone = false;
let lastFingerprint = "";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function resolveCfg(cfg = {}) {
  return {
    keyid: cfg.keyid || process.env.TMNONE_KEYID || "",
    msisdn: cfg.msisdn || process.env.TMN_MSISDN || "",
    loginToken: cfg.loginToken || process.env.TMN_LOGIN_TOKEN || "",
    tmnId: cfg.tmnId || process.env.TMN_TMN_ID || "",
    deviceId: cfg.deviceId || process.env.TMN_DEVICE_ID || "",
    pin6: cfg.pin6 || process.env.TMN_PIN6 || "",
    proxyIp: cfg.proxyIp || process.env.PROXY_IP || "",
    proxyUser: cfg.proxyUser || process.env.PROXY_USERNAME || "",
    proxyPass: cfg.proxyPass || process.env.PROXY_PASSWORD || "",
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

function fingerprint(cfg) {
  return [
    cfg.keyid, cfg.msisdn, cfg.loginToken, cfg.tmnId, cfg.deviceId,
    cfg.pin6, cfg.proxyIp, cfg.proxyUser, cfg.proxyPass
  ].join("|");
}

async function buildRealClient(cfgInput = {}) {
  const cfg = resolveCfg(cfgInput);
  validateRealCfg(cfg);
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

      const sig = await tmnSingleton.calculate_sign256("ping");
      if (!sig) {
        throw new Error("[TMN real] Empty signature (check KeyID/LoginToken pairing)");
      }
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
  validateRealCfg(cfg);
  const fp = fingerprint(cfg);
  if (loggedIn && fp === lastFingerprint) return;
  if (!loginPromise) {
    loginPromise = (async () => {
      const tmn = await buildRealClient(cfg);
      const res = await tmn.loginWithPin6(cfg.pin6);
      if (res?.error) throw new Error(res.error);
      loggedIn = true;
    })();
  }

  try {
    await loginPromise;
  } finally {
    loginPromise = null;
  }
}

export async function tmnGetBalance(cfg) {
  if (MODE === "mock") return { ok: true, mode: "mock", balance: 12345.67 };
  await ensureLogin(cfg);
  const tmn = tmnSingleton;
  const balance = await tmn.getBalance();
  return { ok: true, mode: "real", balance };
}

export async function tmnFetchTx(start, end, limit = 20, page = 1, cfg) {
  if (MODE === "mock") {
    return {
      ok: true,
      mode: "mock",
      start, end, limit, page,
      items: [
        { report_id: "mock-in-1", type: "IN", amount: 500, at: new Date().toISOString() },
        { report_id: "mock-out-1", type: "OUT", amount: 200, at: new Date().toISOString() },
      ],
    };
  }
  await ensureLogin(cfg);
  const tmn = tmnSingleton;
  const res = await tmn.fetchTransactionHistory(start, end, limit, page);
  return { ok: true, mode: "real", res };
}

export async function tmnSendTransfer(job, cfg) {
  if (MODE === "mock") {
    return { ok: true, mode: "mock", result: { report_id: `mock-${Date.now()}`, job } };
  }

  await ensureLogin(cfg);
  const tmn = tmnSingleton;

  if (job.type === "bank") {
    const pin6 = resolveCfg(cfg).pin6;
    const r = await tmn.transferBankAC(job.dest.bank_code, job.dest.bank_ac, job.amount, pin6);
    return { ok: true, mode: "real", result: r };
  }
  if (job.type === "promptpay") {
    const r = await tmn.transferQRPromptpay(job.dest.proxy_value, job.amount);
    return { ok: true, mode: "real", result: r };
  }
  if (job.type === "wallet") {
    const r = await tmn.transferP2P(job.dest.wallet_id, job.amount, job.note || "");
    return { ok: true, mode: "real", result: r };
  }

  throw new Error("unsupported_withdraw_type");
}
