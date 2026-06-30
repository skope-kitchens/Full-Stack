import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    recipeName: { type: String, required: true, trim: true },
    qty: { type: Number, default: 1 },
    uom: { type: String, default: "", trim: true },
    cost: { type: Number, default: 0 },
    // Soft-delete flag (BUG-001 / §28). When true the item is hidden from every
    // menu read path (filtered out in JS after .lean()), but the subdocument is
    // retained so nothing referencing it by name/price loses history.
    isDeleted: { type: Boolean, default: false },
  },
  // _id enabled (was { _id: false }) so each menu item has a stable ObjectId the
  // client edit/soft-delete endpoints can target: /api/menu-items/:entryId/items/:itemId
  { _id: true }
);

const menuEntrySchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    brandName: { type: String, default: "", trim: true, index: true },
    branchCode: { type: String, required: true, trim: true, index: true },
    items: { type: [menuItemSchema], default: [] },
    isSeenByRecipeAdmin: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("MenuEntry", menuEntrySchema, "menu_entries");

