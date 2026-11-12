# 微光盲盒 Glimmer Box 訂單後端

Node.js（Express 5）＋ PostgreSQL 的訂單 API。前端（上一層的 `index.html`、`js/app.js`）結帳時會呼叫這個 API；API 連不上時（例如 GitHub Pages 預覽），前端會自動改用原本的 Email 下單流程。

- 前端網址：`https://你的網域/shop/`
- API 網址：`https://你的網域/shop/api/...`
- 前端所有路徑皆為相對路徑；`CONFIG.apiBase` 預設為 `"api"`，在 `/shop/` 頁面會解析成 `/shop/api`。

> 注意：前端網址請以 `/shop/`（結尾斜線）開啟。下方 nginx 設定已把 `/shop` 自動導向 `/shop/`。

## 目錄

```
server/
├── package.json
├── .env.example          # 環境變數範本
├── Dockerfile            # 以 blindbox-shop/ 為 build context
├── docker-compose.yml    # api + postgres
├── migrations/schema.sql # 資料表（可重複執行）
└── src/
    ├── index.js          # 進入點（啟動時自動 migrate）
    ├── app.js            # 路由、安全性設定
    ├── config.js         # 讀取環境變數
    ├── products.js       # 商品、價格、運費（以伺服器為準）
    ├── validate.js       # 輸入驗證
    ├── orders.js         # 訂單資料存取、訂單編號
    ├── payment.js        # 匯款說明
    ├── mailer.js         # Email 通知（選用）
    └── migrate.js        # npm run migrate
```

## 商品與運費

商品與價格寫在 `src/products.js`，**需與前端 `js/app.js` 的 `CONFIG.products` 一致**（前端只負責顯示，金額一律由伺服器重新計算）：

| id | 名稱 | 價格 |
|---|---|---|
| ring | 戒指盲盒 | 199 |
| bracelet | 手鍊盲盒 | 249 |
| necklace | 項鍊盲盒 | 299 |
| combo | 綜合驚喜盒 | 399 |

運費：商品小計滿 NT$600 免運；未滿時依 7-ELEVEN 交貨便級距（≤1000：60、≤2000：70、≤3000：80、≤4000：90、其餘：100）。

## API

所有路由同時掛在 `${BASE_PATH}/api`（預設 `/shop/api`）與 `/api`，反向代理不論是否去掉 `/shop` 前綴都能運作。

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/shop/api/health` | 健康檢查（含資料庫狀態） |
| POST | `/shop/api/orders` | 建立訂單 |
| GET | `/shop/api/orders/:orderNo?phone=09xxxxxxxx` | 顧客查詢自己的訂單（需手機號碼相符） |
| GET | `/shop/api/admin/orders?status=&limit=&offset=` | 管理：列出訂單 |
| GET | `/shop/api/admin/orders/:orderNo` | 管理：單筆訂單完整資料 |
| PATCH | `/shop/api/admin/orders/:orderNo` | 管理：更新狀態／寄件編號／備註 |

### 建立訂單

```bash
curl -X POST https://你的網域/shop/api/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 任意8-64字英數字' \
  -d '{"name":"王小明","phone":"0912345678","email":"a@example.com",
       "storeName":"台北市XX門市","storeId":"123456","note":"",
       "items":[{"id":"ring","qty":1},{"id":"necklace","qty":2}]}'
