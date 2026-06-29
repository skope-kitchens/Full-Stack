import mongoose from "mongoose";

/**
 * subrecipe_dispatches — movement of finished sub-recipes from the base kitchen
 * (JP Nagar) to the local/normal kitchens (Marathahalli, Kalyan Nagar, Jayanagar,
 * JP Nagar assembly).
 *
 * LIFECYCLE (QC-style, mirrors GRN: stock is only credited on receipt):
 *   REQUESTED   → a local kitchen asked for this sub-recipe (initial state when a
 *                 Local Kitchen raises a SUB_RECIPE replenishment request). Visible
 *                 in the Head Chef's inbound queue. No stock has moved.
 *   DISPATCHED  → Head Chef shipped it. JP Nagar SEMI_FINISHED stock is debited
 *                 atomically at dispatch time. Destination stock NOT yet credited.
 *   RECEIVED    → local kitchen acknowledged receipt → its BRANCH_KITCHEN stock is
 *                 credited atomically.
 *   DISCREPANCY → local kitchen flagged a mismatch → NO stock credit; note saved
 *                 for the Head Chef to resolve / re-dispatch.
 *
 * A Head-Chef-initiated dispatch starts at DISPATCHED. A Local-Kitchen-initiated
 * request starts at REQUESTED and becomes DISPATCHED when the Head Chef fulfils it.
 */
const subrecipeDispatchSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, trim: true, index: true },
    subRecipeName: { type: String, required: true, trim: true, index: true },
    qty: { type: Number, default: 0 },
    uom: { type: String, default: "" },

    // Base kitchen is always JP Nagar in B2C.
    fromBranchCode: { type: String, default: "JPNAGAR", trim: true, uppercase: true, index: true },
    toBranchCode: { type: String, required: true, trim: true, uppercase: true, index: true },

    status: {
      type: String,
      enum: ["REQUESTED", "DISPATCHED", "RECEIVED", "DISCREPANCY"],
      default: "DISPATCHED",
      index: true,
    },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    requestedAt: { type: Date, default: null },
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    dispatchedAt: { type: Date, default: null },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    receivedAt: { type: Date, default: null },

    discrepancyNote: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

// Common queries: a kitchen's inbound dispatches over time; a brand's flow.
subrecipeDispatchSchema.index({ toBranchCode: 1, status: 1, createdAt: -1 });
subrecipeDispatchSchema.index({ brandName: 1, createdAt: -1 });

export default mongoose.model("SubrecipeDispatch", subrecipeDispatchSchema, "subrecipe_dispatches");
