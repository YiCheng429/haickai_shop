"use strict";

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_THRESHOLD = 5;
const LOCK_BASE_MS = 15 * 60 * 1000;
const LOCK_MAX_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, { fails: number[], lockUntil: number, lockMs: number }>} */
const store = new Map();

function now() {
  return Date.now();
}

function normalizeIp(ip) {
  let s = String(ip || "").trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (s.toLowerCase().startsWith("::ffff:")) s = s.slice(7);
  return s || "unknown";
}

function clientIp(req) {
  // 依賴 app.set("trust proxy")：Railway 設 TRUST_PROXY=1 時 req.ip 為真實客戶端，而非邊緣代理。
  // 正規化 IPv4-mapped IPv6，避免同一個客戶被分成兩個限流鍵。
  return normalizeIp(req.ip || req.socket?.remoteAddress || "");
}

function getOrCreate(ip) {
  let s = store.get(ip);
  if (!s) {
    s = { fails: [], lockUntil: 0, lockMs: 0 };
    store.set(ip, s);
  }
  return s;
}

function pruneFails(s, at) {
  s.fails = s.fails.filter((t) => at - t < FAIL_WINDOW_MS);
}

function pruneStore(at) {
  if (store.size < 2000) return;
  for (const [ip, s] of store) {
    pruneFails(s, at);
    if (s.lockUntil && at >= s.lockUntil && s.fails.length === 0) store.delete(ip);
    else if (!s.lockUntil && s.fails.length === 0 && s.lockMs === 0) store.delete(ip);
  }
}

function lockRemainingSeconds(s, at = now()) {
  if (!s || !s.lockUntil || at >= s.lockUntil) return 0;
  return Math.max(1, Math.ceil((s.lockUntil - at) / 1000));
}

function getLock(ip, at = now()) {
  const s = store.get(ip);
  if (!s) return null;
  if (s.lockUntil && at >= s.lockUntil) {
    s.lockUntil = 0;
    pruneFails(s, at);
  }
  const seconds = lockRemainingSeconds(s, at);
  return seconds ? { seconds, lockUntil: s.lockUntil, lockMs: s.lockMs } : null;
}

function recordFailure(ip, at = now()) {
  pruneStore(at);
  const s = getOrCreate(ip);
  if (s.lockUntil && at < s.lockUntil) {
    return { locked: true, seconds: lockRemainingSeconds(s, at), appliedNow: false };
  }
  pruneFails(s, at);
  s.fails.push(at);
  if (s.fails.length >= FAIL_THRESHOLD) {
    const next = s.lockMs ? Math.min(s.lockMs * 2, LOCK_MAX_MS) : LOCK_BASE_MS;
    s.lockMs = next;
    s.lockUntil = at + next;
    s.fails = [];
    // 第 5 次失敗仍回 401，後續請求才 429（見測試：401 x5 then 429）
    return { locked: false, seconds: 0, appliedNow: true, lockMs: next };
  }
  return { locked: false, seconds: 0, appliedNow: false };
}

function recordSuccess(ip) {
  const s = store.get(ip);
  if (!s) return;
  s.fails = [];
  s.lockMs = 0;
  s.lockUntil = 0;
  store.delete(ip);
}

function resetAdminAuthLocks() {
  store.clear();
}

function sendLocked(res, seconds) {
  res.set("Retry-After", String(seconds));
  return res.status(429).json({
    ok: false,
    error: "rate_limited",
    message: "嘗試次數過多，請稍後再試"
  });
}

function adminLockGuard(req, res, next) {
  const lock = getLock(clientIp(req));
  if (lock) return sendLocked(res, lock.seconds);
  next();
}

module.exports = {
  FAIL_WINDOW_MS,
  FAIL_THRESHOLD,
  LOCK_BASE_MS,
  LOCK_MAX_MS,
  normalizeIp,
  clientIp,
  getLock,
  recordFailure,
  recordSuccess,
  resetAdminAuthLocks,
  adminLockGuard,
  sendLocked
};
