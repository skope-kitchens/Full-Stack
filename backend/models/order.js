import mongoose from "mongoose";

/* ---------- BREAKDOWN ---------- */
const breakdownSchema = new mongoose.Schema(
  {
    item: { type: String, default: "" },
    type: { type: String, default: "" },
    category: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    uom: { type: String, default: "" },
    cost: { type: Number, default: 0 },
    level: { type: Number, default: 0 }
  },
  { _id: false }
);

/* ---------- ITEMS ---------- */
const itemSchema = new mongoose.Schema(
  {
    dish: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    price: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    breakdown: { type: [breakdownSchema], default: [] }
  },
  { _id: false }
);

/* ---------- ORDER ---------- */
const orderSchema = new mongoose.Schema(
  {
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    items: { type: [itemSchema], default: [] },

    amount: { type: Number, default: 0 },

    paymentMethod: {
      type: String,
      enum: ["wallet"],
      default: "wallet"
    },

    status: {
      type: String,
      enum: ["PLACED", "PREPARING", "COMPLETED", "CANCELLED"],
      default: "PLACED"
    },

    isSeenByAdmin: { type: Boolean, default: false },
    isReceived: { type: Boolean, default: false },
    receivedAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);