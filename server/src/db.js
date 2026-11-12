"use strict";
const { Pool } = require("pg");
const config = require("./config");

if (!config.databaseUrl) {
  console.error("缺少 DATABASE_URL 環境變數");
  process.exit(1);
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on("error", (err) => console.error("PostgreSQL pool error:", err.message));

module.exports = pool;
