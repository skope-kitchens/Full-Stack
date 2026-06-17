import mongoose from "mongoose";

const indentSchema = new mongoose.Schema(
  {
    // Brand name for the indent request (order/request brand context)
    requestBrandName: { type: String, default: "", trim: true, index: true },
    // Client brand selected in indent request (from registered clients)
    clientBrandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    clientBrandName: { type: String, default: "", trim: true, index: true },
    // recipeId/recipeKind are omitted for "manual" indents — raised directly for
    // individual ingredients without going through a recipe BOM.
    recipeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    recipeKind: { type: String, enum: ["main", "sub", "trial", "training", "manual"], required: true },
    recipeName: { type: String, default: "" },
    branchCode: { type: String, required: true, trim: true, index: true },

    // PROCUREMENT — new stock bought from a vendor, paid for by the client via wallet.
    // WAREHOUSE_TRANSFER — legacy type, kept for backward compatibility with old
    // records but no longer raised by the projection flow. (Was: debit/credit
    // between brand_stocks warehouse records.)
    // INVENTORY_TRANSFER — stock already paid for and sitting in the brand's
    // Warehouse Stock (Purchase Register). Issuing it credits Branch Kitchen and
    // deducts the matching Purchase Register batch (FEFO) — no client cost.
    indentType: {
      type: String,
      enum: ["PROCUREMENT", "WAREHOUSE_TRANSFER", "INVENTORY_TRANSFER"],
      default: "PROCUREMENT",
      index: true,
    },
    // For WAREHOUSE_TRANSFER indents — the warehouse branchCode to debit stock from on issue.
    sourceBranchCode: { type: String, default: "", trim: true, uppercase: true },

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

