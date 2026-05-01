import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    brandName: {
      type: String,
      default: null,
      index: true,
    },

    phoneNumber: { type: String, default: "", trim: true, index: true },
    phoneVerified: { type: Boolean, default: false },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: { type: String, required: true },

    address: {
      line1: { type: String, required: true },
      line2: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true }
    },
    // 💳 Paid wallet
    wallet: {
      balance: { type: Number, default: 0 },
      dueAmount: {
        type: Number,
        default: 0
      },

      dueReason: {
        type: String,
        default: null
      },
      transactions: [
        {
          amount: Number,
          type: { type: String, enum: ["credit", "debit"], required: true },

          source: {
            type: String,
            enum: ["razorpay", "system", "admin","order"], // ✅ ADD admin
            required: true
          },

          reason: String,

          createdAt: {
            type: Date,
            default: Date.now
          }
        }
      ]

    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
