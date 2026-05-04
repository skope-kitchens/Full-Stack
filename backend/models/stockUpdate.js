import mongoose from "mongoose";

const stockItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    uom: { type: String, required: true, trim: true },
    issueQty: { type: Number, required: true, min: 0 },
    usedQty: { type: Number, required: true, min: 0 },
    wastageQty: { type: Number, required: true, min: 0 },
    remainingQty: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const stockUpdateSchema = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    brandName: { type: String, required: true, trim: true, index: true },
    date: { type: Date, required: true, index: true },
    items: { type: [stockItemSchema], default: [] },
  },
  { timestamps: true }
);

stockUpdateSchema.index({ brandId: 1, date: 1 }, { unique: true });

export default mongoose.model("StockUpdate", stockUpdateSchema, "stock_updates");
