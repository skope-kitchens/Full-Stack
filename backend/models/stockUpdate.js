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

// ── Stock Manager Closing-Stock Audit variance row (additive) ────────────────
// Captures the full daily count (every item's expected vs actual), not only the
// rows that differ. reason/reasonNote are REQUIRED (enforced in the controller)
// only when varianceQty !== 0.
const varianceSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    uom: { type: String, default: "" },
    expectedQty: { type: Number, default: 0 },
    actualQty: { type: Number, default: 0 },
    varianceQty: { type: Number, default: 0 },
    reason: {
      type: String,
      enum: ["WASTAGE", "SPOILAGE", "MISCOUNT", "THEFT", "OTHER", null],
      default: null,
    },
    reasonNote: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const stockUpdateSchema = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    brandName: { type: String, required: true, trim: true, index: true },
    date: { type: Date, required: true, index: true },
    items: { type: [stockItemSchema], default: [] },

    // ── Stock Manager Closing-Stock Audit fields (additive) ───────────────────
    // The richer audit detail. Legacy POC/Ingredient-Admin daily-stock records
    // leave these unset and behave exactly as before.
    variances: { type: [varianceSchema], default: [] },
    // Once lockedAt is set the record is immutable (enforced in controller).
    // Post-lock changes are appended as NEW records with correctionSeq 1+.
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    // 0 = original locked record, 1+ = same-day corrections (stacked history).
    correctionSeq: { type: Number, default: 0, index: true },
    // Points back to the original (seq 0) record this corrects.
    correctionOf: { type: mongoose.Schema.Types.ObjectId, default: null },
    // ──────────────────────────────────────────────────────────────────────────
  },
  { timestamps: true }
);

// Unique key now includes correctionSeq so same-day correction records (seq 1+)
// can coexist with the original (seq 0). The legacy { brandId, date } unique
// index MUST be dropped once via backend/scripts/migrateStockUpdateIndex.js —
// otherwise it would block correction inserts.
stockUpdateSchema.index({ brandId: 1, date: 1, correctionSeq: 1 }, { unique: true });

export default mongoose.model("StockUpdate", stockUpdateSchema, "stock_updates");
