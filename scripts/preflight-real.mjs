import "dotenv/config";
import fs from "fs";
import path from "path";

const mode = String(process.env.TMN_MODE || "mock").toLowerCase();
const missing = [];

const requiredReal = [
  "TMNONE_KEYID",
  "TMN_MSISDN",
  "TMN_LOGIN_TOKEN",
  "TMN_TMN_ID",
  "TMN_DEVICE_ID",
  "TMN_PIN6",
  "PROXY_IP",
  "PROXY_USERNAME",
  "PROXY_PASSWORD",
];

if (mode === "real") {
  for (const key of requiredReal) {
    if (!String(process.env[key] || "").trim()) missing.push(key);
  }
  const adminKey = String(process.env.ADMIN_KEY || "devkey");
  if (adminKey === "devkey" || adminKey.length < 12) missing.push("ADMIN_KEY(weak/default)");
  if (String(process.env.DEBUG_HEADERS || "0") !== "0") missing.push("DEBUG_HEADERS(must_be_0)");
}

const file = path.join(process.cwd(), "data", "withdraw-queue.json");
const counts = { pending: 0, approved: 0, sent: 0, failed: 0, total: 0 };

try {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw || '{"items":[]}');
  const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
  for (const it of items) {
    counts.total++;
    if (it?.status === "pending") counts.pending++;
    if (it?.status === "approved") counts.approved++;
    if (it?.status === "sent") counts.sent++;
    if (it?.status === "failed") counts.failed++;
  }
} catch {}

const ready = mode !== "real" ? true : missing.length === 0;
console.log(`[preflight] TMN_MODE=${mode}`);
console.log(`[preflight] real_ready=${ready}`);
if (mode === "real") {
  console.log(`[preflight] missing=${missing.length ? missing.join(",") : "-"}`);
}
console.log(`[preflight] queue_file=${file}`);
console.log(
  `[preflight] queue total=${counts.total} pending=${counts.pending} approved=${counts.approved} sent=${counts.sent} failed=${counts.failed}`
);
