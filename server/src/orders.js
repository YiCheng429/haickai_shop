"use strict";
const crypto = require("crypto");
const pool = require("./db");
const { priceOrder } = require("./products");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 字，去除易混淆的 I O 0 1
const STATUSES = ["pending_payment", "paid", "shipped", "completed", "cancelled"];
const STATUS_LABELS = {
  pending_payment: "待付款",
  paid: "已付款，準備出貨",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消"
};
const STATUS_TIME_COL = { paid: "paid_at", shipped: "shipped_at", completed: "completed_at", cancelled: "cancelled_at" };

function taipeiDateStamp(d = new Date()) {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .replace(/-/g, "");
}

function generateOrderNo() {
  const bytes = crypto.randomBytes(4);
  let code = "";
  for (const b of bytes) code += CODE_CHARS[b % 32]; // 256 可被 32 整除，無偏差
  return `GB-${taipeiDateStamp()}-${code}`;
}

function rowToOrder(row, items) {
  return {
    orderNo: row.order_no,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status],
    name: row.buyer_name,
    phone: row.phone,
    email: row.email,
    storeName: row.store_name,
    storeId: row.store_id ? String(row.store_id).trim() : null,
    note: row.note,
    subtotal: row.subtotal,
    shipping: row.shipping_fee,
    total: row.total,
    trackingNo: row.tracking_no,
    adminNote: row.admin_note,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    paymentLast5: row.payment_last5,
    paymentReportedAt: row.payment_reported_at,
    paymentReportedAmount: row.payment_reported_amount,
    paymentReported: Boolean(row.payment_last5),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (items || []).map((i) => ({
      id: i.product_id,
      name: i.product_name,
      unitPrice: i.unit_price,
      qty: i.qty,
      lineTotal: i.line_total
    }))
  };
}

async function loadItems(client, orderIds) {
  if (!orderIds.length) return new Map();
  const { rows } = await client.query(
    "SELECT * FROM order_items WHERE order_id = ANY($1::bigint[]) ORDER BY id",
    [orderIds]
  );
  const map = new Map();
  for (const r of rows) {
    const key = String(r.order_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}

async function findByIdempotencyKey(key) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE idempotency_key = $1", [key]);
  if (!rows.length) return null;
  const items = await loadItems(pool, [rows[0].id]);
  return rowToOrder(rows[0], items.get(String(rows[0].id)));
}

async function createOrder(input, { idempotencyKey = null, clientIp = null } = {}) {
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(idempotencyKey);
    if (existing) return { order: existing, duplicate: true };
  }
  const priced = priceOrder(input.items);

  for (let attempt = 0; attempt < 6; attempt++) {
    const orderNo = generateOrderNo();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO orders (order_no, idempotency_key, buyer_name, phone, email, store_name, store_id, note,
                             subtotal, shipping_fee, total, client_ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [orderNo, idempotencyKey, input.name, input.phone, input.email, input.storeName, input.storeId, input.note,
          priced.subtotal, priced.shipping, priced.total, clientIp]
      );
      const order = rows[0];
      const itemRows = [];
      for (const l of priced.lines) {
        const r = await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty, line_total)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [order.id, l.productId, l.name, l.unitPrice, l.qty, l.lineTotal]
        );
        itemRows.push(r.rows[0]);
      }
      await client.query("COMMIT");
      return { order: rowToOrder(order, itemRows), duplicate: false };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err.code === "23505") {
        // 唯一鍵衝突：可能是訂單編號撞號（重試），或同一個 idempotency key 併發送出
        if (idempotencyKey && /idempotency/.test(err.constraint || "")) {
          const existing = await findByIdempotencyKey(idempotencyKey);
          if (existing) return { order: existing, duplicate: true };
        }
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
  throw new Error("無法產生唯一訂單編號");
}

async function lookupOrder(orderNo, phone) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE order_no = $1 AND phone = $2", [orderNo, phone]);
  if (!rows.length) return null;
  const items = await loadItems(pool, [rows[0].id]);
  return rowToOrder(rows[0], items.get(String(rows[0].id)));
}

