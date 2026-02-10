import "dotenv/config";
import TMNOne from "./TMNOne.js";

const tmn = new TMNOne();
tmn.enableDebugging();

tmn.setData(
  process.env.TMNONE_KEYID,
  process.env.TMN_MSISDN,
  process.env.TMN_LOGIN_TOKEN,
  process.env.TMN_TMN_ID,
  process.env.TMN_DEVICE_ID
);

if (process.env.PROXY_IP) {
  tmn.setProxy(
    process.env.PROXY_IP,
    process.env.PROXY_USERNAME || "",
    process.env.PROXY_PASSWORD || ""
  );
}

await tmn.loginWithPin6(process.env.TMN_PIN6);

const balance = await tmn.getBalance();
console.log("balance=", balance);

const tx = await tmn.fetchTransactionHistory(
  new Date(Date.now() - 86400_000).toISOString().slice(0,10),
  new Date(Date.now() + 86400_000).toISOString().slice(0,10),
  10,
  1
);
console.log("tx=", tx);
