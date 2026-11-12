"use strict";
const config = require("./config");

const SHIPPING_NOTICE = "交貨便寄件成立後，取貨通知會以 Email 與簡訊傳送給你。";

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
      message: `匯款資訊將以 Email 寄給你，請留意信箱（含垃圾郵件匣）。匯款後請於「訂單查詢」回報轉出帳號後五碼。確認收款後約 3 至 5 個工作天出貨。${SHIPPING_NOTICE}`,
      shippingNotice: SHIPPING_NOTICE
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
      `匯款後請回報轉出帳號後五碼（可在下單完成畫面或「訂單查詢」填寫），以便核對。確認收款後約 3 至 5 個工作天出貨。${SHIPPING_NOTICE}`,
    shippingNotice: SHIPPING_NOTICE
  };
}

module.exports = { paymentInstructions, SHIPPING_NOTICE };
