import mongoose from "mongoose";

const historySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "ISSUE",
        "RECEIVED",
        "TRANSFER_IN",
        "TRANSFER_OUT",
        "RECONCILIATION",
        "PROCUREMENT_IN",
        "WASTAGE",
        "SPOILAGE",
        "MARK_USED",
        "MARK_ARCHIVED",
      ],
      required: true,
    },
    qty: { type: Number, required: true },
    uom: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    fromBrandName: { type: String, default: "" },
    toBrandName: { type: String, default: "" },
    // For RECONCILIATION and MARK_USED — absolute value tracking
    previousQty: { type: Number, default: null },
    newQty: { type: Number, default: null },
    // Causality — links history entry to the business event that caused it
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    referenceKind: {
      type: String,
      enum: ["INDENT", "STOCK_UPDATE", "TRANSFER", "BATCH", "MANUAL", null],
      default: null,
    },
    actorRole: { type: String, default: "" },
    note: { type: String, default: "" },
    // For SPOILAGE entries — why the cooked food was removed from the fridge.
    spoilageReason: {
      type: String,
      enum: ["SPOILED_EXPIRED", "WASTAGE", "QUALITY_REJECTION", "OTHER", null],
      default: null,
    },
  },
  { _id: false }
);

const brandStockSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, trim: true, index: true },
    itemName: { type: String, required: true, trim: true, index: true },
    ingredientBrand: { type: String, default: "", trim: true },
    uom: { type: String, default: "" },
    qtyRemaining: { type: Number, default: 0 },
    // Soft quantity lock — reserved by confirmed pending orders (not yet produced).
    // qtyAvailable = qtyRemaining - qtyReserved. Never stored; always derived.
    qtyReserved: { type: Number, default: 0 },
    status: { type: String, enum: ["Pending", "Used", "Archived"], default: "Pending", index: true },

    // ── Inventory Ledger Location Fields ──────────────────────────────────────
    // Physical storage location of this stock record.
    location: {
      type: String,
      enum: ["WAREHOUSE_DRY", "WAREHOUSE_CHILLER", "WAREHOUSE_FREEZER", "BRANCH_KITCHEN", "SEMI_FINISHED"],
      default: "BRANCH_KITCHEN",
      index: true,
    },
    // Who owns this stock (SKOPE_WAREHOUSE for central stock, brandName for brand-owned).
    ownedBy: { type: String, default: null, trim: true, index: true },
    // Which physical branch this stock sits at.
    // Format must match AdminUser.branchCode (uppercase, no underscore — e.g. "JPNAGAR"),
    // since RECIPE_MANAGER accounts filter fridge/kitchen stock by that exact value.
    branchCode: { type: String, default: "JPNAGAR", trim: true, uppercase: true, index: true },
    // Whether this brand's inventory is managed through ERP procurement flows.
    // false = Category A (kitchen-only) brands — no automated deduction.
    inventoryManaged: { type: Boolean, default: true },
    // Alert threshold. System fires LOW_STOCK alert when qtyRemaining drops below this.
    lowStockThreshold: { type: Number, default: 0 },
    // ──────────────────────────────────────────────────────────────────────────

    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

// Ledger key now includes branchCode + location, so the same ingredient can be
// tracked as separate stock records per branch/storage location (e.g. "bun" at
// JPNAGAR Branch Kitchen vs "bun" at TESTBRANCH Branch Kitchen are different records).
// The previous {brandName, itemName, ingredientBrand} index has been dropped via
// migration script (backend/scripts/migrateBrandStockIndex.js).
brandStockSchema.index(
  { brandName: 1, itemName: 1, ingredientBrand: 1, branchCode: 1, location: 1 },
  { unique: true }
);

export default mongoose.model("BrandStock", brandStockSchema, "brand_stocks");

