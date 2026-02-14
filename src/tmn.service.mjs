import "dotenv/config";
import TMNOne from "../TMNOne.js";

const isMock = (process.env.TMN_MODE || "").toLowerCase() === "mock";

function assertCoreCfg(cfg) {
  const keyid = Number(cfg.keyid);
  if (!Number.isFinite(keyid) || keyid <= 0 || !cfg.loginToken || !cfg.tmnId || !cfg.deviceId) {
    throw new Error("TMN cfg missing: keyid/loginToken/tmnId/deviceId");
  }
}

function envCfg() {
  return {
    keyid: process.env.TMNONE_KEYID || "",
    msisdn: process.env.TMN_MSISDN || "",
    loginToken: process.env.TMN_LOGIN_TOKEN || "",
    tmnId: process.env.TMN_TMN_ID || "",
    deviceId: process.env.TMN_DEVICE_ID || "",
  };
}

export async function tmnGetBalance() {
  if (isMock) return { ok: true, mode: "mock", balance: 12345.67 };

  // โหมดจริง (พอมีครบค่อยเปิด)
  const cfg = envCfg();
  assertCoreCfg(cfg);
  const tmn = new TMNOne();
  tmn.setData(
    cfg.keyid,
    cfg.msisdn,
    cfg.loginToken,
    cfg.tmnId,
    cfg.deviceId
  );
  if (process.env.PROXY_IP) {
    tmn.setProxy(
      process.env.PROXY_IP,
      process.env.PROXY_USERNAME || "",
      process.env.PROXY_PASSWORD || ""
    );
  }
  assertCoreCfg(cfg);
  await tmn.loginWithPin6(process.env.TMN_PIN6);
  const balance = await tmn.getBalance();
  return { ok: true, mode: "real", balance };
}

export async function tmnFetchTx(start, end, limit = 10, page = 1) {
  if (isMock) {
    return {
      ok: true,
      mode: "mock",
      items: [
        { id: "mock-1", type: "IN", amount: 500, at: new Date().toISOString() },
        { id: "mock-2", type: "OUT", amount: 200, at: new Date().toISOString() },
      ],
      start, end, limit, page
    };
  }

  const cfg = envCfg();
  assertCoreCfg(cfg);
  const tmn = new TMNOne();
  tmn.setData(
    cfg.keyid,
    cfg.msisdn,
    cfg.loginToken,
    cfg.tmnId,
    cfg.deviceId
  );
  if (process.env.PROXY_IP) {
    tmn.setProxy(
      process.env.PROXY_IP,
      process.env.PROXY_USERNAME || "",
      process.env.PROXY_PASSWORD || ""
    );
  }
  assertCoreCfg(cfg);
  await tmn.loginWithPin6(process.env.TMN_PIN6);
  const res = await tmn.fetchTransactionHistory(start, end, limit, page);
  return { ok: true, mode: "real", res };
}
