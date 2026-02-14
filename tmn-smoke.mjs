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

const t = new TMNOne();
t.setData(
  cfg.keyid,
  cfg.msisdn,
  cfg.loginToken,
  cfg.tmnId,
  cfg.deviceId
);

if (process.env.PROXY_IP) {
  t.setProxy(process.env.PROXY_IP, process.env.PROXY_USERNAME || "", process.env.PROXY_PASSWORD || "");
}

const sig = await t.calculate_sign256("ping");
console.log("signature_len =", (sig || "").length);
if (!sig) process.exit(2);

assertCoreCfg(cfg);
const r = await t.loginWithPin6(process.env.TMN_PIN6);
if (r?.error) {
  console.log("login_error =", r.error);
  process.exit(3);
}
const loginOk = typeof r === "string" && r.length > 0;
console.log("login_ok =", loginOk, "token_len =", loginOk ? r.length : 0);
process.exit(loginOk ? 0 : 3);
