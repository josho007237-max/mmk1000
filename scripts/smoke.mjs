import "dotenv/config";
import fs from "fs";

const BASE = process.env.MMK_BASE || "http://127.0.0.1:4100";
const API = `${BASE}/api`;
const ADMIN_KEY = process.env.ADMIN_KEY || "mmk1000";
const QR_IMAGE = process.env.QR_IMAGE || "";

function hdr() {
  return { "x-admin-key": ADMIN_KEY };
}

function logOk(name) {
  console.log(`[ok] ${name}`);
}

function logFail(name, err) {
  console.error(`[fail] ${name}: ${err}`);
}

async function reqJson(name, path, opts = {}) {
  const url = API + path;
  const r = await fetch(url, {
    ...opts,
    headers: opts.noAuth ? { ...(opts.headers || {}) } : { ...hdr(), ...(opts.headers || {}) },
  });
  if (r.status !== 200) {
    const body = await r.text().catch(() => "");
    console.error("[fail]", name, r.status, url, body);
    throw new Error(`http_${r.status}`);
  }
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) {
    throw new Error(j?.error || j?.message || `http_${r.status}`);
  }
  logOk(name);
  return j;
}

async function reqJsonRoutes() {
  const path = "/routes";
  const url = API + path;
  const r = await fetch(url, { headers: { ...hdr() } });
  if (r.status === 404) {
    console.log("[skip] routes: dev-only (NODE_ENV=production may hide it)");
    return null;
  }
  if (r.status !== 200) {
    const body = await r.text().catch(() => "");
    console.error("[fail]", "routes", r.status, url, body);
    throw new Error(`http_${r.status}`);
  }
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) {
    throw new Error(j?.error || j?.message || `http_${r.status}`);
  }
  logOk("routes");
  return j;
}

async function main() {
  try {
    await reqJson("health", "/health", { noAuth: true });
    await reqJsonRoutes();
    await reqJson("dashboard", "/dashboard?start=2020-01-01&end=2020-01-02");
    await reqJson("withdraw.queue", "/withdraw/queue");

    const create = await reqJson("withdraw.create", "/withdraw/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "bank",
        amount: 1,
        dest: { bank_code: "scb", bank_ac: "1234567890" },
      }),
    });
    const id = create?.job?.id;
    if (!id) throw new Error("missing withdraw id");

    await reqJson("withdraw.approve", `/withdraw/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    await reqJson("withdraw.send", `/withdraw/${encodeURIComponent(id)}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    if (QR_IMAGE && fs.existsSync(QR_IMAGE)) {
      const buf = fs.readFileSync(QR_IMAGE);
      const fd = new FormData();
      fd.append("image", new Blob([buf]), "qr.png");
      await reqJson("qr.decode", "/qr/decode", { method: "POST", body: fd });
    } else {
      console.log("[skip] qr.decode (QR_IMAGE not set or missing)");
    }
  } catch (e) {
    console.error(e?.message || e);
    process.exitCode = 1;
    await new Promise((r) => setTimeout(r, 100));
    return;
  }
}

main();
