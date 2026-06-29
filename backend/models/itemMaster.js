// models/ItemMaster.js
import mongoose from "mongoose";

const itemMasterSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      trim: true,
      index: true,
    },

    uom: {
      type: String,
      enum: ["KG", "GM", "PC", "NOS", "PCS", "Pcs"],
      default: "PC",
    },

    currentPrice: {
      type: Number,
      default: null,
    },

    oldPrice: {
      type: Number,
      default: null,
    },

    yieldPercent: {
      type: Number,
      default: 100,
    },

    netPrice: {
      type: Number,
      default: 0,
    },

    // ── Stock Manager operational thresholds (additive, brand-agnostic) ───────
    // Owned/edited by the Stock Manager dashboard. Existing records have these
    // as null until the Stock Manager fills them in — the UI shows "Not set".
    // An ingredient is an ingredient, so these are not brand-scoped.
    // shelfLifeDays drives the near-expiry highlight (within shelfLifeDays/2 of
    // expiry); minStockLevel drives the low-stock highlight. reorderCadenceDays
    // is intentionally NOT stored — cadence is derived from purchase history.
    shelfLifeDays: {
      type: Number,
      default: null,
    },
    minStockLevel: {
      type: Number,
      default: null,
    },
    minStockUom: {
      type: String,
      default: null,
      trim: true,
    },
    // ──────────────────────────────────────────────────────────────────────────
  },
  {
    timestamps: true,
    strict: false, // 🔥 allows old Excel-style fields
  }
);

export default mongoose.model(
  "ItemMaster",
  itemMasterSchema,
  "itemmasters"
);
