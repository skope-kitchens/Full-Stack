import mongoose from "mongoose";

const purchaseHistorySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["PURCHASE_IN", "DEDUCTION", "CORRECTION", "CANCELLED"],
      required: true,
    },
    qty: { type: Number, required: true },
    uom: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    branchCode: { type: String, default: "", trim: true, uppercase: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    referenceKind: {
      type: String,
      enum: ["INDENT", "MANUAL", "CORRECTION", null],
      default: null,
    },
    previousQty: { type: Number, default: null },
    newQty: { type: Number, default: null },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const purchaseRegisterSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, trim: true, index: true },
    itemName: { type: String, required: true, trim: true, index: true },
    ingredientBrand: { type: String, required: true, trim: true, index: true },
    uom: { type: String, required: true, trim: true },
    qtyPurchased: { type: Number, required: true },
    qtyRemaining: { type: Number, required: true },
    pricePerUnit: { type: Number, required: true },
    expiryDate: { type: Date, required: true, index: true },
    purchaseDate: { type: Date, default: Date.now },
    vendorName: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["ACTIVE", "DEPLETED", "EXPIRED", "CANCELLED"],
      default: "ACTIVE",
      index: true,
    },
    history: { type: [purchaseHistorySchema], default: [] },
  },
  { timestamps: true }
);

purchaseRegisterSchema.index(
  { brandName: 1, itemName: 1, ingredientBrand: 1, status: 1, expiryDate: 1 }
);

export default mongoose.model("PurchaseRegister", purchaseRegisterSchema, "purchase_register");