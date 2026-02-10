import "dotenv/config";
import fs from "fs/promises";
import path from "path";

import {
  createWithdrawal,
  approveWithdrawal,
} from "../src/withdraw.store.mjs";

const BASE = process.env.MMK_BASE || "http://127.0.0.1:4100";
const ADMIN_KEY = process.env.ADMIN_KEY || "devkey";
const API = `${BASE}/api`;
const QUEUE_FILE = path.join(process.cwd(), "data", "withdraw-queue.json");

function logOk(msg) {
  console.log("[ok]", msg);
}

function logFail(msg) {
  console.error("[fail]", msg);
}

async function apiPost(path, body) {
  const r = await fetch(API + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: body ? JSON.stringify(body) : "{}",
  });
  const j = await r.json().catch(() => null);
  return { r, j };
}

async function main() {
  const job = await createWithdrawal({
    type: "bank",
    amount: 1,
    dest: { bank_code: "scb", bank_ac: "1234567890" },
  });
  logOk(`created ${job.id} status=${job.status}`);

  // try send (must be not_approved)
  const firstSend = await apiPost(`/withdraw/${encodeURIComponent(job.id)}/send`);
  if (firstSend.r.status !== 400 || firstSend.j?.error !== "not_approved") {
    logFail(`expected not_approved, got ${firstSend.r.status} ${firstSend.j?.error}`);
    process.exitCode = 1;
  } else {
    logOk("not_approved guard ok");
  }

  const approved = await approveWithdrawal(job.id);
  logOk(`approved ${approved.id} status=${approved.status}`);

  const mode = (process.env.TMN_MODE || "mock").toLowerCase();
  const sendOk = await apiPost(`/withdraw/${encodeURIComponent(job.id)}/send`);
  if (mode === "real" && sendOk.r.status === 400 && sendOk.j?.error === "tmn_cfg_missing") {
    if (!Array.isArray(sendOk.j?.missing_fields) || sendOk.j.missing_fields.length === 0) {
      logFail("expected missing_fields array");
      process.exitCode = 1;
    } else {
      logOk("tmn_cfg_missing guard ok");
    }
    return;
  }
  if (sendOk.r.status !== 200 || sendOk.j?.ok !== true) {
    logFail(`expected ok, got ${sendOk.r.status} ${sendOk.j?.error}`);
    process.exitCode = 1;
  } else {
    logOk("send ok");
  }

  // send again (should be already_sent)
  const secondSend = await apiPost(`/withdraw/${encodeURIComponent(job.id)}/send`);
  if (secondSend.r.status !== 409 || secondSend.j?.error !== "already_sent") {
    logFail(`expected already_sent, got ${secondSend.r.status} ${secondSend.j?.error}`);
    process.exitCode = 1;
  } else {
    logOk("already_sent guard ok");
  }

  // persist check
  const raw = await fs.readFile(QUEUE_FILE, "utf8");
  const data = JSON.parse(raw || '{"items":[]}');
  const items = Array.isArray(data) ? data : (data.items || []);
  const found = items.find(x => x.id === job.id);
  if (!found) throw new Error("persist_not_found");
  logOk(`persist ok ${QUEUE_FILE}`);
}

main().catch((e) => {
  logFail(e?.message || e);
  process.exitCode = 1;
});
