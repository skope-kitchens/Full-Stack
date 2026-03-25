import mongoose from "mongoose";

const IngredientSnapshotSchema = new mongoose.Schema(
  {
    skuCode: { type: String, required: true },
    name: { type: String, required: true },
    measuringUnit: { type: String }, // PC | GM | KG
    averageCost: { type: Number },
    branchCode: { type: String },
  },
  { _id: false } // embedded only
);

export default IngredientSnapshotSchema;
