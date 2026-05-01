import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["INGREDIENT", "SUBRECIPE"],
    required: true,
  },
  category: {
    type: String,
    enum: ["Food", "Packaging"],
    default: "Food",
  },
  refId: String,
  yield: Number,
  itemBrand: String,
  specification: String,
  quantity: Number,
  uom: String,
  netPrice: Number,
});

const mainRecipeSchema = new mongoose.Schema(
  {
    brand: { type: String, required: true },
    recipeName: { type: String, required: true },
    sopLink: { type: String, default: "" },
    items: [itemSchema],
  },
  { timestamps: true }
);

const MainRecipe = mongoose.model("MainRecipe", mainRecipeSchema);
export default MainRecipe;