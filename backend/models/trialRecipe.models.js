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

const trialRecipeSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true },
    trialCode: { type: String, enum: ["T1", "T2", "T3"], required: true },
    recipeName: { type: String, required: true },
    items: [itemSchema],
  },
  { timestamps: true }
);

export default mongoose.model("TrialRecipe", trialRecipeSchema, "trial_recipes");

