import fs from "fs";
import path from "path";

const cwd = process.cwd();
const file = path.join(cwd, "data", "withdraw-queue.json");

console.log("[doctor] cwd=", cwd);
console.log("[doctor] withdraw queue file=", file);

let count = 0;
try {
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw || '{"items":[]}');
  if (Array.isArray(data)) count = data.length;
  else if (data && Array.isArray(data.items)) count = data.items.length;
} catch {}

console.log("[doctor] withdraw items count=", count);
