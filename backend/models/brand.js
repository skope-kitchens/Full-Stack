import mongoose from "mongoose";

const BrandSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, unique: true },
    status: { type: String, default: "Pending" },

    // Existing integrations
    ristaOutletId: { type: String, default: null },
    ristaBusinessId: { type: String, default: null },

    // ✅ Analytics settings (NEW)
    ristaBranchCode: [{ type: String, default: null }],
    analyticsPeriod: { type: String, default: null }, // YYYY-MM or YYYY-MM-DD

    // ✅ Chef mapping (Contact Us)
    chefName: { type: String, default: '' },

    // ── ERP Inventory Classification ──────────────────────────────────────────
    // Whether this brand's stock is managed through Skope ERP procurement flows.
    // false = Category A (kitchen-only). true = Category B/C (procurement support or own brand).
    // Automatic production deduction only fires when inventoryManaged = true.
    inventoryManaged: { type: Boolean, default: false },

    // SELF = brand procures independently.
    // SKOPE = Skope procures on their behalf.
    // HYBRID = partial (e.g., weekly Skope support + self-procure gaps).
    procurementModel: {
      type: String,
      enum: ["SELF", "SKOPE", "HYBRID"],
      default: "SELF",
    },
    // ──────────────────────────────────────────────────────────────────────────
  },
  { timestamps: true }
);

export default mongoose.model("Brand", BrandSchema);
