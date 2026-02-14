import "dotenv/config";
import TMNOne from "./TMNOne.js";

function assertCoreCfg(cfg) {
  const keyid = Number(cfg.keyid);
  if (!Number.isFinite(keyid) || keyid <= 0 || !cfg.loginToken || !cfg.tmnId || !cfg.deviceId) {
    throw new Error("TMN cfg missing: keyid/loginToken/tmnId/deviceId");
  }
}

const cfg = {
  keyid: process.env.TMNONE_KEYID || "",
  msisdn: process.env.TMN_MSISDN || "",
  loginToken: process.env.TMN_LOGIN_TOKEN || "",
  tmnId: process.env.TMN_TMN_ID || "",
  deviceId: process.env.TMN_DEVICE_ID || "",
};
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
const loginRes = await tmn.loginWithPin6(process.env.TMN_PIN6 || "");
if (loginRes?.error) {
  throw new Error(loginRes.error);
}
const loginOk = typeof loginRes === "string" && loginRes.length > 0;
console.log("login_ok=", loginOk, "token_len=", loginOk ? loginRes.length : 0);

const balance = await tmn.getBalance();
console.log("balance=", balance);

const tx = await tmn.fetchTransactionHistory(
  new Date(Date.now() - 86400_000).toISOString().slice(0,10),
  new Date(Date.now() + 86400_000).toISOString().slice(0,10),
  10,
  1
);
console.log("tx=", tx);
