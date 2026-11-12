"use strict";
const fs = require("fs");
const path = require("path");
const pool = require("./db");

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "schema.sql"), "utf8");
  await pool.query(sql);
}

module.exports = migrate;

if (require.main === module) {
  migrate()
    .then(() => {
      console.log("資料表建立完成");
      return pool.end();
    })
    .catch((err) => {
      console.error("Migration 失敗：", err.message);
      process.exit(1);
    });
}
