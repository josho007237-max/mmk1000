import dotenv from "dotenv";
import TMNOne from "../TMNOne.js";

const dotenvPath = process.env.DOTENV_CONFIG_PATH || ".env";
const dotenvOverride = String(process.env.DOTENV_CONFIG_OVERRIDE || "false").toLowerCase() === "true";
dotenv.config({ path: dotenvPath, override: dotenvOverride, quiet: true });

const tmn = new TMNOne();
tmn.setData(
  process.env.TMNONE_KEYID || "",
  process.env.TMN_MSISDN || "",
  process.env.TMN_LOGIN_TOKEN || "",
  process.env.TMN_TMN_ID || "",
  process.env.TMN_DEVICE_ID || ""
);

let sig = "";
try {
  sig = await tmn.calculate_sign256("ping");
} catch {
  sig = "";
}

const siglen = typeof sig === "string" ? sig.length : 0;
console.log(`siglen=${siglen}`);
process.exit(siglen === 0 ? 1 : 0);
