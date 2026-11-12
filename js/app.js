/* ============================================================
 * 微光盲盒 Glimmer Box — 賣家設定區
 * 開賣前請只改這份 CONFIG（網址、價格、聯絡方式、賣貨便連結）。
 * 賣貨便沒有對外結帳 API：請先在 myship.7-11.com.tw 建立賣場，
 * 再把賣場網址貼到 myshipUrl；若單一商品有獨立連結，填 products[].myshipUrl。
 * ============================================================ */
const CONFIG = {
  brandName: "微光盲盒",
  brandNameEn: "Glimmer Box",
  tagline: "每一盒，都是一次微光相遇。項鍊、手鍊、戒指與綜合盲盒，以 7-ELEVEN 賣貨便寄出。",
  siteUrl: "https://haickai.com",

  /* 請改成你的賣貨便賣場網址，例如 https://myship.7-11.com.tw/general/detail/GM000000000 */
  myshipUrl: "https://myship.7-11.com.tw/",

  instagramUrl: "https://www.instagram.com/your_ig_here",
  instagramHandle: "@your_ig_here",
  lineUrl: "https://line.me/ti/p/your_line_id",
  lineId: "@your_line_id",
  email: "hello@haickai.com",

  /* 結帳頁顯示的運費（新台幣）。實際金額以賣貨便結帳為準。
     2026/11/1–11/30 官網公告：本離島常溫店取優惠 NT$38（定價 NT$60）。 */
  shippingFee: 38,
  shippingName: "7-ELEVEN 賣貨便・常溫店取",
  shippingNote:
    "運費為示例，實際金額以賣貨便結帳為準。依官方服務條款，常溫店取定價為本島每筆 NT$60、離島每筆 NT$140，優惠價依官網公告。2026 年 11 月 1 日至 11 月 30 日，本離島常溫店取優惠價為 NT$38。",

  products: [
    {
      id: "necklace",
      name: "星河項鍊盲盒",
      desc: "隨機一款項鍊。可能是細鍊、墜飾或珍珠點綴——拆開才知道是哪一道星光。",
      price: 199,
      image: "images/necklace.svg",
      myshipUrl: ""
    },
    {
      id: "bracelet",
      name: "月光手鍊盲盒",
      desc: "隨機一款手鍊。串珠、細鍊或小吊飾，戴上手腕就像把月光圈起來。",
      price: 249,
      image: "images/bracelet.svg",
      myshipUrl: ""
    },
    {
      id: "ring",
      name: "晨露戒指盲盒",
      desc: "隨機一枚戒指。素圈、細鑽風或柔粉石色，每一枚都像一滴剛好落下的晨露。",
      price: 299,
      image: "images/ring.svg",
      myshipUrl: ""
    },
    {
      id: "combo",
      name: "微光綜合盲盒",
      desc: "一次相遇三種驚喜：項鍊、手鍊、戒指各一款，組合成屬於你的微光套組。",
      price: 599,
      image: "images/combo.svg",
      myshipUrl: ""
    }
  ]
};

const STORAGE_KEY = "glimmer-box-cart-v1";
const MAX_QTY = 10;

const state = {
  cart: loadCart()
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

function formatNT(n) {
  return "NT$" + Number(n).toLocaleString("zh-Hant-TW");
}

function isMyshipPlaceholder(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.hostname === "myship.7-11.com.tw" && (u.pathname === "/" || u.pathname === "");
  } catch {
    return true;
  }
}

function checkoutUrl() {
  const unique = [...new Set(state.cart.map((i) => i.id))];
  if (unique.length === 1) {
    const p = productById(unique[0]);
    if (p && p.myshipUrl && !isMyshipPlaceholder(p.myshipUrl)) return p.myshipUrl;
  }
  return CONFIG.myshipUrl;
}

function setText(selector, text) {
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = text;
  });
}

function applyBrand() {
  setText("[data-bind='brandName']", CONFIG.brandName);
  setText("[data-bind='brandNameEn']", CONFIG.brandNameEn);
  setText("[data-bind='tagline']", CONFIG.tagline);
  setText("[data-bind='igHandle']", CONFIG.instagramHandle);
  setText("[data-bind='lineId']", CONFIG.lineId);
  setText("[data-bind='email']", CONFIG.email);
  setText("[data-bind='shippingName']", CONFIG.shippingName);
  setText("[data-bind='shippingFee']", formatNT(CONFIG.shippingFee));

  document.querySelectorAll("[data-href='instagram']").forEach((a) => {
    a.href = CONFIG.instagramUrl;
  });
  document.querySelectorAll("[data-href='line']").forEach((a) => {
    a.href = CONFIG.lineUrl;
  });
  document.querySelectorAll("[data-href='email']").forEach((a) => {
    a.href = "mailto:" + CONFIG.email;
  });
  document.querySelectorAll("[data-href='myship']").forEach((a) => {
    a.href = CONFIG.myshipUrl;
  });
}

