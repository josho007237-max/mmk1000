import "dotenv/config";
import TMNOne from "../TMNOne.js";

const {
  TMN_KEY_ID,
  TMN_MOBILE,
  TMN_LOGIN_TOKEN,
  TMN_PIN6,
  TMN_ID,
  TMN_DEVICE_ID,
  TMN_FACEAUTH_WEBHOOK_URL,
  FACEAUTH_WEBHOOK_URL,
} = process.env;

function assertCoreCfg(cfg) {
  const keyid = Number(cfg.keyid);
  if (!Number.isFinite(keyid) || keyid <= 0 || !cfg.loginToken || !cfg.tmnId || !cfg.deviceId) {
    throw new Error("TMN cfg missing: keyid/loginToken/tmnId/deviceId");
  }
}

const required = {
  TMN_KEY_ID,
  TMN_MOBILE,
  TMN_LOGIN_TOKEN,
  TMN_PIN6,
  TMN_ID,
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`Missing required ENV: ${missing.join(", ")}`);
  process.exit(1);
}

const cfg = {
  keyid: TMN_KEY_ID,
  msisdn: TMN_MOBILE,
  loginToken: TMN_LOGIN_TOKEN,
  tmnId: TMN_ID,
  deviceId: TMN_DEVICE_ID || "",
};
assertCoreCfg(cfg);

const instance = new TMNOne();
instance.setData(
  cfg.keyid,
  cfg.msisdn,
  cfg.loginToken,
  cfg.tmnId,
  cfg.deviceId
);

const faceWebhook = TMN_FACEAUTH_WEBHOOK_URL || FACEAUTH_WEBHOOK_URL;
if (faceWebhook) {
  instance.faceauth_webhook_url = faceWebhook;
}

const signature = await instance.calculate_sign256("ping");
if (!signature) {
  throw new Error("calculate_sign256 returned empty signature");
}
console.log("sigLen =", signature.length);

assertCoreCfg(cfg);
const loginResult = await instance.loginWithPin6(TMN_PIN6);
if (loginResult?.error) {
  console.error("loginWithPin6 error:", loginResult.error);
  process.exit(2);
}
const loginOk = typeof loginResult === "string" && loginResult.length > 0;
console.log("loginOk =", loginOk, "tokenLen =", loginOk ? loginResult.length : 0);
if (!loginOk) {
  process.exit(2);
}

const oneDayMs = 24 * 60 * 60 * 1000;
const startDate = new Date(Date.now() - oneDayMs).toISOString().slice(0, 10);
const endDate = new Date(Date.now() + oneDayMs).toISOString().slice(0, 10);

const balance = await instance.getBalance();
if (balance?.error) {
  console.error("getBalance error:", balance.error);
  process.exit(3);
}
console.log(balance);

const txHistory = await instance.fetchTransactionHistory(startDate, endDate);
if (txHistory?.error) {
  console.error("fetchTransactionHistory error:", txHistory.error);
  process.exit(4);
}
console.log(txHistory);
