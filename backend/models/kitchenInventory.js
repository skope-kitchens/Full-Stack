import mongoose from "mongoose";

const kitchenInventorySchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ItemMaster",
      required: true,
    },
    availableQty: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model(
  "KitchenInventory",
  kitchenInventorySchema,
  "kitcheninventory"
);

