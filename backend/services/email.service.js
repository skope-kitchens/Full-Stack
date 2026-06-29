import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const { SENDGRID_API_KEY, EMAIL_FROM, SENDGRID_FROM_NAME } = process.env;

/**
 * email.service.js — minimal, generic SendGrid sender.
 *
 * Unlike the existing template-based mailers (emailService.js / walletMailer.js),
 * this sends a plain HTML email via SendGrid's v3 "content" API. It is the single
 * entry point for the invoice/payment notifications introduced by the wallet→
 * Razorpay-direct redesign (CLAUDE.md §24).
 *
 * GRACEFUL BY DESIGN: if SendGrid is not configured (missing API key / from
 * address) or `to` is empty, it NO-OPS and returns { sent:false, reason } — it
 * NEVER throws. Every caller treats email as fire-and-forget so a mail failure
 * can never block or fail the business operation (raising/paying an invoice).
 *
 * @param {{to:string, subject:string, html:string, attachments?:Array}} params
 * @returns {Promise<{sent:boolean, reason?:string, status?:number}>}
 */
export async function sendEmail({ to, subject, html, attachments = [] } = {}) {
  try {
    if (!SENDGRID_API_KEY || !EMAIL_FROM) {
      console.warn("[email.service] SendGrid not configured — email skipped");
      return { sent: false, reason: "NOT_CONFIGURED" };
    }
    if (!to) {
      return { sent: false, reason: "NO_RECIPIENT" };
    }

    const body = {
      personalizations: [{ to: [{ email: to }] }],
      from: {
        email: EMAIL_FROM,
        name: SENDGRID_FROM_NAME || "Skope Kitchens",
      },
      subject: subject || "Skope Kitchens",
      content: [{ type: "text/html", value: html || "" }],
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      body.attachments = attachments;
    }

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status !== 202) {
      const text = await res.text().catch(() => "");
      console.error("[email.service] SendGrid failed:", res.status, text);
      return { sent: false, reason: "SENDGRID_ERROR", status: res.status };
    }

    return { sent: true, status: res.status };
  } catch (err) {
    // Never let an email failure bubble up into the request flow.
    console.error("[email.service] sendEmail error:", err?.message || err);
    return { sent: false, reason: "EXCEPTION" };
  }
}

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/**
 * HTML for the "invoice raised" email sent to the CLIENT.
 */
export function invoiceRaisedEmailHtml({
  brandName,
  type,
  amount,
  commission = 0,
  notes = "",
  branchCode = "",
  attachmentUrl = "",
  attachmentName = "",
  supplementaryReason = "",
}) {
  const total = Number(amount || 0) + Number(commission || 0);
  const rows = [
    `<tr><td style="padding:4px 12px;color:#555">Invoice type</td><td style="padding:4px 12px"><b>${esc(type)}</b></td></tr>`,
    branchCode ? `<tr><td style="padding:4px 12px;color:#555">Branch</td><td style="padding:4px 12px">${esc(branchCode)}</td></tr>` : "",
    `<tr><td style="padding:4px 12px;color:#555">Amount</td><td style="padding:4px 12px">${money(amount)}</td></tr>`,
    Number(commission) > 0 ? `<tr><td style="padding:4px 12px;color:#555">Commission</td><td style="padding:4px 12px">${money(commission)}</td></tr>` : "",
    `<tr><td style="padding:4px 12px;color:#555">Total payable</td><td style="padding:4px 12px"><b>${money(total)}</b></td></tr>`,
    supplementaryReason ? `<tr><td style="padding:4px 12px;color:#555">Supplementary reason</td><td style="padding:4px 12px">${esc(supplementaryReason)}</td></tr>` : "",
    notes ? `<tr><td style="padding:4px 12px;color:#555">Notes</td><td style="padding:4px 12px">${esc(notes)}</td></tr>` : "",
  ].join("");

  const attach = attachmentUrl
    ? `<p style="margin:16px 0"><a href="${esc(attachmentUrl)}" target="_blank" style="color:#2563eb">View attached document${attachmentName ? ` (${esc(attachmentName)})` : ""}</a></p>`
    : "";

  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
    <h2 style="color:#111">New invoice from Skope Kitchens</h2>
    <p>Hello ${esc(brandName) || "there"},</p>
    <p>A new invoice has been raised for your brand. Details below:</p>
    <table style="border-collapse:collapse;background:#f9fafb;border-radius:8px;width:100%">${rows}</table>
    ${attach}
    <p style="margin-top:20px">Please pay this invoice from your Skope client dashboard (Invoices section).</p>
    <p style="color:#888;font-size:12px;margin-top:24px">Skope Kitchens</p>
  </div>`;
}

/**
 * HTML for the "invoice paid" email sent to the RAISER (POC / Store Manager).
 */
export function invoicePaidEmailHtml({
  invoiceLabel,
  clientName,
  brandName,
  amount,
  commission = 0,
  paidAt,
}) {
  const total = Number(amount || 0) + Number(commission || 0);
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
    <h2 style="color:#111">Invoice paid</h2>
    <p>Invoice <b>${esc(invoiceLabel)}</b> has been paid.</p>
    <table style="border-collapse:collapse;background:#f9fafb;border-radius:8px;width:100%">
      <tr><td style="padding:4px 12px;color:#555">Client</td><td style="padding:4px 12px">${esc(clientName || brandName)}</td></tr>
      <tr><td style="padding:4px 12px;color:#555">Brand</td><td style="padding:4px 12px">${esc(brandName)}</td></tr>
      <tr><td style="padding:4px 12px;color:#555">Amount paid</td><td style="padding:4px 12px"><b>${money(total)}</b></td></tr>
      <tr><td style="padding:4px 12px;color:#555">Paid at</td><td style="padding:4px 12px">${esc(paidAt ? new Date(paidAt).toLocaleString("en-IN") : new Date().toLocaleString("en-IN"))}</td></tr>
    </table>
    <p style="margin-top:20px">View the updated status on your dashboard.</p>
    <p style="color:#888;font-size:12px;margin-top:24px">Skope Kitchens</p>
  </div>`;
}
