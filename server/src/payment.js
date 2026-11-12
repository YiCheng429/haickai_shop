"use strict";
const config = require("./config");

function paymentInstructions(orderNo, total) {
  const b = config.bank;
  const configured = Boolean(b.account);
  const base = {
    method: "bank_transfer",
    configured,
    amount: total,
    deadlineHours: b.deadlineHours
  };
  if (!configured) {
    return {
      ...base,
      message: `匯款資訊將以 Email 寄給你，請留意信箱（含垃圾郵件匣）。確認收款後約 3 至 5 個工作天出貨。`
    };
  }
  return {
    ...base,
    bankName: b.name,
    bankCode: b.code,
    account: b.account,
    accountName: b.accountName,
    message:
      `請於 ${b.deadlineHours} 小時內匯款 NT$${total.toLocaleString("zh-Hant-TW")}，` +
      `並來信告知訂單編號 ${orderNo} 與帳號末五碼。確認收款後約 3 至 5 個工作天出貨。`
  };
}

module.exports = { paymentInstructions };
