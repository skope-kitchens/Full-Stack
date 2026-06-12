import mongoose from "mongoose";

const fridgeAuditItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    ingredientBrand: { type: String, default: "", trim: true },
    uom: { type: String, default: "" },
    previousQty: { type: Number, required: true, min: 0 },
    countedQty: { type: Number, required: true, min: 0 },
    spoiledQty: { type: Number, required: true, min: 0, default: 0 },
    // Quantity left in the fridge after removing the spoiled portion (countedQty - spoiledQty).
    finalQty: { type: Number, required: true, min: 0, default: 0 },
    spoilageReason: {
      type: String,
      enum: ["SPOILED_EXPIRED", "WASTAGE", "QUALITY_REJECTION", "OTHER", null],
      default: null,
    },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const fridgeAuditSchema = new mongoose.Schema(
  {
    branchCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    date: { type: Date, required: true, index: true },
    items: { type: [fridgeAuditItemSchema], default: [] },
    actorRole: { type: String, default: "" },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

fridgeAuditSchema.index({ branchCode: 1, date: 1 }, { unique: true });

export default mongoose.model("FridgeAudit", fridgeAuditSchema, "fridge_audits");