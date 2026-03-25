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
  },
  { timestamps: true }
);

export default mongoose.model("Brand", BrandSchema);
