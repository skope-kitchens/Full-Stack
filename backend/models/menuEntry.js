import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    recipeName: { type: String, required: true, trim: true },
    qty: { type: Number, default: 1 },
    uom: { type: String, default: "", trim: true },
    cost: { type: Number, default: 0 },
  },
  { _id: false }
);

const menuEntrySchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    brandName: { type: String, default: "", trim: true, index: true },
    items: { type: [menuItemSchema], default: [] },
    isSeenByRecipeAdmin: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("MenuEntry", menuEntrySchema, "menu_entries");

