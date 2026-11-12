"use strict";
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");

const config = require("./config");
const pool = require("./db");
const { validateOrder, normalizePhone, ORDER_NO_RE, PHONE_RE } = require("./validate");
const orders = require("./orders");
const { paymentInstructions } = require("./payment");
const { notifyNewOrder, mailEnabled } = require("./mailer");
const { FREE_SHIPPING_THRESHOLD, SHIPPING_NAME } = require("./products");

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function maskName(name) {
  const chars = [...name];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return chars[0] + "＊";
  return chars[0] + "＊".repeat(chars.length - 2) + chars[chars.length - 1];
}

function publicOrder(o) {
  return {
    orderNo: o.orderNo,
    status: o.status,
    statusLabel: o.statusLabel,
    name: maskName(o.name),
    storeName: o.storeName,
    storeId: o.storeId,
    items: o.items,
    subtotal: o.subtotal,
    shipping: o.shipping,
    total: o.total,
    trackingNo: o.trackingNo,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    shippedAt: o.shippedAt
  };
}

function limiter(max, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ ok: false, error: "rate_limited", message })
  });
}

function requireAdmin(req, res, next) {
  if (!config.adminToken || config.adminToken.length < 16) {
    return res.status(503).json({ ok: false, error: "admin_disabled", message: "尚未設定 ADMIN_TOKEN" });
  }
  const m = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  const given = crypto.createHash("sha256").update(m ? m[1].trim() : "").digest();
  const expected = crypto.createHash("sha256").update(config.adminToken).digest();
  if (!m || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

function buildApiRouter() {
  const r = express.Router();

  r.get("/health", asyncH(async (req, res) => {
    let db = "ok";
    try {
      await pool.query("SELECT 1");
    } catch {
      db = "error";
    }
    res.status(db === "ok" ? 200 : 503).json({
      ok: db === "ok",
      db,
      mail: mailEnabled() ? "enabled" : "disabled",
      time: new Date().toISOString()
    });
  }));

  r.get("/config", (req, res) => {
    res.json({ ok: true, freeShippingThreshold: FREE_SHIPPING_THRESHOLD, shippingName: SHIPPING_NAME });
  });

  r.post("/orders", limiter(config.orderRateLimit, "送出次數過多，請稍後再試"), asyncH(async (req, res) => {
    const { errors, value } = validateOrder(req.body);
    if (errors) return res.status(400).json({ ok: false, error: "validation_error", message: "訂單資料有誤", fields: errors });

    let idemKey = (req.get("idempotency-key") || "").trim();
    if (idemKey && !/^[A-Za-z0-9_-]{8,64}$/.test(idemKey)) {
      return res.status(400).json({ ok: false, error: "validation_error", message: "Idempotency-Key 格式不正確" });
    }
    const { order, duplicate } = await orders.createOrder(value, { idempotencyKey: idemKey || null, clientIp: req.ip });
    const payment = paymentInstructions(order.orderNo, order.total);

    if (!duplicate) {
      notifyNewOrder(order, payment).catch((err) => console.error(`[mail] ${order.orderNo} 通知信寄送失敗：`, err.message));
    }
    res.status(duplicate ? 200 : 201).json({
      ok: true,
      duplicate,
      order: {
        orderNo: order.orderNo,
        status: order.status,
        statusLabel: order.statusLabel,
        items: order.items,
        subtotal: order.subtotal,
        shipping: order.shipping,
        total: order.total,
        freeShipping: order.subtotal > 0 && order.shipping === 0,
        createdAt: order.createdAt
      },
      payment
    });
  }));

  r.get("/orders/:orderNo", limiter(config.lookupRateLimit, "查詢次數過多，請稍後再試"), asyncH(async (req, res) => {
    const orderNo = String(req.params.orderNo || "").trim().toUpperCase();
    const phone = normalizePhone(String(req.query.phone || ""));
    if (!ORDER_NO_RE.test(orderNo) || !PHONE_RE.test(phone)) {
      return res.status(400).json({ ok: false, error: "validation_error", message: "請輸入正確的訂單編號與手機號碼" });
    }
    const order = await orders.lookupOrder(orderNo, phone);
    if (!order) return res.status(404).json({ ok: false, error: "not_found", message: "查無此訂單，請確認訂單編號與手機號碼" });
    const out = publicOrder(order);
    if (order.status === "pending_payment") out.payment = paymentInstructions(order.orderNo, order.total);
    res.json({ ok: true, order: out });
  }));

  // ---- 管理 API ----
  const admin = express.Router();
  admin.use(requireAdmin);

  admin.get("/orders", asyncH(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    if (status && !orders.STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, error: "validation_error", message: `status 需為 ${orders.STATUSES.join(", ")}` });
    }
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const result = await orders.listOrders({ status, limit, offset });
    res.json({ ok: true, limit, offset, ...result });
  }));

  admin.get("/orders/:orderNo", asyncH(async (req, res) => {
    const order = await orders.getOrder(String(req.params.orderNo).toUpperCase());
    if (!order) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, order });
  }));

  admin.patch("/orders/:orderNo", asyncH(async (req, res) => {
    const body = req.body || {};
    const patch = {};
    const errors = {};
    if (body.status !== undefined) {
      if (!orders.STATUSES.includes(body.status)) errors.status = `需為 ${orders.STATUSES.join(", ")}`;
      else patch.status = body.status;
    }
    if (body.trackingNo !== undefined) {
      if (body.trackingNo !== null && (typeof body.trackingNo !== "string" || !/^[A-Za-z0-9-]{0,40}$/.test(body.trackingNo.trim()))) {
        errors.trackingNo = "寄件編號僅限英數字與 -，最多 40 字";
      } else patch.trackingNo = body.trackingNo === null ? null : body.trackingNo.trim();
    }
    if (body.adminNote !== undefined) {
      if (body.adminNote !== null && (typeof body.adminNote !== "string" || body.adminNote.length > 1000)) errors.adminNote = "最多 1000 字";
      else patch.adminNote = body.adminNote;
    }
    if (Object.keys(errors).length) return res.status(400).json({ ok: false, error: "validation_error", fields: errors });
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: "validation_error", message: "沒有要更新的欄位（status / trackingNo / adminNote）" });
    const order = await orders.updateOrder(String(req.params.orderNo).toUpperCase(), patch);
    if (!order) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, order });
  }));

  r.use("/admin", admin);
  r.use((req, res) => res.status(404).json({ ok: false, error: "not_found" }));
  return r;
}

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "img-src": ["'self'", "data:"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
        "connect-src": ["'self'"],
        "form-action": ["'self'", "mailto:"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  const corsMw = cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, config.corsOrigins.includes("*") || config.corsOrigins.includes(origin));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    maxAge: 600
  });

  const api = express.Router();
  api.use(corsMw);
  api.use(express.json({ limit: "16kb", strict: true, type: ["application/json"] }));
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  api.use(buildApiRouter());

  // 同時掛在 ${BASE_PATH}/api 與 /api：反向代理有沒有去掉 /shop 前綴都能運作
  const mounts = new Set(["/api"]);
  if (config.basePath) mounts.add(config.basePath + "/api");
  for (const m of mounts) app.use(m, api);

  if (config.serveStatic) {
    const dir = path.resolve(__dirname, "..", config.staticDir);
    const staticMw = express.static(dir, {
      index: "index.html",
      dotfiles: "ignore",
      maxAge: config.env === "production" ? "1h" : 0,
      setHeaders: (res, file) => {
        if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      }
    });
    const block = (req, res, next) => (/^\/(server|node_modules)(\/|$)/.test(req.path) ? res.status(404).end() : next());
    if (config.basePath) {
      app.use((req, res, next) => {
        if (req.method === "GET" && req.path === config.basePath) {
          const qs = req.originalUrl.slice(req.originalUrl.indexOf("?") >= 0 ? req.originalUrl.indexOf("?") : req.originalUrl.length);
          return res.redirect(301, config.basePath + "/" + qs);
        }
        next();
      });
      app.use(config.basePath, block, staticMw);
    } else {
      app.use(block, staticMw);
    }
  }

  // 錯誤處理
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") return res.status(413).json({ ok: false, error: "payload_too_large", message: "資料過大" });
    if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "invalid_json", message: "JSON 格式錯誤" });
    console.error(err);
    res.status(500).json({ ok: false, error: "server_error", message: "伺服器發生錯誤，請稍後再試或來信聯絡" });
  });

  return app;
}

module.exports = { createApp, maskName };
