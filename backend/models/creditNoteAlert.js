import mongoose from "mongoose";

const creditNoteAlertSchema = new mongoose.Schema(
  {
    ingredientName: { type: String, required: true, trim: true, index: true },
    note: { type: String, default: "", trim: true },
    brandName: { type: String, default: "", trim: true, index: true },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED"],
      default: "OPEN",
      index: true,
    },
    createdByRole: { type: String, default: "RECIPE_MANAGER" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model(
  "CreditNoteAlert",
  creditNoteAlertSchema,
  "credit_note_alerts"
);

