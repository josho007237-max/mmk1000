import { Jimp } from "jimp";
import jsQR from "jsqr";

// 1) decode ภาพ -> payload string
export async function decodeQrPayloadFromImage(buffer) {
  const base = await Jimp.read(buffer);

  const preprocess = [
    (img) => img.clone(),
    (img) => img.clone().grayscale().contrast(1).normalize(),
    (img) => img.clone().invert().grayscale().contrast(1).normalize(),
  ];

  const sizes = [0, 600, 900, 1200];

  for (const prep of preprocess) {
    for (const s of sizes) {
      const img = prep(base);
      if (s) img.resize({ w: s }); // Jimp v1+ ใช้ object param ได้ :contentReference[oaicite:2]{index=2}

      const { data, width, height } = img.bitmap;
      const code = jsQR(new Uint8ClampedArray(data), width, height);
      if (code?.data) return code.data;
    }
  }
  return null;
}

// 2) TLV parser (EMV)
function parseTLV(str) {
  const m = new Map();
  let i = 0;
  while (i + 4 <= str.length) {
    const id = str.slice(i, i + 2);
    const len = Number(str.slice(i + 2, i + 4));
    i += 4;
    const val = str.slice(i, i + len);
    i += len;
    m.set(id, val);
  }
  return m;
}

// 3) PromptPay parser
export function tryParsePromptPay(payload) {
  try {
    const top = parseTLV(payload);

    // PromptPay Merchant-presented QR uses AID A000000677010111 :contentReference[oaicite:3]{index=3}
    const mai = top.get("29");
    if (!mai) return { ok: false, reason: "not_promptpay" };

    const inner = parseTLV(mai);
    const aid = inner.get("00");
    if (aid !== "A000000677010111") return { ok: false, reason: "not_promptpay" };

    const v01 = inner.get("01"); // mobile (13 digits เช่น 0066XXXXXXXXX) :contentReference[oaicite:4]{index=4}
    const v02 = inner.get("02"); // nat id/tax (13)
    const v03 = inner.get("03"); // ewallet id (15) :contentReference[oaicite:5]{index=5}
    const v04 = inner.get("04"); // bank account (var)

    let proxyType = null;
    let raw = null;

    if (v01) { proxyType = "mobile"; raw = v01; }
    else if (v02) { proxyType = "national_id"; raw = v02; }
    else if (v03) { proxyType = "ewallet_id"; raw = v03; }
    else if (v04) { proxyType = "bank_account"; raw = v04; }
    else return { ok: false, reason: "missing_proxy" };

    // normalize เฉพาะ mobile: 0066XXXXXXXXX -> 0XXXXXXXXX
    let proxyValue = raw;
    if (proxyType === "mobile" && raw.startsWith("0066") && raw.length === 13) {
      proxyValue = "0" + raw.slice(4);
    }

    return { ok: true, scheme: "promptpay", proxyType, raw, proxyValue, aid };
  } catch {
    return { ok: false, reason: "parse_error" };
  }
}
