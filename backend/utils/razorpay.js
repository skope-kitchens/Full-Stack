import Razorpay from "razorpay";
import crypto from "crypto";

/**
 * Shared Razorpay helper for the wallet-free invoice flow (CLAUDE.md §24).
 *
 * Single source of truth for:
 *   - creating a Razorpay order for an invoice (POC, Stock Manager, production)
 *   - verifying a payment signature (client pay confirmation)
 *
 * Uses the SAME credentials as the (now-frozen) wallet flow — RAZORPAY_KEY_ID /
 * RAZORPAY_KEY_SECRET. The verify logic lives here ONLY, so every payment path
 * uses identical, audited signature checking.
 */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Razorpay order for an invoice total (in rupees).
 * @param {number} amountRupees - total to charge (amount + commission)
 * @param {string} receiptHint - short receipt label (<= 40 chars)
 * @returns {Promise<object>} razorpay order ({ id, amount, currency, ... })
 */
export async function createInvoiceOrder(amountRupees, receiptHint = "inv") {
  const amount = Number(amountRupees);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid invoice amount for Razorpay order");
  }
  return razorpay.orders.create({
    amount: Math.round(amount * 100), // paise
    currency: "INR",
    receipt: `${String(receiptHint).slice(0, 30)}${Date.now().toString().slice(-8)}`,
  });
}

/**
 * Verify a Razorpay payment signature. Returns true only when the HMAC-SHA256 of
 * "order_id|payment_id" with the key secret equals the provided signature.
 */
export function verifyRazorpaySignature({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  // Constant-time compare to avoid timing leaks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(String(razorpay_signature))
    );
  } catch {
    return false;
  }
}

export default razorpay;
