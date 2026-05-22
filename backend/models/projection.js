import mongoose from "mongoose";

const projectionItemSchema = new mongoose.Schema(
  {
    recipeName: { type: String, required: true, trim: true },
    targetQty: { type: Number, required: true },
    uom: { type: String, default: "PC" },
  },
  { _id: false }
);

const projectionSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    brandName: { type: String, required: true, trim: true, index: true },
    type: {
      type: String,
      enum: ["DAILY", "WEEKLY"],
      required: true,
    },
    forDate: {
      type: Date,
      required: true,
    },
    items: {
      type: [projectionItemSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["PENDING_CHEF_REVIEW", "CHEF_CONFIRMED", "COMPLETED", "CANCELLED"],
      default: "PENDING_CHEF_REVIEW",
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Projection", projectionSchema, "projections");
