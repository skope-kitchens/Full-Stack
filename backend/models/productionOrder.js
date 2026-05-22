import mongoose from "mongoose";

const subRecipeToPrepareSchema = new mongoose.Schema(
  {
    subRecipeName: { type: String, required: true },
    batchesToPrepare: { type: Number, required: true },
    netQtyNeeded: { type: Number, required: true },
    uom: { type: String, default: "" },
  },
  { _id: false }
);

const warehouseIngredientSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true },
    requiredQty: { type: Number, required: true },
    uom: { type: String, default: "" },
    costContribution: { type: Number, default: 0 },
  },
  { _id: false }
);

const financialsSchema = new mongoose.Schema(
  {
    totalIngredientCost: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PAID"],
      default: "UNPAID",
    },
    paidAt: { type: Date, default: null },
  },
  { _id: false }
);

const productionOrderSchema = new mongoose.Schema(
  {
    projectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Projection",
      required: true,
      index: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    brandName: { type: String, required: true, trim: true, index: true },
    scaledTargetQty: { type: Number, default: 0 },
    status: {
      type: String,
      enum: [
        "PENDING_INDENT_APPROVAL",
        "AWAITING_BRAND_PAYMENT",
        "READY_FOR_DISPATCH",
        "IN_PREPARATION",
        "COMPLETED",
      ],
      default: "PENDING_INDENT_APPROVAL",
      index: true,
    },
    financials: { type: financialsSchema, default: () => ({}) },
    subRecipesToPrepare: { type: [subRecipeToPrepareSchema], default: [] },
    warehouseIngredientsToDispatch: { type: [warehouseIngredientSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model(
  "ProductionOrder",
  productionOrderSchema,
  "production_orders"
);
