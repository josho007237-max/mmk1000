Set-Location (Join-Path $PSScriptRoot "..")
$ErrorActionPreference = "Stop"
Write-Host "PWD=$PWD"
Write-Host "ScriptRoot=$PSScriptRoot"

node --input-type=module -e @'
import "dotenv/config";
import TMNOne from "./TMNOne.js";

const cfg = {
  keyid: process.env.TMNONE_KEYID || "",
  msisdn: process.env.TMN_MSISDN || "",
  loginToken: process.env.TMN_LOGIN_TOKEN || "",
  tmnId: process.env.TMN_TMN_ID || "",
  deviceId: process.env.TMN_DEVICE_ID || "",
};

const tmn = new TMNOne();
tmn.setData(cfg.keyid, cfg.msisdn, cfg.loginToken, cfg.tmnId, cfg.deviceId);

if (process.env.PROXY_IP) {
  tmn.setProxy(
    process.env.PROXY_IP,
    process.env.PROXY_USERNAME || "",
    process.env.PROXY_PASSWORD || ""
  );
}

const sig = await tmn.calculate_sign256("ping");
console.log("sig_len=", sig ? sig.length : 0);
'@
