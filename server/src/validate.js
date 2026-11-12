"use strict";
const { PRODUCTS } = require("./products");

const MAX_QTY = 20;
const MAX_LINES = 10;
const PHONE_RE = /^09\d{8}$/;
const STORE_ID_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ORDER_NO_RE = /^GB-\d{8}-[A-HJ-NP-Z2-9]{4}$/;
// 控制字元（保留換行與 tab 給備註）
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanText(v, { multiline = false } = {}) {
  if (typeof v !== "string") return "";
  let s = v.normalize("NFC").replace(CTRL_RE, "");
  if (!multiline) s = s.replace(/[\r\n\t]+/g, " ");
  return s.trim();
}

function normalizePhone(v) {
  if (typeof v !== "string") return "";
  let s = v.replace(/[\s\-()]/g, "");
  if (s.startsWith("+886")) s = "0" + s.slice(4);
  return s;
}

function validateOrder(body) {
  const errors = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { errors: { body: "請提供 JSON 格式的訂單資料" } };
  }
  const name = cleanText(body.name);
  const phone = normalizePhone(body.phone);
  const email = cleanText(body.email).toLowerCase();
  const storeName = cleanText(body.storeName);
  const storeId = cleanText(String(body.storeId ?? ""));
  const note = cleanText(body.note ?? "", { multiline: true });

  if (!name) errors.name = "請填寫取件人姓名";
  else if (name.length > 50) errors.name = "姓名最多 50 字";

  if (!PHONE_RE.test(phone)) errors.phone = "請填寫 09 開頭的 10 碼手機號碼";

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) errors.email = "請填寫有效的 Email";

  if (!storeName) errors.storeName = "請填寫取貨門市名稱";
  else if (storeName.length > 50) errors.storeName = "門市名稱最多 50 字";

  if (!STORE_ID_RE.test(storeId)) errors.storeId = "請填寫 6 碼門市店號";

  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") errors.note = "備註格式不正確";
  else if (note.length > 500) errors.note = "備註最多 500 字";

  const merged = new Map();
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.items = "購物車是空的";
  } else if (body.items.length > MAX_LINES) {
    errors.items = "商品項目過多";
  } else {
    for (const it of body.items) {
      if (!it || typeof it !== "object" || typeof it.id !== "string" || !Object.prototype.hasOwnProperty.call(PRODUCTS, it.id)) {
        errors.items = "含有不存在的商品";
        break;
      }
      const qty = it.qty;
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
        errors.items = `每項商品數量需為 1 至 ${MAX_QTY}`;
        break;
      }
      merged.set(it.id, (merged.get(it.id) || 0) + qty);
    }
    if (!errors.items) {
      for (const q of merged.values()) {
        if (q > MAX_QTY) {
          errors.items = `每項商品數量需為 1 至 ${MAX_QTY}`;
          break;
        }
      }
    }
  }

  if (Object.keys(errors).length) return { errors };
  return {
    value: {
      name, phone, email, storeName, storeId, note,
      items: [...merged.entries()].map(([id, qty]) => ({ id, qty }))
    }
  };
}

module.exports = { validateOrder, normalizePhone, ORDER_NO_RE, PHONE_RE, MAX_QTY };
