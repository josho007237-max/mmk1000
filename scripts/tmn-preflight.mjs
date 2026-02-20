import dotenv from "dotenv";
import { runTmnPreflight } from "../src/tmn.preflight.mjs";

const dotenvPath = process.env.DOTENV_CONFIG_PATH || ".env.tmn.real";
const dotenvOverride = String(process.env.DOTENV_CONFIG_OVERRIDE || "false").toLowerCase() === "true";
dotenv.config({ path: dotenvPath, override: dotenvOverride, quiet: true });

async function run() {
  const mode = String(process.env.TMN_MODE || "mock").toLowerCase();
  if (mode !== "real") {
    console.error("PREFLIGHT BLOCK: MODE_NOT_REAL");
    process.exit(3);
  }
  try {
    const result = await runTmnPreflight({}, { useCache: false });
    if (result?.ok) {
      console.log("PREFLIGHT PASS");
      process.exit(0);
    }
    console.error("PREFLIGHT FAIL", String(result?.error || "preflight_failed"));
    process.exit(2);
  } catch (error) {
    console.error("PREFLIGHT FAIL", String(error?.message || error));
    process.exit(2);
  }
}

await run();
