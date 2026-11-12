# 微光盲盒 Glimmer Box

靜態單頁商店（Traditional Chinese），網域預定為 [haickai.com](https://haickai.com/)。本資料夾可直接放到 GitHub Pages 或 Netlify，**目前尚未發布、也尚未設定 DNS**。

## 開賣前請修改的設定

打開 `js/app.js` 最上方的 `CONFIG`：

| 欄位 | 說明 |
| --- | --- |
| `brandName` / `brandNameEn` / `tagline` | 品牌名稱與一句介紹 |
| `siteUrl` | 已設為 `https://haickai.com` |
| `myshipUrl` | **必填**：你的 7-ELEVEN 賣貨便賣場網址（請先在 [賣貨便](https://myship.7-11.com.tw/) 建立賣場後貼上） |
| `products[].price` | 各盲盒售價（目前為示例：199 / 249 / 299 / 599） |
| `products[].name` / `desc` / `image` | 商品名稱、介紹、插圖 |
| `products[].myshipUrl` | 選填：單一商品的賣貨便商品頁連結 |
| `shippingFee` / `shippingName` | 結帳頁顯示的運費示例（請依當月官網優惠更新） |
| `instagramUrl` / `instagramHandle` | Instagram（目前為佔位） |
| `lineUrl` / `lineId` | LINE（目前為佔位） |
| `email` | 信箱（目前為 `hello@haickai.com` 佔位） |

根目錄的 `CNAME` 已寫入 `haickai.com`，之後若用 GitHub Pages 部署會用到。請不要在未準備好時改 DNS。

## 檔案

- `index.html` — 單頁內容
- `css/style.css` — 樣式
- `js/app.js` — 設定與購物車／訂單邏輯
- `images/` — 原創 SVG 插圖與 favicon；`og.png` 供社群分享
- 沒有打包步驟，用瀏覽器直接打開或任何靜態空間即可

## 之後若要免費上線（先不要發布）

常用做法：把這個資料夾推到 GitHub，在倉庫啟用 GitHub Pages；或把資料夾拖到 [Netlify](https://www.netlify.com/) 做靜態部署。再把 `haickai.com` 的 DNS（例如 Apex 與 `www`）指到該平台。等你要正式上線時再處理即可。
