const CONFIG = {
  brandName: "微光盲盒",
  brandNameEn: "Glimmer Box",
  tagline: "項鍊、手鍊、戒指與綜合驚喜盒。確認匯款後，以 7-ELEVEN 交貨便店到店寄出。",
  email: "haickaiservice@gmail.com",
  storeLookupUrl: "https://emap.pcsc.com.tw/",
  shippingName: "7-ELEVEN 交貨便・本島一般店到店",
  freeShippingThreshold: 600, // 商品小計滿此金額免運（需與 server/src/products.js 一致）
  // 訂單 API 位置。相對路徑：頁面在 /shop/ 時會送到 /shop/api。
  // API 無法連線時（例如 GitHub Pages 預覽），結帳會自動改用 Email 送出訂單。
  apiBase: "api",
  apiTimeoutMs: 12000,
  products: [
    {
      id: "ring",
      name: "戒指盲盒",
      desc: "隨機一枚當季戒指。每盒從當季系列中出貨一款設計。",
      price: 199,
      image: "images/ring.webp"
    },
    {
      id: "bracelet",
      name: "手鍊盲盒",
      desc: "隨機一款當季手鍊。每盒從當季系列中出貨一款設計。",
      price: 249,
      image: "images/bracelet.webp"
    },
    {
      id: "necklace",
      name: "項鍊盲盒",
      desc: "隨機一款當季項鍊。每盒從當季系列中出貨一款設計。",
      price: 299,
      image: "images/necklace.webp"
    },
    {
      id: "combo",
      name: "綜合驚喜盒",
      desc: "項鍊、手鍊、戒指各一，皆從當季系列中隨機出貨。",
      price: 399,
      image: "images/combo.webp"
    }
  ]
};

const STORAGE_KEY = "glimmer-box-cart-v2";
const MAX_QTY = 10; // 需與 server/src/validate.js 的 MAX_QTY 一致

const state = {
  cart: loadCart(),
  orderNo: "",
  idempotencyKey: "",
  lastPhone: "",
  submitting: false
};

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => ({ id: item.id, qty: Number(item.qty) }))
      .filter((item) => CONFIG.products.some((p) => p.id === item.id) && item.qty > 0);
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
}

function productById(id) {
  return CONFIG.products.find((p) => p.id === id);
}

function cartCount() {
  return state.cart.reduce((n, item) => n + item.qty, 0);
}

function cartSubtotal() {
  return state.cart.reduce((n, item) => {
    const p = productById(item.id);
    return n + (p ? p.price * item.qty : 0);
  }, 0);
}

/* 依 7-ELEVEN 官方一般交貨便「包裹價值」級距計算本島運費。
   離島同級距目前優惠價相同；實際費用以寄件時公告為準。 */
function shippingFee(subtotal) {
  if (!subtotal) return 0;
  if (subtotal >= CONFIG.freeShippingThreshold) return 0;
  if (subtotal <= 1000) return 60;
  if (subtotal <= 2000) return 70;
  if (subtotal <= 3000) return 80;
  if (subtotal <= 4000) return 90;
  return 100;
}

function formatNT(n) {
  return "NT$" + Number(n).toLocaleString("zh-Hant-TW");
}

function setText(selector, text) {
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = text;
  });
}

function resetPendingOrder() {
  state.orderNo = "";
  state.idempotencyKey = "";
}

/* 線上下單成功後隱藏「複製訂單內容」（訂單已存在伺服器，無需再寄信）；購物車有變動時再顯示 */
function setCopyOrderVisible(visible) {
  const btn = document.getElementById("copy-order");
  if (btn) btn.hidden = !visible;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function normalizePhone(value) {
  let s = String(value || "").replace(/[\s\-()]/g, "");
  if (s.startsWith("+886")) s = "0" + s.slice(4);
  return s;
}

function randomKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => n.toString(16).padStart(2, "0")).join("");
}

