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

/* ---------- CASCADE DEDUCTION (manual local orders) ---------- */
// Records exactly what was debited from brand_stocks when a manual local-kitchen
// order fired the stock cascade — so a within-30-min DELETE can reverse it
// precisely (credit the same qty back to the same stock record).
const cascadeDeductionSchema = new mongoose.Schema(
  {
    itemName: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    uom: { type: String, default: "" },
    location: { type: String, default: "" }, // BRANCH_KITCHEN | SEMI_FINISHED
    stockId: { type: mongoose.Schema.Types.ObjectId, default: null },
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
    completedAt: Date,

    // ── Manual Local-Kitchen Order Entry (CLAUDE.md §25) ──────────────────────
    // ADDITIVE & FROZEN-SAFE: every field below is optional at the schema level so
    // existing wallet orders (entryType defaults to "WALLET") still validate with
    // no migration. A manual local-kitchen order sets entryType "MANUAL_LOCAL",
    // populates these fields, and ALSO sets the legacy required `brand` = brandId.
    // Queries that must isolate the two streams filter on entryType.
    entryType: {
      type: String,
      enum: ["WALLET", "MANUAL_LOCAL"],
      default: "WALLET",
      index: true,
    },
    brandName: { type: String, default: "", trim: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    branchCode: { type: String, default: "", trim: true, uppercase: true },
    recipeId: { type: mongoose.Schema.Types.ObjectId, ref: "MainRecipe", default: null },
    recipeName: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    source: {
      type: String,
      enum: ["WALK_IN", "SWIGGY", "ZOMATO", "OWNLY", "OTHER", null],
      default: null,
    },
    timeBucket: {
      type: String,
      enum: ["MORNING", "AFTERNOON", "EVENING", "LATE_NIGHT", null],
      default: null,
    },
    orderDate: { type: Date, default: null },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    enteredAt: { type: Date, default: null },
    cascadeApplied: { type: Boolean, default: true },
    overrideReason: { type: String, default: "" },
    cascadeDeductions: { type: [cascadeDeductionSchema], default: [] },
  },
  { timestamps: true }
);

// Fast daily lookups for the Local Kitchen view + client analytics reroute.
orderSchema.index({ brandId: 1, branchCode: 1, orderDate: 1 });

export default mongoose.model("Order", orderSchema);