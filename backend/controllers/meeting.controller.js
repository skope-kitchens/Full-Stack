import User from "../models/user.js";

export const MANAGER_BOOKING_LINKS = {
  sanjukta:
    "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0sqwXdi-0lMbxcy9Rws29YWFm1fL3iGxKSdJZzE7aGoOpxBNoFWoVNOOyto2tPh7pEciz2FnD_",
  culinary:
    "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0sqwXdi-0lMbxcy9Rws29YWFm1fL3iGxKSdJZzE7aGoOpxBNoFWoVNOOyto2tPh7pEciz2FnD_",
  analytics:
    "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ13vng14mL6kgbPsGMVQybs2i-ftRiB9dkgrgqzv3AYGDe-CG9w8ClBeYubraom6uq90V_YlgAx",
};

export const authorizeBooking = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { manager } = req.body || {};

    if (!MANAGER_BOOKING_LINKS[manager]) {
      return res.status(400).json({ message: "Invalid manager selected" });
    }

    const user = await User.findById(userId);

    const balance = Number(user?.wallet?.balance ?? 0);
    if (!user || balance < 50) {
      return res
        .status(400)
        .json({ message: "Insufficient wallet balance" });
    }

    user.wallet.balance = balance - 50;
    if (!Array.isArray(user.wallet.transactions)) {
      user.wallet.transactions = [];
    }

    user.wallet.transactions.push({
      amount: 50,
      type: "debit",
      source: "system",
      reason: "Meeting booking authorization",
      createdAt: new Date(),
    });

    await user.save();

    return res.json({
      success: true,
      bookingUrl: MANAGER_BOOKING_LINKS[manager],
    });
  } catch (err) {
    console.error("authorizeBooking error:", err);
    return res
      .status(500)
      .json({ message: "Booking authorization failed" });
  }
};