function apiUrl(path) {
  const base = CONFIG.apiBase.endsWith("/") ? CONFIG.apiBase : CONFIG.apiBase + "/";
  return new URL(base + path, document.baseURI).toString();
}

/* 呼叫 API。回傳 { reachable, status, data }；網路錯誤、逾時或回應不是本站 API（如靜態主機的 404 頁）時 reachable 為 false。 */
async function callApi(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.apiTimeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
      signal: controller.signal,
      cache: "no-store"
    });
    const type = res.headers.get("content-type") || "";
    let data = null;
    if (type.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    }
    if (!data || typeof data.ok !== "boolean") return { reachable: false, status: res.status, data: null };
    return { reachable: true, status: res.status, data };
  } catch {
    return { reachable: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

function generateOrderNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  for (const n of arr) code += chars[n % chars.length];
  return `GB-${y}${m}${day}-${code}`;
}

function applyBrand() {
  setText("[data-bind='brandName']", CONFIG.brandName);
  setText("[data-bind='brandNameEn']", CONFIG.brandNameEn);
  setText("[data-bind='tagline']", CONFIG.tagline);
  setText("[data-bind='email']", CONFIG.email);
  setText("[data-bind='shippingName']", CONFIG.shippingName);
  document.querySelectorAll("[data-href='email']").forEach((a) => {
    a.href = "mailto:" + CONFIG.email;
  });
  document.querySelectorAll("[data-href='storeLookup']").forEach((a) => {
    a.href = CONFIG.storeLookupUrl;
  });
}

function renderProducts() {
  const root = document.getElementById("product-grid");
  if (!root) return;
  root.innerHTML = CONFIG.products
    .map(
      (p) => `
      <article class="product-card" data-product="${p.id}">
        <img src="${p.image}" alt="${p.name}" width="800" height="800">
        <div class="product-body">
          <h3>${p.name}</h3>
          <p>${p.desc}</p>
          <div class="price">${formatNT(p.price)}</div>
          <div class="product-actions">
            <div class="qty" data-qty-for="${p.id}">
              <button type="button" data-step="-1" aria-label="減少數量">−</button>
              <input type="text" value="1" inputmode="numeric" aria-label="${p.name}數量" readonly>
              <button type="button" data-step="1" aria-label="增加數量">+</button>
            </div>
            <button type="button" class="btn btn-gold" data-add="${p.id}">加入購物車</button>
          </div>
        </div>
      </article>`
    )
    .join("");

  root.querySelectorAll(".qty").forEach((wrap) => {
    const input = wrap.querySelector("input");
    wrap.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = Math.min(MAX_QTY, Math.max(1, Number(input.value) + Number(btn.dataset.step)));
        input.value = String(next);
      });
    });
  });

  root.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-add");
      const card = btn.closest(".product-card");
      const qty = Number(card.querySelector(".qty input").value) || 1;
      addToCart(id, qty);
      toast(`已加入購物車：${productById(id).name} × ${qty}`);
    });
  });
}

function addToCart(id, qty) {
  setCopyOrderVisible(true);
  const existing = state.cart.find((i) => i.id === id);
  if (existing) existing.qty = Math.min(MAX_QTY, existing.qty + qty);
  else state.cart.push({ id, qty: Math.min(MAX_QTY, qty) });
  resetPendingOrder();
  saveCart();
  renderCart();
}

