import mongoose from "mongoose";

/**
 * ingredient_lists_to_poc — the Head Chef → POC procurement handoff.
 *
 * When the Head Chef builds a trial (T1/T2/T3) or training (TR1/TR2/TR3) recipe,
 * they send its flattened ingredient list to the POC so the POC can make the
 * SKOPE_PROCURES vs CLIENT_PROCURES decision (the POC's existing procurement
 * workflow). The list is generated READ-ONLY from the recipe BOM via the shared
 * bomExpander — never hand-typed — so it always matches the recipe.
 *
 * The POC acknowledges a list (pocAcknowledgedAt) once they've actioned it. This
 * does NOT touch money — it only surfaces what to procure.
 */
const listItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    qty: { type: Number, default: 0 },
    uom: { type: String, default: "" },
    refId: { type: String, default: "" },
    manufacturerBrand: { type: String, default: "", trim: true },
    // Procurement (vendor) price the POC enters — separate from FCR/recipe pricing.
    unitPrice: { type: Number, default: null },
    totalPrice: { type: Number, default: null },
  },
  { _id: false }
);

const ingredientListToPocSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, trim: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    phase: { type: String, enum: ["TRIAL", "TRAINING"], required: true, index: true },
    code: { type: String, enum: ["T1", "T2", "T3", "TR1", "TR2", "TR3"], required: true },
    recipeName: { type: String, default: "", trim: true },
    // BOM_EXTRACTED = generated from an existing recipe's BOM (original flow).
    // CUSTOM = hand-typed by the Head Chef when no recipe/BOM exists yet (e.g. T1 of a new dish).
    listType: { type: String, enum: ["BOM_EXTRACTED", "CUSTOM"], default: "BOM_EXTRACTED" },
    items: { type: [listItemSchema], default: [] },
    sentBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    sentAt: { type: Date, default: Date.now, index: true },
    pocAcknowledgedAt: { type: Date, default: null, index: true },
    pocAcknowledgedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Procurement pricing + invoice lifecycle (separate from FCR/recipe pricing).
    pricingStatus: { type: String, enum: ["AWAITING_PRICING", "PRICED", "INVOICE_RAISED"], default: "AWAITING_PRICING" },
    grandTotal: { type: Number, default: null },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

ingredientListToPocSchema.index({ clientId: 1, pocAcknowledgedAt: 1, sentAt: -1 });

export default mongoose.model("IngredientListToPoc", ingredientListToPocSchema, "ingredient_lists_to_poc");
