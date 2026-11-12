# 微光盲盒 Glimmer Box

前端為靜態網站，無需打包。所有路徑皆為相對路徑，可部署在任何網域的子路徑下（例如 `/shop/`）。已包含 `.nojekyll`。

- 結帳時會將訂單送到 `CONFIG.apiBase`（預設相對路徑 `api`，即 `/shop/api`）。
- 後端無法連線時（例如 GitHub Pages 預覽），會自動改用 Email 送出訂單。
- 訂單後端（Node.js + PostgreSQL）與部署說明見 [`server/README.md`](server/README.md)。

聯絡信箱：haickaiservice@gmail.com
