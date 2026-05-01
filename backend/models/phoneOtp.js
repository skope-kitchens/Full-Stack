import mongoose from "mongoose";

const phoneOtpSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    verifiedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

phoneOtpSchema.index({ phoneNumber: 1, usedAt: 1 });

export default mongoose.model("PhoneOtp", phoneOtpSchema, "phone_otps");

