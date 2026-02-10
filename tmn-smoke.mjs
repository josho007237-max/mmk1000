import "dotenv/config";
import TMNOne from "./TMNOne.js";

const t = new TMNOne();
t.setData(
  process.env.TMNONE_KEYID,
  process.env.TMN_MSISDN,
  process.env.TMN_LOGIN_TOKEN,
  process.env.TMN_TMN_ID,
  process.env.TMN_DEVICE_ID || ""
);

if (process.env.PROXY_IP) {
  t.setProxy(process.env.PROXY_IP, process.env.PROXY_USERNAME || "", process.env.PROXY_PASSWORD || "");
}

const sig = await t.calculate_sign256("ping");
console.log("signature_len =", (sig || "").length);
if (!sig) process.exit(2);

const r = await t.loginWithPin6(process.env.TMN_PIN6);
console.log("login_result =", r);
process.exit(r?.error ? 3 : 0);
