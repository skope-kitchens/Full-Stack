import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const {
  SENDGRID_API_KEY,
  SENDGRID_VENDOR_TEMPLATE_ID,
  INTERNAL_VENDOR_EMAIL,
  EMAIL_FROM,
  SENDGRID_FROM_NAME
} = process.env;

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";

const sendEmail = async ({ to, templateData }) => {
  if (!SENDGRID_API_KEY || !SENDGRID_VENDOR_TEMPLATE_ID || !to) return;

  const res = await fetch(SENDGRID_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to }],
          dynamic_template_data: templateData
        }
      ],
      from: {
        email: EMAIL_FROM || "no-reply@skopekitchens.com",
        name: SENDGRID_FROM_NAME || "Skope Kitchens"
      },
      template_id: SENDGRID_VENDOR_TEMPLATE_ID
    })
  });

  if (res.status !== 202) {
    console.error("Vendor email failed", res.status, await res.text());
  }
};

export const vendorMailer = async ({
  vendorEmail,
  supplierName,
  storeName,
  payload
}) => {
  const baseData = {
    supplierName,
    storeName,
    vendorEmail,
    submittedAt: new Date().toLocaleString(),

    company: {
      companyName: payload.companyName,
      yearEstablished: payload.yearEstablished,
      address: payload.address,
      phone: payload.phone,
      gstNumber: payload.gstNumber,
      lastYearTurnover: payload.lastYearTurnover
    },

    bank: {
      bankName: payload.bankName,
      accountName: payload.accountName,
      accountNumber: payload.accountNumber,
      ifsc: payload.ifsc,
      swiftCode: payload.swiftCode
    },

    materials: payload.materials || [],

    commercial: {
      paymentTerms: payload.paymentTerms,
      returnPolicy: payload.returnPolicy
    },

    experience: {
      majorClients: payload.majorClients,
      legalDisputes: payload.legalDisputes
    }
  };

  // 1️⃣ Vendor email
  await sendEmail({
    to: vendorEmail,
    templateData: {
      ...baseData,
      isInternal: false
    }
  });

  // 2️⃣ Internal email
  if (INTERNAL_VENDOR_EMAIL) {
    await sendEmail({
      to: INTERNAL_VENDOR_EMAIL,
      templateData: {
        ...baseData,
        isInternal: true
      }
    });
  }
};
