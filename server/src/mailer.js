"use strict";
const nodemailer = require("nodemailer");
const config = require("./config");
const { SHIPPING_NAME } = require("./products");

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
  });
}

const nt = (n) => "NT$" + Number(n).toLocaleString("zh-Hant-TW");

function orderText(order, payment) {
  const lines = [
    `訂單編號：${order.orderNo}`,
    `建立時間：${new Date(order.createdAt).toLocaleString("zh-Hant-TW", { timeZone: "Asia/Taipei" })}`,
    "",
    `取件人姓名：${order.name}`,
    `電話：${order.phone}`,
    `Email：${order.email}`,
    `取貨門市：${order.storeName}（店號 ${order.storeId}）`,
    `備註：${order.note || "（無）"}`,
    "",
    "商品："
  ];
  order.items.forEach((l) => lines.push(`- ${l.name} × ${l.qty}　${nt(l.lineTotal)}`));
  lines.push(
    "",
    `商品小計：${nt(order.subtotal)}`,
    `運費（${SHIPPING_NAME}）：${order.shipping === 0 ? "免運" : nt(order.shipping)}`,
    `合計：${nt(order.total)}`,
    "",
    `付款方式：匯款／轉帳。${payment.message}`
  );
  if (payment.configured) {
    lines.push(`銀行：${payment.bankName}（${payment.bankCode}）`, `帳號：${payment.account}`, `戶名：${payment.accountName}`);
  }
  return lines.join("\n");
}

async function notifyNewOrder(order, payment) {
  if (!transporter) return { skipped: true };
  const text = orderText(order, payment);
  const jobs = [
    transporter.sendMail({
      from: config.smtp.from,
      to: config.ownerEmail,
      replyTo: order.email,
      subject: `【新訂單】${order.orderNo}　${nt(order.total)}`,
      text
    })
  ];
  if (config.sendCustomerEmail) {
    jobs.push(
      transporter.sendMail({
        from: config.smtp.from,
        to: order.email,
        replyTo: config.ownerEmail,
        subject: `${config.shopName} 訂單確認 ${order.orderNo}`,
        text: `您好，我們已收到你的訂單：\n\n${text}\n\n如有問題請回覆此信或寄至 ${config.ownerEmail}。`
      })
    );
  }
  await Promise.all(jobs);
  return { sent: jobs.length };
}

module.exports = { notifyNewOrder, mailEnabled: () => Boolean(transporter) };