async function getOrder(orderNo) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE order_no = $1", [orderNo]);
  if (!rows.length) return null;
  const items = await loadItems(pool, [rows[0].id]);
  return rowToOrder(rows[0], items.get(String(rows[0].id)));
}

async function listOrders({ status, q, limit = 50, offset = 0 }) {
  const params = [];
  const conds = [];
  let searchCond = "";
  if (q) {
    const term = String(q).trim().toUpperCase();
    const digits = term.replace(/[^0-9]/g, "");
    params.push("%" + term.replace(/[%_\\]/g, "\\$&") + "%");
    const parts = [`order_no ILIKE $${params.length}`];
    if (digits.length >= 3) {
      params.push("%" + digits + "%");
      parts.push(`phone LIKE $${params.length}`);
    }
    searchCond = "(" + parts.join(" OR ") + ")";
    conds.push(searchCond);
  }
  // 各狀態筆數（套用搜尋條件、不套用狀態篩選），供後台分頁籤顯示
  const countsRes = await pool.query(
    `SELECT status, count(*)::int AS n FROM orders ${conds.length ? "WHERE " + conds.join(" AND ") : ""} GROUP BY status`,
    params
  );
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of countsRes.rows) counts[r.status] = r.n;
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
  const repRes = await pool.query(
    `SELECT count(*)::int AS n FROM orders WHERE ${[...conds, "status = 'pending_payment'", "payment_last5 IS NOT NULL"].join(" AND ")}`,
    params
  );
  counts.reported = repRes.rows[0].n;

  if (status === "reported") {
    conds.push("status = 'pending_payment'", "payment_last5 IS NOT NULL");
  } else if (status) {
    params.push(status);
    conds.push(`status = $${params.length}`);
  }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const total = status ? counts[status] : counts.all;
  // 已回報待核對：依回報時間排序，最新回報在前
  const order = status === "reported" ? "payment_reported_at DESC, id DESC" : "created_at DESC, id DESC";
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM orders ${where} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const items = await loadItems(pool, rows.map((r) => r.id));
  return { total, counts, orders: rows.map((r) => rowToOrder(r, items.get(String(r.id)))) };
}

async function updateOrder(orderNo, { status, trackingNo, adminNote }) {
  const sets = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    sets.push(sql.replace("?", "$" + params.length));
  };
  if (status !== undefined) {
    add("status = ?::order_status", status);
    const col = STATUS_TIME_COL[status];
    if (col) sets.push(`${col} = COALESCE(${col}, now())`);
  }
  if (trackingNo !== undefined) add("tracking_no = ?", trackingNo || null);
  if (adminNote !== undefined) add("admin_note = ?", adminNote || null);
  sets.push("updated_at = now()");
  params.push(orderNo);
  const { rows } = await pool.query(
    `UPDATE orders SET ${sets.join(", ")} WHERE order_no = $${params.length} RETURNING *`,
    params
  );
  if (!rows.length) return null;
  const items = await loadItems(pool, [rows[0].id]);
  return rowToOrder(rows[0], items.get(String(rows[0].id)));
}

/* 買家回報匯款帳號後五碼。可重複回報（覆寫）；僅限待付款訂單。
   回傳 { order } 或 { error: "not_found" | "not_pending", order? } */
async function reportPayment(orderNo, phone, { last5, amount = null }) {
  const { rows } = await pool.query(
    `UPDATE orders
        SET payment_last5 = $3, payment_reported_amount = $4, payment_reported_at = now(), updated_at = now()
      WHERE order_no = $1 AND phone = $2 AND status = 'pending_payment'
      RETURNING *`,
    [orderNo, phone, last5, amount]
  );
  if (rows.length) {
    const items = await loadItems(pool, [rows[0].id]);
    return { order: rowToOrder(rows[0], items.get(String(rows[0].id))) };
  }
  const existing = await lookupOrder(orderNo, phone);
  if (!existing) return { error: "not_found" };
  return { error: "not_pending", order: existing };
}

module.exports = {
  reportPayment,
  STATUSES, STATUS_LABELS, generateOrderNo, taipeiDateStamp,
  createOrder, lookupOrder, getOrder, listOrders, updateOrder
};
