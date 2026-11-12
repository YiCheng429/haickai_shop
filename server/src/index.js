"use strict";
const config = require("./config");
const pool = require("./db");
const migrate = require("./migrate");
const { createApp } = require("./app");

async function main() {
  if (process.env.AUTO_MIGRATE !== "false") {
    await migrate();
    console.log("資料表檢查完成");
  }
  if (!config.adminToken || config.adminToken.length < 16) {
    console.warn("警告：ADMIN_TOKEN 未設定或過短（<16），管理 API 已停用");
  }
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`訂單 API 已啟動：port ${config.port}，路徑 ${[...new Set([config.basePath + "/api", "/api"])].join(" 與 ")}`);
  });
  const shutdown = () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("啟動失敗：", err);
  process.exit(1);
});
