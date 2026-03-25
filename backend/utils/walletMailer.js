import dotenv from "dotenv";
import fetch from "node-fetch"; 

dotenv.config();
const {
  SENDGRID_API_KEY,
  SENDGRID_WALLET_TEMPLATE_ID,
  EMAIL_FROM,
  SENDGRID_FROM_NAME
} = process.env;

export const sendWalletTransactionEmail = async ({
  to,
  amount,
  type,
  source,
  reason,
  balance,
  brandName
}) => {
  if (!SENDGRID_API_KEY || !SENDGRID_WALLET_TEMPLATE_ID || !to) return;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to }],
          dynamic_template_data: {
            email: to,
            brandName,
            type: type.toUpperCase(),
            amount,
            source,
            reason,
            date: new Date().toLocaleString(),
            balance
          }
        }
      ],
      from: {
        email: EMAIL_FROM || "no-reply@skopekitchens.com",
        name: SENDGRID_FROM_NAME || "Skope Kitchens"
      },
      template_id: SENDGRID_WALLET_TEMPLATE_ID
    })
  });

  if (res.status !== 202) {
    console.error("Wallet email failed", res.status, await res.text());
  }
};