function setCartQty(id, qty) {
  setCopyOrderVisible(true);
  if (qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
  else {
    const item = state.cart.find((i) => i.id === id);
    if (item) item.qty = Math.min(MAX_QTY, qty);
  }
  resetPendingOrder();
  saveCart();
  renderCart();
}

function renderCart() {
  setText("[data-bind='cartCount']", String(cartCount()));
  const list = document.getElementById("cart-list");
  const empty = document.getElementById("cart-empty");
  if (!list) return;

  if (!state.cart.length) {
    list.innerHTML = "";
    empty.hidden = false;
  } else {
    empty.hidden = true;
    list.innerHTML = state.cart
      .map((item) => {
        const p = productById(item.id);
        return `
          <div class="cart-item" data-cart-item="${p.id}">
            <img src="${p.image}" alt="">
            <div>
              <h4>${p.name}</h4>
              <div class="meta">${formatNT(p.price)}</div>
              <div class="qty">
                <button type="button" data-cart-step="-1" aria-label="減少">−</button>
                <input type="text" value="${item.qty}" readonly aria-label="數量">
                <button type="button" data-cart-step="1" aria-label="增加">+</button>
              </div>
            </div>
            <div>
              <div>${formatNT(p.price * item.qty)}</div>
              <button type="button" class="remove" data-remove="${p.id}">移除</button>
            </div>
          </div>`;
      })
      .join("");

    list.querySelectorAll(".cart-item").forEach((row) => {
      const id = row.getAttribute("data-cart-item");
      const item = state.cart.find((i) => i.id === id);
      row.querySelectorAll("[data-cart-step]").forEach((btn) => {
        btn.addEventListener("click", () => setCartQty(id, item.qty + Number(btn.getAttribute("data-cart-step"))));
      });
      row.querySelector("[data-remove]").addEventListener("click", () => setCartQty(id, 0));
    });
  }

  const sub = cartSubtotal();
  const ship = shippingFee(sub);
  setText("[data-bind='subtotal']", formatNT(sub));
  setText("[data-bind='shipDisplay']", !state.cart.length ? "NT$0" : ship === 0 ? "免運" : formatNT(ship));
  setText("[data-bind='total']", formatNT(sub + ship));
  const left = CONFIG.freeShippingThreshold - sub;
  setText("[data-bind='freeShipHint']", !state.cart.length
    ? `商品滿 ${formatNT(CONFIG.freeShippingThreshold)} 免運`
    : left > 0 ? `再買 ${formatNT(left)} 即可免運` : "已達免運門檻，本單免運費 🎉");
  updateOrderText();
}

function buyerValues() {
  return {
    name: (document.getElementById("buyer-name")?.value || "").trim(),
    phone: (document.getElementById("buyer-phone")?.value || "").trim(),
    email: (document.getElementById("buyer-email")?.value || "").trim(),
    storeName: (document.getElementById("store-name")?.value || "").trim(),
    storeNo: (document.getElementById("store-no")?.value || "").trim(),
    notes: (document.getElementById("buyer-notes")?.value || "").trim()
  };
}

function ensureOrderNo() {
  if (!state.orderNo) state.orderNo = generateOrderNo();
  return state.orderNo;
}

function buildOrderText() {
  const b = buyerValues();
  const orderNo = state.orderNo || "（送出時產生）";
  const lines = [];
  lines.push(`【${CONFIG.brandName} ${CONFIG.brandNameEn} 訂單】`);
  lines.push(`訂單編號：${orderNo}`);
  lines.push(`網站：${location.origin}${location.pathname}`);
  lines.push("");
  lines.push(`取件人姓名：${b.name || "（尚未填寫）"}`);
  lines.push(`電話：${b.phone || "（尚未填寫）"}`);
  lines.push(`Email：${b.email || "（尚未填寫）"}`);
  lines.push(`取貨門市：${b.storeName || "（尚未填寫）"}`);
  lines.push(`門市店號：${b.storeNo || "（尚未填寫）"}`);
  lines.push(`備註：${b.notes || "（無）"}`);
  lines.push("");
  lines.push("商品：");
  if (!state.cart.length) lines.push("（購物車是空的）");
  else {
    state.cart.forEach((item) => {
      const p = productById(item.id);
      lines.push(`- ${p.name} × ${item.qty}　${formatNT(p.price * item.qty)}`);
    });
  }
  const sub = cartSubtotal();
  const ship = shippingFee(sub);
  lines.push("");
  lines.push(`商品小計：${formatNT(sub)}`);
  lines.push(`運費（${CONFIG.shippingName}）：${state.cart.length && ship === 0 ? "免運（滿 " + formatNT(CONFIG.freeShippingThreshold) + "）" : formatNT(state.cart.length ? ship : 0)}`);
  lines.push(`合計：${formatNT(sub + (state.cart.length ? ship : 0))}`);
  lines.push("");
  lines.push("付款方式：匯款／轉帳（請等候賣家來回信提供帳戶資訊；匯款後請回信告知轉出帳號後五碼，確認收款後出貨）。");
  lines.push("配送：7-ELEVEN 交貨便店到店。交貨便寄件成立後，取貨通知會以 Email 與簡訊傳送給你。");
  lines.push(`若郵件未能自動開啟，請將此內容寄至 ${CONFIG.email}`);
  return lines.join("\n");
}

function updateOrderText() {
  const area = document.getElementById("order-text");
  if (area) area.value = buildOrderText();
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateBuyer() {
  const b = buyerValues();
  if (!state.cart.length) {
    toast("請先選購商品再送出訂單");
    return false;
  }
  if (!b.name) {
    toast("請填寫取件人姓名");
    document.getElementById("buyer-name")?.focus();
    return false;
  }
  if (!/^09\d{8}$/.test(normalizePhone(b.phone))) {
    toast("請填寫 09 開頭的 10 碼手機號碼");
    document.getElementById("buyer-phone")?.focus();
    return false;
  }
  if (!isValidEmail(b.email)) {
    toast("請填寫有效的 Email");
    document.getElementById("buyer-email")?.focus();
    return false;
  }
  if (!b.storeName) {
    toast("請填寫取貨門市名稱");
    document.getElementById("store-name")?.focus();
    return false;
  }
  const storeDigits = b.storeNo.replace(/\D/g, "");
  if (storeDigits.length !== 6) {
    toast("請填寫 6 碼門市店號");
    document.getElementById("store-no")?.focus();
    return false;
  }
  return true;
}

async function copyOrder() {
  const text = buildOrderText();
  try {
    await navigator.clipboard.writeText(text);
    toast("訂單內容已複製");
    return true;
  } catch {
    const area = document.getElementById("order-text");
    area?.focus();
    area?.select();
    try {
      document.execCommand("copy");
      toast("訂單內容已複製");
      return true;
    } catch {
      toast("請手動全選並複製訂單內容");
      return false;
    }
  }
}

function mailtoHref() {
  const orderNo = ensureOrderNo();
  const subject = `${CONFIG.brandName}訂單 ${orderNo}`;
  const body = buildOrderText();
  return `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* Email 備援流程（API 無法使用時）的確認訊息 */
function showConfirmation() {
  const box = document.getElementById("order-confirm");
  const title = document.getElementById("confirm-title");
  const body = document.getElementById("confirm-body");
  if (title) title.textContent = "訂單已準備送出";
  if (body) {
    body.innerHTML = `<p>你的訂單編號是 <span class="order-no">${escapeHtml(state.orderNo)}</span>。請在郵件視窗中按下傳送。我們會回信提供匯款資訊，匯款後請回信告知轉出帳號後五碼；確認收款後，將以 7-ELEVEN 交貨便店到店寄至你指定的門市，約 3 至 5 個工作天出貨；交貨便寄件成立後，取貨通知會以 Email 與簡訊傳送給你。若郵件沒有開啟，請將上方訂單內容寄至 ${escapeHtml(CONFIG.email)}。</p>`;
  }
  box?.classList.remove("is-error");
  box?.classList.add("is-visible");
}

/* 線上下單成功：顯示伺服器回傳的訂單編號、金額與匯款資訊 */
function showServerConfirmation(order, payment) {
  const box = document.getElementById("order-confirm");
  const title = document.getElementById("confirm-title");
  const body = document.getElementById("confirm-body");
  const items = (order.items || [])
    .map((i) => `<li>${escapeHtml(i.name)} × ${escapeHtml(i.qty)}　${formatNT(i.lineTotal)}</li>`)
    .join("");
  let bank = "";
  if (payment && payment.configured) {
    bank = `
      <dl>
        <dt>銀行</dt><dd>${escapeHtml(payment.bankName)}${payment.bankCode ? `（${escapeHtml(payment.bankCode)}）` : ""}</dd>
        <dt>帳號</dt><dd class="order-no">${escapeHtml(payment.account)}</dd>
        ${payment.accountName ? `<dt>戶名</dt><dd>${escapeHtml(payment.accountName)}</dd>` : ""}
      </dl>`;
  }
  setCopyOrderVisible(false);
  if (title) title.textContent = "訂單已成立";
  if (body) {
    body.innerHTML = `
      <p>你的訂單編號是 <span class="order-no">${escapeHtml(order.orderNo)}</span>，請記下此編號以便查詢。</p>
      <dl>
        <dt>商品小計</dt><dd>${formatNT(order.subtotal)}</dd>
        <dt>運費</dt><dd>${order.shipping === 0 ? "免運" : formatNT(order.shipping)}</dd>
        <dt>應付金額</dt><dd class="amount">${formatNT(order.total)}</dd>
      </dl>
      <ul>${items}</ul>
      ${bank}
      <p>${escapeHtml(payment?.message || "")}</p>
      ${reportFormHtml(order.orderNo, state.lastPhone, null)}
      <p>可隨時於「訂單查詢」以訂單編號與手機號碼查看進度，問題請來信 ${escapeHtml(CONFIG.email)}。</p>`;
  }
  box?.classList.remove("is-error");
  box?.classList.add("is-visible");
  box?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const FIELD_INPUT_IDS = {
  name: "buyer-name",
  phone: "buyer-phone",
  email: "buyer-email",
  storeName: "store-name",
  storeId: "store-no",
  note: "buyer-notes"
};

/* Email 備援：沿用原本的複製＋mailto 流程 */
async function submitOrderByEmail() {
  ensureOrderNo();
  updateOrderText();
  await copyOrder();
  const href = mailtoHref();
  window.location.href = href;
  showConfirmation();
}

function setSubmitting(on) {
  state.submitting = on;
  const btn = document.getElementById("submit-order");
  if (!btn) return;
  btn.disabled = on;
  btn.textContent = on ? "送出中…" : "送出訂單";
}

async function submitOrder() {
  if (state.submitting) return;
  if (!validateBuyer()) return;
  const b = buyerValues();
  if (!state.idempotencyKey) state.idempotencyKey = randomKey();
  const payload = {
    name: b.name,
    phone: normalizePhone(b.phone),
    email: b.email,
    storeName: b.storeName,
    storeId: b.storeNo.replace(/\D/g, ""),
    note: b.notes,
    items: state.cart.map((i) => ({ id: i.id, qty: i.qty }))
  };

  setSubmitting(true);
  let result;
  try {
    result = await callApi("orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": state.idempotencyKey },
      body: JSON.stringify(payload)
    });
  } finally {
    setSubmitting(false);
  }

  const { reachable, status, data } = result;
  if (reachable && data.ok) {
    state.lastPhone = payload.phone;
    state.cart = [];
    saveCart();
    resetPendingOrder();
    ["buyer-notes"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderCart();
    showServerConfirmation(data.order, data.payment);
    toast(`訂單已成立：${data.order.orderNo}`);
    return;
  }
  if (reachable && status === 400) {
    const fields = data.fields || {};
    const first = Object.keys(fields)[0];
    toast(first ? fields[first] : data.message || "訂單資料有誤，請再確認");
    if (first && FIELD_INPUT_IDS[first]) document.getElementById(FIELD_INPUT_IDS[first])?.focus();
    return;
  }
  if (reachable && status === 429) {
    toast(data.message || "送出次數過多，請稍後再試");
    return;
  }
  // API 無法連線或伺服器錯誤：改用 Email 送出
  toast("線上下單暫時無法使用，已改為以 Email 送出訂單");
  await submitOrderByEmail();
}

/* 匯款回報（帳號後五碼） */
function reportStatusText(o) {
  if (o && o.paymentLast5) {
    return `已回報轉出帳號後五碼 ${o.paymentLast5}（${formatDateTime(o.paymentReportedAt)}），我們核對後會更新訂單狀態。如需修改可重新送出。`;
  }
  return "匯款後請填寫轉出帳號後五碼，方便我們核對入帳。";
}

function reportFormHtml(orderNo, phone, order) {
  return `
    <form class="report-form" data-order-no="${escapeHtml(orderNo)}" data-phone="${escapeHtml(phone || "")}" novalidate>
      <h5>回報匯款</h5>
      <p class="report-status">${escapeHtml(reportStatusText(order))}</p>
      <div class="report-row">
        <label>轉出帳號後五碼
          <input type="text" name="last5" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="例如 12345" value="${escapeHtml(order?.paymentLast5 || "")}">
        </label>
        <button type="submit" class="btn btn-ink">回報匯款</button>
      </div>
    </form>`;
}

async function submitPaymentReport(form) {
  const input = form.querySelector("input[name='last5']");
  const btn = form.querySelector("button[type='submit']");
  const statusEl = form.querySelector(".report-status");
  const last5 = (input?.value || "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(last5)) {
    toast("請填寫 5 位數字的轉出帳號後五碼");
    input?.focus();
    return;
  }
  const orderNo = form.dataset.orderNo;
  const phone = form.dataset.phone;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "送出中…";
  }
  let result;
  try {
    result = await callApi(`orders/${encodeURIComponent(orderNo)}/payment-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, last5 })
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "回報匯款";
    }
  }
  const { reachable, data } = result;
  if (!reachable) {
    toast(`線上回報暫時無法使用，請來信 ${CONFIG.email} 告知訂單編號與帳號後五碼`);
    return;
  }
  if (!data.ok) {
    toast(data.message || "回報失敗，請稍後再試");
    return;
  }
  if (statusEl) statusEl.textContent = reportStatusText(data.order);
  toast("已收到匯款回報，謝謝！");
}

