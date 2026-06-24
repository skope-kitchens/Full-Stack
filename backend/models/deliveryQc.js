import mongoose from "mongoose";

/**
 * delivery_qc — Delivery Quality-Control gate for the Stock Manager.
 *
 * When a vendor delivers against an indent, the Stock Manager logs the GRN AND
 * the QC outcome together. Each delivery_qc row links 1:1 with the Purchase
 * Register batch it produced (purchaseRegisterId). Stock is credited to the
 * Purchase Register only when qcStatus is ACCEPTED or PARTIAL — SHORT/REJECTED
 * record the failure for Head Chef visibility without crediting stock.
 *
 * This sits BESIDE the Purchase Register (no schema change there) so the QC
 * decision is auditable independently of the stock it did or did not create.
 */
const deliveryQcSchema = new mongoose.Schema(
  {
    // null when the QC outcome was SHORT/REJECTED (no stock batch was created).
    purchaseRegisterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseRegister",
      default: null,
      index: true,
    },
    brandName: { type: String, required: true, trim: true, index: true },
    itemName: { type: String, required: true, trim: true, index: true },
    ingredientBrand: { type: String, default: "", trim: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },
    vendorName: { type: String, default: "", trim: true },

    // The indent this delivery fulfils (for "ordered vs received" analytics).
    indentId: { type: mongoose.Schema.Types.ObjectId, ref: "IngredientIndent", default: null, index: true },

    plannedQty: { type: Number, default: 0 }, // what the indent asked for
    purchasedQty: { type: Number, default: 0 }, // what was ordered from the vendor
    receivedQty: { type: Number, default: 0 }, // what physically arrived
    uom: { type: String, default: "" },
    pricePerUnit: { type: Number, default: 0 },
    expiryDate: { type: Date, default: null },

    qcStatus: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "SHORT", "REJECTED", "PARTIAL"],
      default: "PENDING",
      index: true,
    },
    qcNote: { type: String, default: "", trim: true },
    qcBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    qcAt: { type: Date, default: null },

    warehouseId: { type: String, default: "", trim: true, uppercase: true, index: true },

    // ── Wallet → Razorpay-direct redesign (CLAUDE.md §24) ──────────────────
    // A single GRN submission may produce several delivery_qc rows (one per
    // item). grnGroupId ties those rows into ONE logical GRN so invoice-linking
    // and client visibility operate at the GRN level, not per item.
    grnGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    // Procurement invoice(s) (User.invoices subdoc _ids) this GRN is linked to —
    // a parent procurement invoice plus any supplementary invoices.
    linkedInvoiceIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },

    // Store Manager must enter the final received qty/price before the GRN can
    // become client-visible.
    receivedQtyEntered: { type: Boolean, default: false },

    // Set ONLY when every linked invoice is PAID AND receivedQtyEntered is true.
    // The client GRN view filters on { clientVisibleAt: { $ne: null } }.
    clientVisibleAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

deliveryQcSchema.index({ brandName: 1, createdAt: -1 });
deliveryQcSchema.index({ grnGroupId: 1 });

export default mongoose.model("DeliveryQc", deliveryQcSchema, "delivery_qc");