function renderProducts() {
  const root = document.getElementById("product-grid");
  if (!root) return;
  root.innerHTML = CONFIG.products
    .map(
      (p) => `
      <article class="product-card" data-product="${p.id}">
        <img src="${p.image}" alt="${p.name}示意圖（原創插畫）" width="400" height="400">
        <div class="product-body">
          <h3>${p.name}</h3>
          <p>${p.desc}</p>
          <div class="price-row">
            <span class="price">${formatNT(p.price)}</span>
            <span class="price-tag">示例售價</span>
          </div>
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
  saveCart();
  renderCart();
}

function setCartQty(id, qty) {
  if (qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
  else {
    const item = state.cart.find((i) => i.id === id);
    if (item) item.qty = Math.min(MAX_QTY, qty);
  }
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
              <div class="meta">${formatNT(p.price)} · 示例售價</div>
              <div class="qty" style="margin-top:0.4rem">
                <button type="button" data-cart-step="-1" aria-label="減少">−</button>
                <input type="text" value="${item.qty}" readonly aria-label="數量">
                <button type="button" data-cart-step="1" aria-label="增加">+</button>
              </div>
            </div>
            <div>
              <div style="font-weight:600">${formatNT(p.price * item.qty)}</div>
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
  const ship = state.cart.length ? CONFIG.shippingFee : 0;
  const total = sub + ship;
  setText("[data-bind='subtotal']", formatNT(sub));
  setText("[data-bind='shipDisplay']", state.cart.length ? formatNT(ship) : "NT$0");
  setText("[data-bind='total']", formatNT(total));
  updateOrderText();
  updateMyshipButton();
}

function buyerValues() {
  return {
    name: (document.getElementById("buyer-name")?.value || "").trim(),
    phone: (document.getElementById("buyer-phone")?.value || "").trim(),
    notes: (document.getElementById("buyer-notes")?.value || "").trim()
  };
}

function buildOrderText() {
  const { name, phone, notes } = buyerValues();
  const lines = [];
  lines.push(`【${CONFIG.brandName} ${CONFIG.brandNameEn} 訂單】`);
  lines.push(`網站：${CONFIG.siteUrl}`);
  lines.push(`姓名：${name || "（尚未填寫）"}`);
  lines.push(`電話：${phone || "（尚未填寫）"}`);
  lines.push(`備註：${notes || "（無）"}`);
  lines.push("");
  lines.push("商品：");
  if (!state.cart.length) lines.push("（購物車是空的）");
  else {
    state.cart.forEach((item) => {
      const p = productById(item.id);
      lines.push(`- ${p.name} × ${item.qty}　${formatNT(p.price * item.qty)}（示例售價）`);
    });
  }
  const sub = cartSubtotal();
  const ship = state.cart.length ? CONFIG.shippingFee : 0;
  lines.push("");
  lines.push(`商品小計：${formatNT(sub)}`);
  lines.push(`運費（${CONFIG.shippingName}，示例）：${formatNT(ship)}`);
  lines.push(`合計（示例）：${formatNT(sub + ship)}`);
  lines.push("");
  lines.push("請至 7-ELEVEN 賣貨便賣場下單，並將此訂單內容貼到賣場備註或私訊賣家確認。");
  lines.push("實際商品金額與運費以賣貨便結帳頁為準。價格為網站示例。");
  return lines.join("\n");
}

function updateOrderText() {
  const area = document.getElementById("order-text");
  if (area) area.value = buildOrderText();
}

function updateMyshipButton() {
  const btn = document.getElementById("open-myship");
  const note = document.getElementById("myship-setup-note");
  if (!btn) return;
  const url = checkoutUrl();
  const needsSetup = isMyshipPlaceholder(url);
  btn.dataset.url = url;
  if (note) note.hidden = !needsSetup;
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function validateBuyer() {
  const { name, phone } = buyerValues();
  if (!state.cart.length) {
    toast("請先選購商品再結帳");
    return false;
  }
  if (!name) {
    toast("請填寫取件人姓名");
    document.getElementById("buyer-name")?.focus();
    return false;
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) {
    toast("請填寫有效的聯絡電話");
    document.getElementById("buyer-phone")?.focus();
    return false;
  }
  return true;
}

async function copyOrder() {
  if (!validateBuyer()) return;
  const text = buildOrderText();
  try {
    await navigator.clipboard.writeText(text);
    toast("訂單內容已複製");
  } catch {
    const area = document.getElementById("order-text");
    area?.select();
    document.execCommand("copy");
    toast("請再按一次複製，或手動全選訂單內容");
  }
}

function openMyship() {
  if (!validateBuyer()) return;
  const url = checkoutUrl();
  window.open(url, "_blank", "noopener,noreferrer");
  if (isMyshipPlaceholder(url)) {
    toast("已開啟賣貨便首頁。請先在設定裡貼上你的賣場連結");
  } else {
    toast("已開啟賣貨便賣場，請貼上剛複製的訂單內容");
  }
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

  ["buyer-name", "buyer-phone", "buyer-notes"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateOrderText);
  });
  document.getElementById("copy-order")?.addEventListener("click", copyOrder);
  document.getElementById("open-myship")?.addEventListener("click", openMyship);
  document.querySelectorAll("[data-scroll-cart]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("order")?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyBrand();
  renderProducts();
  renderCart();
  bindUi();
});
