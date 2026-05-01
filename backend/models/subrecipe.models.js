import mongoose from "mongoose";

const recipeItemSchema = new mongoose.Schema(
  {
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
    refId: {
      type: String, // skuCode or inventory identifier
      required: true,
    },
    yield: Number,
    itemBrand: String,
    specification: String,
    quantity: {
      type: Number,
      required: true,
    },
    uom: {
      type: String,
      enum: ["PC", "GM", "KG"],
      required: true,
    },
    netPrice: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const subRecipeSchema = new mongoose.Schema(
  {
    brand: {
      type: String,
      required: true,
      index: true,
    },
    recipeName: {
      type: String,
      required: true,
      trim: true,
    },
    items: {
      type: [recipeItemSchema],
      required: true,
    },
  },
  { timestamps: true }
);

const SubRecipe = mongoose.model("SubRecipe", subRecipeSchema);

export default SubRecipe;