```

驗證規則：姓名 1–50 字、手機 `09` 開頭 10 碼（可含 `-`、空白、`+886`）、Email、門市名稱 1–50 字、門市店號 6 位數字、備註 ≤500 字、商品 id 需存在、每項數量 1–20 的整數。Body 上限 16 KB。`Idempotency-Key`（選填）可避免重複送出產生兩筆訂單，前端已自動帶入。

成功回傳 `201`：訂單編號（`GB-YYYYMMDD-XXXX`，台北日期）、明細、小計、運費、總額與匯款說明 `payment`。錯誤回傳 `400`（含各欄位 `fields` 錯誤訊息）、`413`、`429`。

### 訂單狀態

`pending_payment`（待付款）→ `paid`（已付款）→ `shipped`（已出貨）→ `completed`（已完成）；或 `cancelled`（已取消）。更新狀態時會自動記錄 `paid_at`、`shipped_at` 等時間。

### 管理 API 範例

```bash
TOKEN=你的ADMIN_TOKEN
# 待付款訂單
curl -H "Authorization: Bearer $TOKEN" "https://你的網域/shop/api/admin/orders?status=pending_payment"
# 確認收款
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"paid"}' https://你的網域/shop/api/admin/orders/GB-20261112-ABCD
# 出貨並填交貨便寄件編號
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"shipped","trackingNo":"F12345678901"}' https://你的網域/shop/api/admin/orders/GB-20261112-ABCD
```

## 安全性

- `helmet`（含 CSP、HSTS 等標頭）、`express.json` 16 KB 上限
- 每個 IP 每 15 分鐘：建立訂單 `ORDER_RATE_LIMIT` 次（預設 10）、查詢 `LOOKUP_RATE_LIMIT` 次（預設 30）
- CORS 預設只允許同網域；需要跨網域時設定 `CORS_ORIGINS`
- 管理 API 使用 `ADMIN_TOKEN` Bearer（比對採固定時間比較）；未設定或少於 16 字元時管理 API 停用
- 顧客查詢只回傳遮罩後的姓名，不回傳 Email、IP、管理備註
- 所有 SQL 皆為參數化查詢

## 環境變數

見 `.env.example`。最少需要：

| 變數 | 說明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 連線字串（docker-compose 會自動組出） |
| `POSTGRES_PASSWORD` | docker-compose 用的資料庫密碼 |
| `ADMIN_TOKEN` | 管理 API 金鑰，`openssl rand -hex 32` 產生 |
| `BASE_PATH` | 預設 `/shop` |
| `TRUST_PROXY` | 在 nginx 後方設 `1`；前面再加一層 Cloudflare 時設 `2` |

建議設定：`BANK_NAME`、`BANK_CODE`、`BANK_ACCOUNT`、`BANK_ACCOUNT_NAME`（未設定時，下單畫面會顯示「匯款資訊將以 Email 寄給你」）。

Email 通知（選用）：`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`、`OWNER_EMAIL`（預設 haickaiservice@gmail.com）、`SEND_CUSTOMER_EMAIL`。未設定 `SMTP_HOST` 時略過寄信；寄信失敗只會記錄在 log，不影響下單。使用 Gmail 時：`SMTP_HOST=smtp.gmail.com`、`SMTP_PORT=465`、`SMTP_SECURE=true`，密碼請用 Google 帳戶的「應用程式密碼」。

## 部署方式一：Docker Compose（最簡單）

需要一台有 Docker 的 Linux 主機（VPS），網域已指向此主機，並已安裝 nginx 與 HTTPS 憑證。

```bash
cd blindbox-shop/server
cp .env.example .env
# 編輯 .env：POSTGRES_PASSWORD、ADMIN_TOKEN、匯款資訊、SMTP（選填）
docker compose up -d --build
curl http://127.0.0.1:3000/shop/api/health
```

此模式下 Node 也會提供前端靜態檔（`SERVE_STATIC=true`），nginx 只要把整個 `/shop` 轉給它：

```nginx
# 放在該網域既有的 server { listen 443 ssl; ... } 區塊內
location = /shop { return 301 /shop/; }

location /shop/ {
    proxy_pass http://127.0.0.1:3000;          # 不加結尾斜線 → 保留 /shop 前綴
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 32k;
}
```

## 部署方式二：nginx 提供靜態檔，只把 API 轉給 Node

1. 把前端檔案（`index.html`、`css/`、`js/`、`images/`）上傳到 `/var/www/glimmer-shop/`（**不要**上傳 `server/` 與 `.env`）。
2. 安裝 PostgreSQL 16 以上，建立資料庫：
   ```bash
   sudo -u postgres psql -c "CREATE USER glimmer WITH PASSWORD '強密碼';"
   sudo -u postgres psql -c "CREATE DATABASE glimmer OWNER glimmer;"
   ```
3. 啟動 API（Node.js 20 以上）：
   ```bash
   cd server
   npm ci --omit=dev
   cp .env.example .env    # 設定 DATABASE_URL、ADMIN_TOKEN、SERVE_STATIC=false 等
   npm run migrate         # 啟動時也會自動執行（AUTO_MIGRATE=false 可關閉）
   npm start
   ```
   正式環境建議用 systemd 或 pm2 常駐，例如 `pm2 start src/index.js --name glimmer-shop`。
4. nginx：
   ```nginx
   location = /shop { return 301 /shop/; }

   location /shop/api/ {
       proxy_pass http://127.0.0.1:3000;      # 保留 /shop 前綴
       # 若想去掉前綴也可以：proxy_pass http://127.0.0.1:3000/api/;
       proxy_http_version 1.1;
       proxy_set_header Host              $host;
       proxy_set_header X-Real-IP         $remote_addr;
       proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       client_max_body_size 32k;
   }

   location /shop/ {
       alias /var/www/glimmer-shop/;
       index index.html;
       add_header Cache-Control "no-cache" always;
   }
   ```
5. `sudo nginx -t && sudo systemctl reload nginx`，再開 `https://你的網域/shop/api/health` 確認回傳 `{"ok":true,"db":"ok",...}`。

## 本機開發

```bash
cd server
npm install
cp .env.example .env   # DATABASE_URL 指向本機 PostgreSQL，SERVE_STATIC=true
npm start
# 開 http://localhost:3000/shop/
```

## 備份

```bash
docker compose exec db pg_dump -U glimmer glimmer > backup-$(date +%F).sql
```
