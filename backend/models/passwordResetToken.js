import mongoose from "mongoose";

const passwordResetTokenSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, index: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model(
  "PasswordResetToken",
  passwordResetTokenSchema,
  "password_reset_tokens"
);

