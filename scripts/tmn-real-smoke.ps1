Set-Location (Join-Path $PSScriptRoot "..")
$ErrorActionPreference = "Stop"
Write-Host "PWD=$PWD"
Write-Host "ScriptRoot=$PSScriptRoot"

$envFile = ".\\.env"
if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing .env file: .env"
}

Get-Content -LiteralPath $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line) { return }
  if ($line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()
  if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
    if ($val.Length -ge 2) { $val = $val.Substring(1, $val.Length - 2) }
  }
  if ($key) { $env:$key = $val }
}

node --input-type=module -e @'
import TMNOne from "./TMNOne.js";

const required = [
  "TMNONE_KEYID",
  "TMN_MSISDN",
  "TMN_LOGIN_TOKEN",
  "TMN_TMN_ID",
  "TMN_DEVICE_ID",
  "TMN_PIN6",
];

for (const k of required) {
  if (!String(process.env[k] || "").trim()) {
    throw new Error(`missing_env:${k}`);
  }
}

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
console.log("sign_len=", sigLen);
if (sigLen !== 64) {
  throw new Error("sign_len_not_64");
}

const loginRes = await tmn.loginWithPin6(process.env.TMN_PIN6 || "");
const tokenOk = typeof loginRes === "string" && loginRes.length > 0;
console.log("token_ok=", tokenOk);
if (!tokenOk) {
  throw new Error("token_not_ok");
}

const balance = await tmn.getBalance();
console.log("balance_code=", balance?.code || "");
if (balance?.code !== "UPC-200") {
  throw new Error("balance_code_not_upc_200");
}

const now = new Date();
const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const startDate = start.toISOString().slice(0, 10);
const endDate = now.toISOString().slice(0, 10);

const history = await tmn.fetchTransactionHistory(startDate, endDate, 10, 1);
console.log("history_code=", history?.code || "");
if (history?.code !== "HTC-200") {
  throw new Error("history_code_not_htc_200");
}

console.log("ok=true");
'@

