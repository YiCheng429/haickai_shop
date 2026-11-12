"use strict";
// 商品與價格以伺服器為準，需與前端 js/app.js 的 CONFIG.products 保持一致。
const PRODUCTS = Object.freeze({
  ring: { id: "ring", name: "戒指盲盒", price: 199 },
  bracelet: { id: "bracelet", name: "手鍊盲盒", price: 249 },
  necklace: { id: "necklace", name: "項鍊盲盒", price: 299 },
  combo: { id: "combo", name: "綜合驚喜盒", price: 399 }
});

const FREE_SHIPPING_THRESHOLD = 600;
const SHIPPING_NAME = "7-ELEVEN 交貨便・本島一般店到店";

// 與前端 shippingFee() 相同：滿 600 免運，否則依交貨便包裹價值級距。
function shippingFee(subtotal) {
  if (!subtotal) return 0;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  if (subtotal <= 1000) return 60;
  if (subtotal <= 2000) return 70;
  if (subtotal <= 3000) return 80;
  if (subtotal <= 4000) return 90;
  return 100;
}

// items: [{id, qty}]（已驗證、已合併）→ 由伺服器價格重新計算
function priceOrder(items) {
  const lines = items.map(({ id, qty }) => {
    const p = PRODUCTS[id];
    return { productId: p.id, name: p.name, unitPrice: p.price, qty, lineTotal: p.price * qty };
  });
  const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);
  const shipping = shippingFee(subtotal);
  return { lines, subtotal, shipping, total: subtotal + shipping, freeShipping: subtotal > 0 && shipping === 0 };
}

module.exports = { PRODUCTS, FREE_SHIPPING_THRESHOLD, SHIPPING_NAME, shippingFee, priceOrder };
