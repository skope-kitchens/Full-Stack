import mongoose from "mongoose";

const indentSchema = new mongoose.Schema(
  {
    // Brand name for the indent request (order/request brand context)
    requestBrandName: { type: String, default: "", trim: true, index: true },
    // Client brand selected in indent request (from registered clients)
    clientBrandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    clientBrandName: { type: String, default: "", trim: true, index: true },
    recipeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    recipeKind: { type: String, enum: ["main", "sub", "trial", "training"], required: true },
    recipeName: { type: String, default: "" },
    branchCode: { type: String, required: true, trim: true, index: true },

    skuCode: { type: String, default: "" },
    itemName: { type: String, required: true, trim: true, index: true },
    // Ingredient brand captured at indent stage (chef)
    ingredientBrand: { type: String, default: "", trim: true },
    categoryName: { type: String, default: "" },
    uom: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    // Cost is captured during Ingredient Admin verification step
    cost: { type: Number, default: 0 },

    status: {
      type: String,
      // INDENT_ISSUING is a transient lock state — set atomically before brand_stocks credit fires.
      // Prevents concurrent issue requests from double-crediting the same indent.
      // A document stuck in INDENT_ISSUING after a server crash requires manual reset via
      // PATCH /api/ingredient-indent/:id/reset (INGREDIENT_MANAGER only) — to be built in Day 2.
      enum: ["INDENT_PENDING", "INDENT_VERIFIED", "INDENT_ISSUING", "ISSUED"],
      default: "INDENT_PENDING",
      index: true,
    },
    isSeenByIngredientAdmin: { type: Boolean, default: false, index: true },
    isSeenByRecipeAdminGrn: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date, default: null },
    issuedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("IngredientIndent", indentSchema, "ingredient_indents");

