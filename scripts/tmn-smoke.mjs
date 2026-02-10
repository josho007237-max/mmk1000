import "dotenv/config";
import TMNOne from "../TMNOne.js";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function validateRealEnv() {
  const missingOrInvalid = [];
  const keyid = process.env.TMNONE_KEYID;
  const msisdn = process.env.TMN_MSISDN;
  const loginToken = process.env.TMN_LOGIN_TOKEN;
  const tmnId = process.env.TMN_TMN_ID;
  const pin6 = process.env.TMN_PIN6;

  if (!keyid || !/^\d+$/.test(String(keyid))) missingOrInvalid.push("TMNONE_KEYID");
  if (!msisdn) missingOrInvalid.push("TMN_MSISDN");
  if (!loginToken || String(loginToken).length <= 20) missingOrInvalid.push("TMN_LOGIN_TOKEN");
  if (!tmnId) missingOrInvalid.push("TMN_TMN_ID");
  if (!pin6 || String(pin6).length !== 6) missingOrInvalid.push("TMN_PIN6");

  if (missingOrInvalid.length) {
    throw new Error(`[TMN real] Missing env: ${missingOrInvalid.join(",")}`);
  }
}

async function main() {
  validateRealEnv();
  const tmn = new TMNOne();
  tmn.setData(
    mustEnv("TMNONE_KEYID"),
    mustEnv("TMN_MSISDN"),
    mustEnv("TMN_LOGIN_TOKEN"),
    mustEnv("TMN_TMN_ID"),
    process.env.TMN_DEVICE_ID || ""
  );

  if (process.env.PROXY_IP) {
    tmn.setProxy(
      process.env.PROXY_IP,
      process.env.PROXY_USERNAME || "",
      process.env.PROXY_PASSWORD || ""
    );
  }

  const sig = await tmn.calculate_sign256("ping");
  if (!sig) {
    throw new Error("[TMN real] Empty signature (check KeyID/LoginToken pairing)");
  }

  const loginRes = await tmn.loginWithPin6(mustEnv("TMN_PIN6"));
  if (loginRes?.error) throw new Error(loginRes.error);

  const balance = await tmn.getBalance();
  console.log(JSON.stringify({ ok: true, balance }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
