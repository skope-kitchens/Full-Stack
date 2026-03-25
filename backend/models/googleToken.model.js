import mongoose from "mongoose";

/**
 * Stores OAuth2 tokens for the calendar owner account.
 * refreshToken enables offline access; used to obtain access_token when needed.
 */
const googleTokenSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "google_calendar", unique: true },
    email: { type: String, default: "primary" },
    refreshToken: { type: String, required: true },
    scope: { type: String, default: null },
    expiry_date: { type: Number, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("GoogleToken", googleTokenSchema);
