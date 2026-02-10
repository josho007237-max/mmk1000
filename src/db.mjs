import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
console.log("[doctor] withdraw file= data/withdraw-queue.json (single source of truth)");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const s = fs.readFileSync(file, "utf8");
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export const DB = {
  files: {
    // NOTE: MMK1000 withdraw does NOT use withdraw_requests.json anymore (legacy only).
    withdraw: path.join(DATA_DIR, "withdraw-queue.json"),
    alerts: path.join(DATA_DIR, "faceauth_alerts.json"),
  },

  loadWithdraw() {
    const data = readJson(this.files.withdraw, { items: [] });
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  },
  saveWithdraw(rows) {
    if (rows && Array.isArray(rows.items)) {
      writeJsonAtomic(this.files.withdraw, rows);
      return;
    }
    writeJsonAtomic(this.files.withdraw, { items: rows || [] });
  },

  loadAlerts() {
    return readJson(this.files.alerts, []);
  },
  saveAlerts(rows) {
    writeJsonAtomic(this.files.alerts, rows);
  },
};
