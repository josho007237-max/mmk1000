import "dotenv/config";
import fs from "fs";
import path from "path";

const cwd = process.cwd();
const file = path.join(cwd, "data", "withdraw-queue.json");
const mode = String(process.env.TMN_MODE || "mock").toLowerCase();

let pending = 0;
let approved = 0;
let sent = 0;
let failed = 0;
let total = 0;
try {
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw || '{"items":[]}');
  const items = Array.isArray(data) ? data : (data.items || []);
  for (const it of items) {
    total++;
    if (it?.status === "pending") pending++;
    if (it?.status === "approved") approved++;
    if (it?.status === "sent") sent++;
    if (it?.status === "failed") failed++;
  }
} catch {}

console.log("[doctor] TMN_MODE=", mode);
console.log("[doctor] cwd=", cwd);
console.log("[doctor] withdraw queue file=", file);
console.log("[doctor] total=", total, "pending=", pending, "approved=", approved, "sent=", sent, "failed=", failed);
