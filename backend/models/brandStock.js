import mongoose from "mongoose";

const historySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["ISSUE", "TRANSFER_IN", "TRANSFER_OUT"], required: true },
    qty: { type: Number, required: true },
    uom: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    fromBrandName: { type: String, default: "" },
    toBrandName: { type: String, default: "" },
  },
  { _id: false }
);

const brandStockSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, trim: true, index: true },
    itemName: { type: String, required: true, trim: true, index: true },
    ingredientBrand: { type: String, default: "", trim: true },
    uom: { type: String, default: "" },
    qtyRemaining: { type: Number, default: 0 },
    status: { type: String, enum: ["Pending", "Used"], default: "Pending", index: true },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

brandStockSchema.index({ brandName: 1, itemName: 1, ingredientBrand: 1 }, { unique: true });

export default mongoose.model("BrandStock", brandStockSchema, "brand_stocks");

