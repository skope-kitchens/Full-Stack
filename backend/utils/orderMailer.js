import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const {
  SENDGRID_API_KEY,
  SENDGRID_ORDER_TEMPLATE_ID,
  SENDGRID_FROM_NAME,
  ORDER_NOTIFICATION_EMAILS,
} = process.env;

/**
 * Send order placement notification emails.
 * Sends to: ORDER_NOTIFICATION_EMAILS (comma-separated) + logged-in user's email
 */
export const sendOrderNotificationEmails = async ({
  order,
  userEmail,
  brandName,
}) => {
  if (!SENDGRID_API_KEY || !SENDGRID_ORDER_TEMPLATE_ID) {
    console.warn("❌ SENDGRID_ORDER_TEMPLATE_ID or SENDGRID_API_KEY missing – order emails disabled");
    return;
  }

  const itemsSummary = (order.items || [])
    .map((i) => `${i.qty} × ${i.dish} - ₹${Number(i.total || i.price * i.qty || 0).toFixed(2)}`)
    .join("\n");

  const dynamicData = {
    orderId: order._id?.toString(),
    amount: order.amount,
    brandName: brandName || "N/A",
    itemsSummary,
    items: order.items || [],
    date: new Date().toLocaleString(),
    userEmail,
  };

  const recipients = new Set();

  // Add configurable notification emails (comma-separated in .env)
  if (ORDER_NOTIFICATION_EMAILS) {
    ORDER_NOTIFICATION_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .forEach((e) => recipients.add(e));
  }

  // Add logged-in user's email
  if (userEmail) {
    recipients.add(userEmail.trim().toLowerCase());
  }

  for (const to of recipients) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: to }],
              dynamic_template_data: { ...dynamicData, email: to },
            },
          ],
          from: {
            email: process.env.EMAIL_FROM?.match(/<([^>]+)>/)?.[1] || process.env.EMAIL_FROM || "no-reply@skopekitchens.com",
            name: SENDGRID_FROM_NAME || "Skope Kitchens",
          },
          template_id: SENDGRID_ORDER_TEMPLATE_ID.trim(),
        }),
      });

      if (res.status !== 202) {
        console.error("Order email failed for", to, res.status, await res.text());
      }
    } catch (err) {
      console.error("Order email error for", to, err);
    }
  }
};
