import "dotenv/config";
import fs from "fs/promises";
import path from "path";

import {
  createWithdrawal,
  approveWithdrawal,
  markWithdrawalResult,
} from "../src/withdraw.store.mjs";

const QUEUE_FILE = path.join(process.cwd(), "data", "withdraw-queue.json");

function logOk(msg) {
  console.log("[ok]", msg);
}

async function readQueueFile() {
  const raw = await fs.readFile(QUEUE_FILE, "utf8");
  const data = JSON.parse(raw || '{"items":[]}');
  return Array.isArray(data.items) ? data.items : [];
}

async function main() {
  const job = await createWithdrawal({
    type: "bank",
    amount: 1,
    dest: { bank_code: "scb", bank_ac: "1234567890" },
  });
  logOk(`created ${job.id} status=${job.status}`);

  const approved = await approveWithdrawal(job.id);
  logOk(`approved ${approved.id} status=${approved.status}`);

  const sent = await markWithdrawalResult(job.id, "sent", { mock: true });
  logOk(`sent ${sent.id} status=${sent.status}`);

  const items = await readQueueFile();
  const found = items.find(x => x.id === job.id);
  if (!found) throw new Error("persist_not_found");
  if (found.status !== "sent") throw new Error(`persist_bad_status:${found.status}`);
  logOk(`persist ok ${QUEUE_FILE}`);
}

main().catch((e) => {
  console.error("[fail]", e?.message || e);
  process.exitCode = 1;
});
