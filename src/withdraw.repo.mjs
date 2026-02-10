import crypto from "crypto";
import { DB } from "./db.mjs";

function nowISO() {
  return new Date().toISOString();
}

function deprecatedWithdrawRepo() {
  console.warn("[deprecated] use withdraw.store.mjs + data/withdraw-queue.json");
  throw new Error("deprecated_use_withdraw_store: data/withdraw-queue.json");
}

export const WithdrawRepo = {
  createRequest(payload) {
    // Deprecated: MMK1000 uses withdraw.store.mjs as the single source of truth.
    deprecatedWithdrawRepo();
    const rows = DB.loadWithdraw();
    const row = {
      id: crypto.randomUUID(),
      created_at: nowISO(),
      status: "PENDING",

      dest_type: payload.dest_type, // bank | promptpay | truewallet
      dest_label: payload.dest_label || "",

      // bank
      bank_code: payload.bank_code || "",
      bank_ac: payload.bank_ac || "",

      // promptpay
      pp_proxy_type: payload.pp_proxy_type || "",
      pp_proxy_value: payload.pp_proxy_value || "",

      // truewallet
      wallet_msisdn: payload.wallet_msisdn || "",

      amount: Number(payload.amount || 0),

      attempt_count: 0,
      last_attempt_at: "",
      approved_at: "",
      approved_by: "",
      tmn_raw_json: "",
      error_message: "",
    };

    rows.unshift(row);
    DB.saveWithdraw(rows);
    return row;
  },

  list(status) {
    deprecatedWithdrawRepo();
    const rows = DB.loadWithdraw();
    if (!status) return rows;
    return rows.filter(r => r.status === status);
  },

  get(id) {
    deprecatedWithdrawRepo();
    return DB.loadWithdraw().find(r => r.id === id) || null;
  },

  patch(id, patch) {
    deprecatedWithdrawRepo();
    const rows = DB.loadWithdraw();
    const idx = rows.findIndex(r => r.id === id);
    if (idx < 0) return null;
    rows[idx] = { ...rows[idx], ...patch };
    DB.saveWithdraw(rows);
    return rows[idx];
  },

  addAlert(wallet_msisdn, raw) {
    deprecatedWithdrawRepo();
    const rows = DB.loadAlerts();
    rows.unshift({
      id: crypto.randomUUID(),
      created_at: nowISO(),
      wallet_msisdn: wallet_msisdn || "",
      raw_json: JSON.stringify(raw || {}),
    });
    DB.saveAlerts(rows);
  },

  listAlerts() {
    deprecatedWithdrawRepo();
    return DB.loadAlerts();
  }
};
