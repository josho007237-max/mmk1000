import fs from "fs/promises";
import path from "path";

const QUEUE_FILE = path.join(process.cwd(), "data", "withdraw-queue.json");

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function hasOkFlag(result) {
  return result?.ok === true || result?.success === true;
}

function hasErrorKeyword(result) {
  if (!result || typeof result !== "object") return false;
  const s = JSON.stringify(result).toLowerCase();
  return /\berror\b|\bfail(ed)?\b|invalid|reject|denied|timeout|not[\s_-]*found|cannot|can't|ไม่สำเร็จ|ล้มเหลว|ผิดพลาด/.test(s);
}

async function main() {
  const raw = await fs.readFile(QUEUE_FILE, "utf8");
  const db = JSON.parse(raw || '{"items":[]}');
  const items = Array.isArray(db.items) ? db.items : [];

  const backup = path.join(path.dirname(QUEUE_FILE), `withdraw-queue.${nowStamp()}.pre-sent-hygiene.bak.json`);
  await fs.copyFile(QUEUE_FILE, backup);

  let changed = 0;
  for (const job of items) {
    if (job?.status !== "sent") continue;
    const result = job?.result || {};
    const ok = hasOkFlag(result);
    const hasErr = hasErrorKeyword(result);
    if (ok && !hasErr) continue;

    const reasons = [];
    if (!ok) reasons.push("missing_ok_flag");
    if (hasErr) reasons.push("error_keyword");
    job.status = "failed";
    job.fix_note = `migrate_sent_hygiene:${reasons.join("+")}:${new Date().toISOString()}`;
    changed += 1;
  }

  await fs.writeFile(QUEUE_FILE, JSON.stringify({ items }, null, 2), "utf8");

  const statusCounts = items.reduce((acc, it) => {
    const k = String(it?.status || "unknown");
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const sentTotal = items.filter((x) => x?.status === "sent").length;
  const sentOk = items.filter((x) => x?.status === "sent" && hasOkFlag(x?.result || {})).length;

  console.log(JSON.stringify({
    ok: true,
    queueFile: QUEUE_FILE,
    backup,
    changed,
    statusCounts,
    sentOkRate: sentTotal ? `${sentOk}/${sentTotal}` : "0/0",
  }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
  process.exit(1);
});

