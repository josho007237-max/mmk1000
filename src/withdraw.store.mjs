import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");
const QUEUE_FILE = path.join(DATA_DIR, "withdraw-queue.json");
export const WITHDRAW_STORE = "withdraw.store.mjs";
export const WITHDRAW_STORAGE_TYPE = "file";
export const WITHDRAW_STORAGE_PATH = QUEUE_FILE;
const jobLocks = new Set();

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
  const tmp = `${QUEUE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, QUEUE_FILE);
}

export async function backupWithdrawQueue() {
  await ensureDataDir();
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp =
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  const backupFile = path.join(DATA_DIR, `withdraw-queue.${timestamp}.bak.json`);
  await fs.copyFile(QUEUE_FILE, backupFile);
  return backupFile;
}

export function tryLock(id) {
  const key = String(id || "");
  if (jobLocks.has(key)) return false;
  jobLocks.add(key);
  return true;
}

export function unlock(id) {
  jobLocks.delete(String(id || ""));
}

export async function listWithdrawals() {
  const db = await readAll();
  return db.items.sort((a,b) => (b.created_at || 0) - (a.created_at || 0));
}

export async function getWithdrawal(id) {
  const db = await readAll();
  return db.items.find(x => x.id === id) || null;
}

function normalizeWithdrawType(type) {
  return type === "p2p" ? "wallet" : type;
}

function validateCreate(body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("bad_amount");

  let type = normalizeWithdrawType(body.type);
  if (!["bank","promptpay","wallet"].includes(type)) throw new Error("bad_type");

  const dest = body.dest || {};
  if (type === "bank") {
    if (!dest.bank_code || !dest.bank_ac) throw new Error("bank_dest_missing");
  }
  if (type === "promptpay") {
    if (!dest.proxy_value) throw new Error("promptpay_dest_missing");
    const digits = String(dest.proxy_value).replace(/\D/g, "");
    if (!(digits.length === 10 || digits.length === 13 || digits.length === 15)) {
      throw new Error("promptpay_dest_invalid");
    }
    dest.proxy_value = digits;
  }
  if (type === "wallet") {
    if (!dest.wallet_id) throw new Error("wallet_dest_missing");
    const digits = String(dest.wallet_id).replace(/\D/g, "");
    if (digits.length !== 10) throw new Error("wallet_dest_invalid");
    dest.wallet_id = digits;
  }
  // p2p is normalized to wallet (10-digit phone), enforce same dest rules as wallet

  return { type, amount, dest, note: body.note || "" };
}

export async function createWithdrawal(body) {
  const normalizedBody = { ...body, type: normalizeWithdrawType(body?.type) };
  const clean = validateCreate(normalizedBody);
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

  await backupWithdrawQueue();
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

  if (job.status === "approved" && (status === "sent" || status === "failed")) {
    await backupWithdrawQueue();
  }
  if (status === "sent") {
    const hasOkTrue =
      result?.ok === true ||
      result?.success === true ||
      result?.result?.ok === true ||
      result?.result?.success === true;
    if (!hasOkTrue) {
      if (result && typeof result === "object" && !Array.isArray(result)) {
        result.ok = true;
        if (result.mock === true && !Object.prototype.hasOwnProperty.call(result, "mode")) {
          result.mode = "mock";
        }
      } else {
        result = { result, ok: true };
      }
    }
  }
  job.status = status; // sent | failed
  job.sent_at = Date.now();
  job.result = result;
  if (status === "sent" || status === "failed") {
    const okFlag = Boolean(
      result?.ok === true ||
      result?.success === true ||
      result?.result?.ok === true ||
      result?.result?.success === true
    );
    const mockFlag = Boolean(result?.mock === true || result?.result?.mock === true);
    console.log(
      `withdraw_mark id=${job.id} type=${String(job.type || "")} amount=${Number(job.amount || 0)} status=${status} mock=${mockFlag} ok=${okFlag}`
    );
  }

  await writeAll(db);
  return job;
}
