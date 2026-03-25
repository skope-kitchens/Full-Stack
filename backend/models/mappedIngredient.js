import mongoose from "mongoose";

const mappedItemSchema = new mongoose.Schema(
  {
    skuCode: { type: String, default: "" },
    itemName: { type: String, required: true, trim: true },
    categoryName: { type: String, default: "" },
    uom: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    // Cost is captured by Ingredient Admin during verification
    cost: { type: Number, default: 0 },
  },
  { _id: false }
);

const mappedIngredientSchema = new mongoose.Schema(
  {
    recipeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    recipeKind: {
      type: String,
      enum: ["main", "sub", "trial", "training"],
      required: true,
    },
    branchCode: { type: String, required: true, trim: true },
    items: { type: [mappedItemSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model(
  "MappedIngredient",
  mappedIngredientSchema,
  "mapped_ingredients"
);

