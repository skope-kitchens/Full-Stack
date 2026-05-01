import User from "../models/user.js";

export const chargeForMeeting = async (userId, price) => {
  const user = await User.findById(userId);

  // 1️⃣ Use free meeting credits first
  if (user.meetingCredits > 0) {
    user.meetingCredits -= 1;
    await user.save();
    return { paid: false, source: "meetingCredits" };
  }

  // 2️⃣ Use wallet
  if (user.wallet.balance >= price) {
    user.wallet.balance -= price;
    user.wallet.transactions.push({
      amount: price,
      type: "debit",
      source: "system",
      reason: "Meeting charge"
    });
    await user.save();
    return { paid: true, source: "wallet" };
  }

  // 3️⃣ Must pay via Razorpay
  return { paid: false, source: "razorpay_required" };
};
