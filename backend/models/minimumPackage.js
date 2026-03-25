import mongoose from "mongoose";

const minimumPackageSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true, index: true },
    uom: { type: String, trim: true, default: "" },
    minPackQty: { type: Number, default: 0 },
    minPackCost: { type: Number, default: 0 },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model(
  "MinimumPackage",
  minimumPackageSchema,
  "minimumpackage"
);

