import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

dotenv.config({ override: true });

const ROOT = process.cwd();
const TMN_FILE = path.join(ROOT, "TMNOne.js");
const IMPORTERS = [
  "tools/tmn-real-smoke.mjs",
  "tmn-smoke.mjs",
  "test.tmn.mjs",
  "src/tmn.service.mjs",
  "src/tmn.adapter.mjs",
  "scripts/tmn-smoke.mjs",
];
const REQUIRED_REAL_ENV = [
  "TMNONE_KEYID",
  "TMN_MSISDN",
  "TMN_LOGIN_TOKEN",
  "TMN_TMN_ID",
  "TMN_DEVICE_ID",
  "TMN_PIN6",
];

function log(line) {
  console.log(`[tmn-preflight] ${line}`);
}

function normPath(p) {
  return path.resolve(p).replaceAll("\\", "/").toLowerCase();
}

function fail(code, reason, detail = "") {
  log(`status=fail code=${code} reason=${reason}`);
  if (detail) log(detail);
  process.exit(code);
}

async function checkSyntax() {
  const checked = spawnSync(process.execPath, ["--check", TMN_FILE], {
    encoding: "utf8",
  });

  if (checked.error) {
    const code = String(checked.error.code || "");
    if (code === "EPERM") {
      log("syntax_check_spawn=blocked_eperm fallback=module_import");
      try {
        await import(pathToFileURL(TMN_FILE).href);
        log("syntax_ok=true via=fallback_import");
        return;
      } catch (error) {
        fail(2, "syntax_check_failed", String(error?.message || error));
      }
    }
    fail(2, "syntax_check_failed", String(checked.error.message || checked.error));
  }

  if (checked.status !== 0) {
    const errText = String(checked.stderr || checked.stdout || "").trim();
    fail(2, "syntax_check_failed", errText);
  }
  log("syntax_ok=true");
}

function checkImporterResolution() {
  const errors = [];
  const tmnNorm = normPath(TMN_FILE);

  for (const relFile of IMPORTERS) {
    const importerAbs = path.join(ROOT, relFile);
    if (!fs.existsSync(importerAbs)) {
      errors.push(`${relFile}:missing_file`);
      continue;
    }

    const source = fs.readFileSync(importerAbs, "utf8");
    const m = source.match(/(?:from|require\()\s*["'](\.\.?\/TMNOne\.js)["']/);
    if (!m) {
      errors.push(`${relFile}:missing_import_path`);
      continue;
    }

    const importPath = m[1];
    if (importPath !== "./TMNOne.js" && importPath !== "../TMNOne.js") {
      errors.push(`${relFile}:invalid_import_path:${importPath}`);
      continue;
    }

    const resolved = path.resolve(path.dirname(importerAbs), importPath);
    if (normPath(resolved) !== tmnNorm) {
      errors.push(`${relFile}:resolved_to:${resolved}`);
    }
  }

  if (errors.length) {
    fail(2, "importer_resolution_failed", errors.join(";"));
  }
  log(`importers_ok=true count=${IMPORTERS.length}`);
}

function modeFromEnv() {
  return String(process.env.TMN_MODE || "mock").trim().toLowerCase();
}

function checkRealEnv() {
  const missing = REQUIRED_REAL_ENV.filter((k) => !String(process.env[k] || "").trim());
  if (missing.length) {
    fail(3, "missing_real_env", `missing=${missing.join(",")}`);
  }
  const parsedKeyId = Number(process.env.TMNONE_KEYID);
  if (!Number.isFinite(parsedKeyId) || parsedKeyId <= 0) {
    log(`TMNONE_KEYID.parsed=${Number.isFinite(parsedKeyId) ? parsedKeyId : "NaN"}`);
    log("hint: set TMNONE_KEYID to a number like 1 (no < >)");
    fail(3, "bad_keyid", "TMNONE_KEYID must be a positive number");
  }
  log("real_env_ok=true");
}

function redact(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const sensitive = /token|device|pin|msisdn|tmn_id/i;
  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item));
  }
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitive.test(String(key))) {
      out[key] = "***";
    } else {
      out[key] = redact(value);
    }
  }
  return out;
}

async function runRealSignCheck() {
  try {
    const { default: TMNOne } = await import("../TMNOne.js");
    const tmn = new TMNOne();

    tmn.setData(
      process.env.TMNONE_KEYID || "",
      process.env.TMN_MSISDN || "",
      process.env.TMN_LOGIN_TOKEN || "",
      process.env.TMN_TMN_ID || "",
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
    const sigLen = typeof sig === "string" ? sig.length : 0;
    if (!sigLen) {
      fail(4, "sign_failed", "empty_signature");
    }

    log(`sign_ok=true signature_len=${sigLen}`);
  } catch (error) {
    const safeMessage = String(error?.message || "unknown_error");
    const safeCode = String(error?.code || "-");
    const st = error?.response?.status ?? error?.status ?? "-";
    const data = error?.response?.data ?? error?.data ?? error?.message ?? error;
    log(`message=${safeMessage}; err.code=${safeCode}`);
    console.log("[tmn-preflight] http_status=", st);
    console.log("[tmn-preflight] data=", redact(data));
    fail(4, "sign_failed");
  }
}

async function main() {
  log(`tmn_file=${TMN_FILE}`);
  await checkSyntax();
  checkImporterResolution();

  const mode = modeFromEnv();
  log(`TMN_MODE=${mode}`);

  if (mode !== "real") {
    log("real_env_check=skipped");
    log("status=pass code=0");
    process.exit(0);
  }

  checkRealEnv();
  await runRealSignCheck();
  log("status=pass code=0");
  process.exit(0);
}

await main();
