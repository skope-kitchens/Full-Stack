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
