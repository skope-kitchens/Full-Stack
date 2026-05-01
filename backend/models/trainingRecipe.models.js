import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["INGREDIENT", "SUBRECIPE"], required: true },
    category: { type: String, enum: ["Food", "Packaging"], default: "Food" },
    refId: String,
    yield: Number,
    itemBrand: String,
    specification: String,
    quantity: Number,
    uom: String,
    netPrice: Number,
  },
  { _id: false }
);

const trainingRecipeSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true },
    trainingCode: { type: String, enum: ["TR1", "TR2", "TR3"], required: true },
    recipeName: { type: String, required: true },
    sopLink: { type: String, default: "" },
    items: [itemSchema],
  },
  { timestamps: true }
);

export default mongoose.model(
  "TrainingRecipe",
  trainingRecipeSchema,
  "training_recipes"
);

