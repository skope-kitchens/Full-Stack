import mongoose from "mongoose";

/**
 * procurement_logs — append-only event stream for the Stock Manager dashboard.
 *
 * WHY THIS EXISTS:
 *   This is the canonical, immutable record of every operational write the Stock
 *   Manager makes (purchases, QC outcomes, indent verify/issue, closing-stock
 *   reconciliation, variance entries). It is the PRIMARY read source for the
 *   future Data Analyst dashboard (#6). Nothing here is ever updated or deleted —
 *   each business write appends exactly one entry.
 *
 *   Keep it queryable: it carries brand, item, vendor, qty, actor and timestamp
 *   so the analyst can slice by any of them without joining back to the source
 *   collections.
 */
const procurementLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: [
        "PURCHASE",
        "QC",
        "INDENT_ISSUED",
        "INDENT_VERIFIED",
        "STOCK_RECONCILED",
        "VARIANCE_RECORDED",
        "VENDOR_CREATED",
        "VENDOR_UPDATED",
        "VENDOR_ALERT_RESOLVED",
        "INGREDIENT_THRESHOLD_SET",
        // ── Producer dashboards #4 (Head Chef) + #5 (Local Kitchen) ──────────
        "RECIPE_PROMOTED",            // training recipe promoted to Final (MainRecipe)
        "SUBRECIPE_DISPATCHED",       // Head Chef shipped a sub-recipe to a local kitchen
        "SUBRECIPE_RECEIVED",         // local kitchen acknowledged receipt
        "INGREDIENT_LIST_SENT_TO_POC",// Head Chef sent a trial/training ingredient list to POC
        "VENDOR_ALERT_RAISED",        // Head Chef raised a vendor alert (SM resolves)
        "LOCAL_KITCHEN_INDENT_RAISED",// local kitchen requested replenishment
        "BASE_KITCHEN_AUDIT_LOCKED",  // Head Chef locked a SEMI_FINISHED audit
        "LOCAL_KITCHEN_AUDIT_LOCKED", // local kitchen locked its closing-stock audit
        // ── Wallet → Razorpay-direct redesign (CLAUDE.md §24) ──────────────
        "PROCUREMENT_INVOICE_RAISED", // Stock Manager raised a procurement invoice
        "GRN_RECEIVED_UPDATED",       // Stock Manager entered final received qty/price on a GRN
        // ── Manual Local-Kitchen Order Entry (CLAUDE.md §25) ───────────────
        "ORDER_INGESTED",             // Local Kitchen recorded a manual order (cascade fired)
        "ORDER_REVERSED",             // Local Kitchen deleted a manual order within 30 min (cascade reversed)
        // ── Recipe Import (Head Chef bulk onboarding, CLAUDE.md §26) ───────
        "RECIPE_IMPORT_RUN",          // Head Chef committed a bulk recipe import for a brand
      ],
      required: true,
      index: true,
    },
    brandName: { type: String, default: "", trim: true, index: true },
    itemName: { type: String, default: "", trim: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },
    qty: { type: Number, default: null },
    uom: { type: String, default: "" },

    // Pointer back to the source document that this event describes.
    refId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    refCollection: { type: String, default: "" },

    // Who performed the action (AdminUser._id) and their role at the time.
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    actorRole: { type: String, default: "" },

    // Warehouse the action happened at (Stock Manager's warehouseId). Lets the
    // analyst scope by physical location without inferring it.
    warehouseId: { type: String, default: "", trim: true, uppercase: true, index: true },

    at: { type: Date, default: Date.now, index: true },

    // Free-form structured payload — variance reason, qc status, prices, etc.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Common analyst query shapes: by brand over time, by event type over time.
procurementLogSchema.index({ brandName: 1, at: -1 });
procurementLogSchema.index({ eventType: 1, at: -1 });

export default mongoose.model("ProcurementLog", procurementLogSchema, "procurement_logs");
