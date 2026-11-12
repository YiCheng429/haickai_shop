"use strict";
/* 微光盲盒 訂單管理後台。金鑰只存在 sessionStorage（關閉分頁即清除）。 */
(() => {
  const TOKEN_KEY = "glimmer-admin-token";
  const PAGE_SIZE = 30;
  const STATUS_LABELS = {
    pending_payment: "待付款",
    paid: "已付款",
    shipped: "已出貨",
    completed: "已完成",
    cancelled: "已取消",
    reported: "已回報待核對"
  };
  // 後台頁位於 {BASE_PATH}/admin/，API 位於 {BASE_PATH}/api/
  const API_BASE = new URL("../api/", document.baseURI);

  const state = { status: "", q: "", offset: 0, total: 0, orders: [], selected: null };
  const $ = (id) => document.getElementById(id);

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  }
  function setToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* 無痕模式等情況忽略 */ }
  }

  function nt(n) { return "NT$" + Number(n || 0).toLocaleString("zh-Hant-TW"); }
  function dt(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("zh-Hant-TW", { timeZone: "Asia/Taipei", hour12: false });
  }
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "dataset") Object.assign(node.dataset, v);
      else node.setAttribute(k, v);
    }
    for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c ?? "")));
    return node;
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  class AuthError extends Error {}

  async function api(path, { method = "GET", body, token = getToken() } = {}) {
    let res;
    try {
      res = await fetch(new URL(path, API_BASE), {
        method,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store"
      });
    } catch {
      throw new Error("無法連線到伺服器");
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401) throw new AuthError("管理金鑰不正確");
    if (res.status === 503 && data?.error === "admin_disabled") throw new AuthError("伺服器尚未設定 ADMIN_TOKEN");
    if (!res.ok || !data?.ok) {
      const fieldMsg = data?.fields ? Object.values(data.fields)[0] : "";
      throw new Error(fieldMsg || data?.message || `請求失敗（${res.status}）`);
    }
    return data;
  }

  /* ---------- 登入 ---------- */
  function showLogin(message) {
    $("app-view").hidden = true;
    $("logout-btn").hidden = true;
    $("login-view").hidden = false;
    const err = $("login-error");
    err.hidden = !message;
    err.textContent = message || "";
    $("token-input").focus();
  }
  function showApp() {
    $("login-view").hidden = true;
    $("app-view").hidden = false;
    $("logout-btn").hidden = false;
  }
  function handleError(err) {
    if (err instanceof AuthError) {
      setToken("");
      showLogin(err.message + "，請重新登入");
    } else {
      toast(err.message);
    }
  }

  async function login(e) {
    e.preventDefault();
    const token = $("token-input").value.trim();
    if (!token) return showLogin("請輸入管理金鑰");
    const btn = $("login-btn");
    btn.disabled = true;
    btn.textContent = "登入中…";
    try {
      await api("admin/orders?limit=1", { token });
      setToken(token);
      $("token-input").value = "";
      showApp();
      await loadList();
    } catch (err) {
      showLogin(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "登入";
    }
  }

  function logout() {
    setToken("");
    state.selected = null;
    $("order-list").replaceChildren();
    showDetail(null);
    showLogin("");
  }

  /* ---------- 列表 ---------- */
  async function loadList() {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(state.offset) });
    if (state.status) params.set("status", state.status);
    if (state.q) params.set("q", state.q);
    $("list-meta").textContent = "載入中…";
    try {
      const data = await api("admin/orders?" + params.toString());
      state.orders = data.orders;
      state.total = data.total;
      renderCounts(data.counts || {});
      renderList();
    } catch (err) {
      $("list-meta").textContent = "";
      handleError(err);
    }
  }

  function renderCounts(counts) {
    document.querySelectorAll("[data-count]").forEach((n) => {
      n.textContent = String(counts[n.dataset.count] ?? 0);
    });
  }

  function renderList() {
    const list = $("order-list");
    list.replaceChildren();
    const label = state.status ? STATUS_LABELS[state.status] : "全部";
    $("list-meta").textContent = `${label}${state.q ? `・搜尋「${state.q}」` : ""}：共 ${state.total} 筆`;
    if (!state.orders.length) {
      list.append(el("li", { class: "empty" }, "沒有符合條件的訂單"));
    }
    for (const o of state.orders) {
      const btn = el(
        "button",
        { type: "button", class: "order-row" + (state.selected?.orderNo === o.orderNo ? " is-selected" : ""), dataset: { orderNo: o.orderNo } },
        el("span", { class: "no" }, o.orderNo),
        el("span", { class: "amt" }, nt(o.total)),
        el("span", { class: "sub" }, `${o.name}・${o.phone}`),
        el("span", { class: "sub right" }, statusBadges(o)),
        el("span", { class: "sub" }, dt(o.createdAt)),
        el("span", { class: "sub right" }, o.items.map((i) => `${i.name}×${i.qty}`).join("、"))
      );
      btn.addEventListener("click", () => selectOrder(o.orderNo));
      list.append(el("li", {}, btn));
    }
    const page = Math.floor(state.offset / PAGE_SIZE) + 1;
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    $("page-info").textContent = `第 ${page} / ${pages} 頁`;
    $("prev-page").disabled = state.offset === 0;
    $("next-page").disabled = state.offset + PAGE_SIZE >= state.total;
  }

  function isAwaitingCheck(o) {
    return o.status === "pending_payment" && !!o.paymentLast5;
  }

  function statusBadges(o) {
    const wrap = el("span", { class: "badges" });
    if (isAwaitingCheck(o)) wrap.append(el("span", { class: "badge s-reported" }, `已回報 ${o.paymentLast5}`));
    else wrap.append(el("span", { class: "badge s-" + o.status }, STATUS_LABELS[o.status]));
    return wrap;
  }

  /* ---------- 詳細 ---------- */
  async function selectOrder(orderNo) {
    try {
      const data = await api("admin/orders/" + encodeURIComponent(orderNo));
      showDetail(data.order);
    } catch (err) {
      handleError(err);
    }
  }

  function showDetail(o) {
    state.selected = o;
    document.querySelectorAll(".order-row").forEach((r) => r.classList.toggle("is-selected", !!o && r.dataset.orderNo === o.orderNo));
    $("detail").hidden = !o;
    $("detail-empty").hidden = !!o;
    document.querySelector(".layout").classList.toggle("show-detail", !!o);
    if (!o) return;

    $("d-order-no").textContent = o.orderNo;
    const badge = $("d-status");
    badge.className = "badge s-" + (isAwaitingCheck(o) ? "reported" : o.status);
    badge.textContent = isAwaitingCheck(o) ? "待付款・已回報待核對" : STATUS_LABELS[o.status];
    const pay = o.paymentLast5
      ? [
          ["後五碼", o.paymentLast5],
          ["回報金額", o.paymentReportedAmount ? nt(o.paymentReportedAmount) : "（未填）"],
          ["回報時間", dt(o.paymentReportedAt)],
          ["應付金額", nt(o.total)]
        ]
      : [["狀態", "買家尚未回報"]];
    $("d-payment").replaceChildren(
      ...pay.flatMap(([k, v]) => [el("dt", {}, k), el("dd", { class: k === "後五碼" ? "mono strong" : "" }, v)])
    );
    $("d-name").textContent = o.name;
    $("d-phone").textContent = o.phone;
    $("d-email").replaceChildren(el("a", { href: "mailto:" + o.email }, o.email));
    $("d-store-name").textContent = o.storeName;
    $("d-store-id").textContent = o.storeId;
    $("d-items").replaceChildren(
      ...o.items.map((i) => el("li", {}, el("span", {}, `${i.name} × ${i.qty}（${nt(i.unitPrice)}）`), el("span", {}, nt(i.lineTotal))))
    );
    $("d-subtotal").textContent = nt(o.subtotal);
    $("d-shipping").textContent = o.shipping === 0 ? "免運" : nt(o.shipping);
    $("d-total").textContent = nt(o.total);
    $("d-note").textContent = o.note || "（無）";
    const times = [
      ["建立", o.createdAt], ["付款", o.paidAt], ["出貨", o.shippedAt],
      ["完成", o.completedAt], ["取消", o.cancelledAt], ["最後更新", o.updatedAt]
    ];
    $("d-times").replaceChildren(...times.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, dt(v))]));
    $("u-status").value = o.status;
    $("u-tracking").value = o.trackingNo || "";
    $("u-note").value = o.adminNote || "";
    if (window.matchMedia("(max-width: 959px)").matches) window.scrollTo({ top: 0 });
  }

  async function saveOrder(e) {
    e.preventDefault();
    const o = state.selected;
    if (!o) return;
    const patch = {};
    const status = $("u-status").value;
    const tracking = $("u-tracking").value.trim();
    const note = $("u-note").value;
    if (status !== o.status) patch.status = status;
    if (tracking !== (o.trackingNo || "")) patch.trackingNo = tracking || null;
    if (note !== (o.adminNote || "")) patch.adminNote = note || null;
    if (!Object.keys(patch).length) return toast("沒有變更");
    if (tracking && !/^[A-Za-z0-9-]{1,40}$/.test(tracking)) return toast("寄件編號僅限英數字與 -");
    if (patch.status === "shipped" && !tracking && !confirm("尚未填寫寄件編號，仍要標記為已出貨嗎？")) return;
    if (patch.status === "cancelled" && !confirm(`確定要取消訂單 ${o.orderNo}？`)) return;
    const btn = $("save-btn");
    btn.disabled = true;
    btn.textContent = "儲存中…";
    try {
      const data = await api("admin/orders/" + encodeURIComponent(o.orderNo), { method: "PATCH", body: patch });
      showDetail(data.order);
      toast("已儲存");
      await loadList();
    } catch (err) {
      handleError(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "儲存變更";
    }
  }

  function shippingText(o) {
    return [
      `取件人：${o.name}`,
      `手機：${o.phone}`,
      `取貨門市：${o.storeName}`,
      `門市店號：${o.storeId}`,
      `商品價值：${o.subtotal}`,
      `訂單編號：${o.orderNo}`,
      `內容：${o.items.map((i) => `${i.name}×${i.qty}`).join("、")}`
    ].join("\n");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = el("textarea", { readonly: "" });
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ---------- 綁定 ---------- */
  function bind() {
    $("login-form").addEventListener("submit", login);
    $("logout-btn").addEventListener("click", logout);
    $("status-tabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      state.status = tab.dataset.status;
      state.offset = 0;
      loadList();
    });
    $("search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      state.q = $("search-input").value.trim();
      state.offset = 0;
      loadList();
    });
    $("search-input").addEventListener("search", () => {
      if (!$("search-input").value && state.q) {
        state.q = "";
        state.offset = 0;
        loadList();
      }
    });
    $("refresh-btn").addEventListener("click", () => {
      loadList();
      if (state.selected) selectOrder(state.selected.orderNo);
    });
    $("prev-page").addEventListener("click", () => { state.offset = Math.max(0, state.offset - PAGE_SIZE); loadList(); });
    $("next-page").addEventListener("click", () => { state.offset += PAGE_SIZE; loadList(); });
    $("back-btn").addEventListener("click", () => showDetail(null));
    $("update-form").addEventListener("submit", saveOrder);
    $("copy-ship-btn").addEventListener("click", async () => {
      if (!state.selected) return;
      toast((await copyText(shippingText(state.selected))) ? "寄件資料已複製，可貼到交貨便" : "複製失敗，請手動選取");
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bind();
    if (!getToken()) return showLogin("");
    showApp();
    await loadList();
  });
})();
