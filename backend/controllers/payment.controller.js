import Razorpay from "razorpay";

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    console.error("❌ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set in environment variables.");
    return null;
  }

  return new Razorpay({ key_id, key_secret });
}

export const payment = async (req, res) => {
  const razorpay = getRazorpay();

  if (!razorpay) {
    return res.status(500).json({ message: "Payment service is not configured." });
  }

  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `p_${Date.now()}`
    });

    res.json(order);
  } catch (err) {
    console.error("Payment error:", err);
    res.status(500).json({ message: "Payment failed" });
  }
};
