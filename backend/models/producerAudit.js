import mongoose from "mongoose";

/**
 * producer_audits — closing-stock / count audits for the PRODUCER dashboards
 * (Head Chef base-kitchen SEMI_FINISHED audit #4, Local Kitchen audit #5).
 *
 * WHY A SEPARATE COLLECTION (not stock_updates):
 *   stock_updates is keyed { brandId, date, correctionSeq } — it is NOT branch-
 *   or scope-aware, and the client's brand-wide "Daily Stock" view + the Stock
 *   Manager's warehouse closing-stock audit already own those rows. A Head Chef
 *   SEMI_FINISHED audit or a Local Kitchen (per-branch) audit for the same brand
 *   on the same day would (a) collide on that unique key and (b) corrupt the
 *   client Daily Stock view. This collection keys by branchCode + scope too, so
 *   every producer audit is independent and additive — no existing flow is
 *   touched.
 *
 * It reuses the Stock Manager's proven audit PATTERN: full expected-vs-actual
 * rows, a required reason on any non-zero variance, an immutable lock (lockedAt),
 * and same-day corrections stacked as new correctionSeq records. On lock/correction
 * the actual counts are reconciled into the brand_stocks ledger (RECONCILIATION
 * history), scoped to the audit's location + branchCode.
 */
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

const producerAuditSchema = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    brandName: { type: String, required: true, trim: true, index: true },
    branchCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    // BASE_SEMI_FINISHED = Head Chef's cooked sub-recipe audit at JP Nagar.
    // LOCAL = a local kitchen's own closing-stock audit.
    scope: { type: String, enum: ["BASE_SEMI_FINISHED", "LOCAL"], required: true, index: true },
    date: { type: Date, required: true, index: true },
    variances: { type: [varianceSchema], default: [] },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    correctionSeq: { type: Number, default: 0, index: true },
    correctionOf: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

producerAuditSchema.index(
  { brandId: 1, branchCode: 1, scope: 1, date: 1, correctionSeq: 1 },
  { unique: true }
);

export default mongoose.model("ProducerAudit", producerAuditSchema, "producer_audits");
