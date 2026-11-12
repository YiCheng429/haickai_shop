"use strict";
require("dotenv").config();

function bool(v, def = false) {
  if (v === undefined || v === "") return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}
function int(v, def) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function normalizeBase(p) {
  let s = (p === undefined ? "/shop" : String(p)).trim();
  if (!s || s === "/") return "";
  if (!s.startsWith("/")) s = "/" + s;
  return s.replace(/\/+$/, "");
}

const trustProxyRaw = process.env.TRUST_PROXY;
let trustProxy = 1;
if (trustProxyRaw !== undefined && trustProxyRaw !== "") {
  trustProxy = /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : bool(trustProxyRaw) ? 1 : false;
}

const config = {
  env: process.env.NODE_ENV || "development",
  port: int(process.env.PORT, 3000),
  basePath: normalizeBase(process.env.BASE_PATH),
  trustProxy,
  corsOrigins: (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  serveStatic: bool(process.env.SERVE_STATIC, false),
  staticDir: process.env.STATIC_DIR || "..",
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: bool(process.env.DATABASE_SSL, false),
  adminToken: process.env.ADMIN_TOKEN || "",
  orderRateLimit: int(process.env.ORDER_RATE_LIMIT, 10),
  lookupRateLimit: int(process.env.LOOKUP_RATE_LIMIT, 30),
  reportRateLimit: int(process.env.REPORT_RATE_LIMIT, 10),
  bank: {
    name: process.env.BANK_NAME || "",
    code: process.env.BANK_CODE || "",
    account: process.env.BANK_ACCOUNT || "",
    accountName: process.env.BANK_ACCOUNT_NAME || "",
    deadlineHours: int(process.env.PAYMENT_DEADLINE_HOURS, 48)
  },
  shopName: process.env.SHOP_NAME || "微光盲盒 Glimmer Box",
  ownerEmail: process.env.OWNER_EMAIL || "haickaiservice@gmail.com",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: int(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ""
  },
  sendCustomerEmail: bool(process.env.SEND_CUSTOMER_EMAIL, false)
};

module.exports = config;
