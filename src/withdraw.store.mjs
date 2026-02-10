import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");
const QUEUE_FILE = path.join(DATA_DIR, "withdraw-queue.json");

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(QUEUE_FILE); }
  catch { await fs.writeFile(QUEUE_FILE, JSON.stringify({ items: [] }, null, 2), "utf8"); }
}

async function readAll() {
  await ensureDataDir();
  const raw = await fs.readFile(QUEUE_FILE, "utf8");
  return JSON.parse(raw || '{"items":[]}');
}

async function writeAll(data) {
  await fs.writeFile(QUEUE_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function listWithdrawals() {
  const db = await readAll();
  return db.items.sort((a,b) => (b.created_at || 0) - (a.created_at || 0));
}

export async function getWithdrawal(id) {
  const db = await readAll();
  return db.items.find(x => x.id === id) || null;
}

function validateCreate(body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("bad_amount");

  const type = body.type;
  if (!["bank","promptpay","wallet"].includes(type)) throw new Error("bad_type");

  const dest = body.dest || {};
  if (type === "bank") {
    if (!dest.bank_code || !dest.bank_ac) throw new Error("bank_dest_missing");
  }
  if (type === "promptpay") {
    if (!dest.proxy_value) throw new Error("promptpay_dest_missing");
  }
  if (type === "wallet") {
    if (!dest.wallet_id) throw new Error("wallet_dest_missing");
  }

  return { type, amount, dest, note: body.note || "" };
}

export async function createWithdrawal(body) {
  const clean = validateCreate(body);
  const db = await readAll();

  const job = {
    id: crypto.randomUUID(),
    created_at: Date.now(),
    status: "pending",
    ...clean,
  };

  db.items.unshift(job);
  await writeAll(db);
  return job;
}

export async function approveWithdrawal(id) {
  const db = await readAll();
  const job = db.items.find(x => x.id === id);
  if (!job) throw new Error("not_found");
  if (job.status !== "pending") throw new Error("not_pending");

  job.status = "approved";
  job.approved_at = Date.now();

  await writeAll(db);
  return job;
}

export async function markWithdrawalResult(id, status, result) {
  const db = await readAll();
  const job = db.items.find(x => x.id === id);
  if (!job) throw new Error("not_found");
  if (job.status === "sent") throw new Error("already_sent");

  job.status = status; // sent | failed
  job.sent_at = Date.now();
  job.result = result;

  await writeAll(db);
  return job;
}