/* 訂單查詢 */
function renderLookupResult(html) {
  const box = document.getElementById("lookup-result");
  if (!box) return;
  box.innerHTML = html;
  box.hidden = false;
}

function formatDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-Hant-TW", { timeZone: "Asia/Taipei", hour12: false });
  } catch {
    return iso;
  }
}

async function lookupOrder(e) {
  e?.preventDefault();
  const noEl = document.getElementById("lookup-order-no");
  const phoneEl = document.getElementById("lookup-phone");
  const orderNo = (noEl?.value || "").trim().toUpperCase();
  const phone = normalizePhone(phoneEl?.value || "");
  if (!/^GB-\d{8}-[A-Z0-9]{4}$/.test(orderNo)) {
    toast("請輸入正確的訂單編號，例如 GB-20260101-ABCD");
    noEl?.focus();
    return;
  }
  if (!/^09\d{8}$/.test(phone)) {
    toast("請輸入下單時填寫的 09 開頭手機號碼");
    phoneEl?.focus();
    return;
  }
  const btn = document.getElementById("lookup-submit");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "查詢中…";
  }
  let result;
  try {
    result = await callApi(`orders/${encodeURIComponent(orderNo)}?phone=${encodeURIComponent(phone)}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "查詢訂單";
    }
  }
  const { reachable, data } = result;
  if (!reachable) {
    renderLookupResult(`<p>線上查詢暫時無法使用，請來信 <a href="mailto:${escapeHtml(CONFIG.email)}">${escapeHtml(CONFIG.email)}</a> 並附上訂單編號，我們會盡快回覆。</p>`);
    return;
  }
  if (!data.ok) {
    renderLookupResult(`<p>${escapeHtml(data.message || "查無此訂單，請確認訂單編號與手機號碼")}</p>`);
    return;
  }
  const o = data.order;
  const items = (o.items || []).map((i) => `<li>${escapeHtml(i.name)} × ${escapeHtml(i.qty)}　${formatNT(i.lineTotal)}</li>`).join("");
  const rows = [
    ["下單時間", formatDateTime(o.createdAt)],
    ["取件人", o.name],
    ["取貨門市", `${o.storeName}（${o.storeId}）`],
    ["應付金額", `${formatNT(o.total)}（運費 ${o.shipping === 0 ? "免運" : formatNT(o.shipping)}）`]
  ];
  if (o.paidAt) rows.push(["確認收款", formatDateTime(o.paidAt)]);
  if (o.shippedAt) rows.push(["出貨時間", formatDateTime(o.shippedAt)]);
  if (o.trackingNo) rows.push(["交貨便寄件編號", o.trackingNo]);
  const shipNote = o.status === "shipped" ? `<p>交貨便寄件成立後，取貨通知會以 Email 與簡訊傳送給你。</p>` : "";
  let pay = "";
  if (o.status === "pending_payment" && o.payment) {
    pay = o.payment.configured
      ? `<p>匯款帳戶：${escapeHtml(o.payment.bankName)}${o.payment.bankCode ? `（${escapeHtml(o.payment.bankCode)}）` : ""} ${escapeHtml(o.payment.account)}${o.payment.accountName ? `，戶名 ${escapeHtml(o.payment.accountName)}` : ""}。</p><p>${escapeHtml(o.payment.message)}</p>`
      : `<p>${escapeHtml(o.payment.message)}</p>`;
  }
  if (o.status === "pending_payment") pay += reportFormHtml(o.orderNo, phone, o);
  renderLookupResult(`
    <h4>${escapeHtml(o.orderNo)}<span class="status-badge${o.status === "cancelled" ? " is-cancelled" : ""}">${escapeHtml(o.statusLabel)}</span></h4>
    <dl>${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>
    <ul>${items}</ul>
    ${pay}${shipNote}`);
}

function bindUi() {
  document.getElementById("menu-btn")?.addEventListener("click", () => {
    const nav = document.getElementById("mobile-nav");
    const btn = document.getElementById("menu-btn");
    const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll("#mobile-nav a").forEach((a) => {
    a.addEventListener("click", () => {
      document.getElementById("mobile-nav")?.classList.remove("open");
      document.getElementById("menu-btn")?.setAttribute("aria-expanded", "false");
    });
  });

  ["buyer-name", "buyer-phone", "buyer-email", "store-name", "store-no", "buyer-notes"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateOrderText);
  });
  document.getElementById("copy-order")?.addEventListener("click", async () => {
    if (!validateBuyer()) return;
    ensureOrderNo();
    updateOrderText();
    await copyOrder();
    showConfirmation();
  });
  document.getElementById("submit-order")?.addEventListener("click", submitOrder);
  document.getElementById("lookup-form")?.addEventListener("submit", lookupOrder);
  document.addEventListener("submit", (e) => {
    const form = e.target.closest?.(".report-form");
    if (!form) return;
    e.preventDefault();
    submitPaymentReport(form);
  });
  document.querySelectorAll("[data-scroll-cart]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("order")?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

// 每次進入網站都從頁面最上方開始
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
function scrollToTopOnEnter() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  const html = document.documentElement;
  const prev = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  html.style.scrollBehavior = prev;
}
window.addEventListener("pageshow", scrollToTopOnEnter);
window.addEventListener("load", scrollToTopOnEnter);

document.addEventListener("DOMContentLoaded", () => {
  scrollToTopOnEnter();
  applyBrand();
  renderProducts();
  renderCart();
  bindUi();
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
});
