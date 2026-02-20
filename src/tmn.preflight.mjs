export default async function runPreflight({ mode, tmn } = {}) {
  const activeMode = String(process.env.TMN_MODE || mode || "").toLowerCase();
  if (activeMode !== "real") {
    return { ok: false, error: "MODE_NOT_REAL" };
  }
  try {
    await tmn.getBalance();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "PREFLIGHT_FAIL" };
  }
}

export { runPreflight };
