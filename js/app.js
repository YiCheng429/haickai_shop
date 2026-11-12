const CONFIG = {
  brandName: "微光盲盒",
  brandNameEn: "Glimmer Box",
  tagline: "項鍊、手鍊、戒指與綜合驚喜盒。確認匯款後，以 7-ELEVEN 交貨便店到店寄出。",
  email: "haickaiservice@gmail.com",
  storeLookupUrl: "https://emap.pcsc.com.tw/",
  shippingName: "7-ELEVEN 交貨便・本島一般店到店",
  freeShippingThreshold: 600, // 商品小計滿此金額免運
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
const MAX_QTY = 10;

const state = {
  cart: loadCart(),
  orderNo: ""
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
  const existing = state.cart.find((i) => i.id === id);
  if (existing) existing.qty = Math.min(MAX_QTY, existing.qty + qty);
  else state.cart.push({ id, qty: Math.min(MAX_QTY, qty) });
  state.orderNo = "";
  saveCart();
  renderCart();
}

function setCartQty(id, qty) {
  if (qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
  else {
    const item = state.cart.find((i) => i.id === id);
    if (item) item.qty = Math.min(MAX_QTY, qty);
  }
  state.orderNo = "";
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
  lines.push("付款方式：匯款／轉帳（請等候賣家來回信提供帳戶資訊，確認收款後出貨）。");
  lines.push("配送：7-ELEVEN 交貨便店到店。");
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
  const digits = b.phone.replace(/\D/g, "");
  if (digits.length < 8) {
    toast("請填寫有效的聯絡電話");
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

function showConfirmation() {
  const box = document.getElementById("order-confirm");
  const no = document.getElementById("confirm-order-no");
  if (no) no.textContent = state.orderNo;
  box?.classList.add("is-visible");
}

async function submitOrder() {
  if (!validateBuyer()) return;
  ensureOrderNo();
  updateOrderText();
  await copyOrder();
  const href = mailtoHref();
  window.location.href = href;
  showConfirmation();
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
});
