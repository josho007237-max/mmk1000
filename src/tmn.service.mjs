import "dotenv/config";
import TMNOne from "../TMNOne.js";

const isMock = (process.env.TMN_MODE || "").toLowerCase() === "mock";

export async function tmnGetBalance() {
  if (isMock) return { ok: true, mode: "mock", balance: 12345.67 };

  // โหมดจริง (พอมีครบค่อยเปิด)
  const tmn = new TMNOne();
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

  const tmn = new TMNOne();
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
  const res = await tmn.fetchTransactionHistory(start, end, limit, page);
  return { ok: true, mode: "real", res };
}
