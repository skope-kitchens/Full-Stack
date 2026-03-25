import ItemMaster from "../models/itemmaster.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import MainRecipe from "../models/mianrecipe.models.js";

/**
 * Normalize helper
 */
const normalize = (uom) =>
  uom?.toString().toUpperCase().replace("PCS", "PC");

const getIngredientCost = async (itemName, qty, uom) => {
  const item = await ItemMaster.findOne({
    itemName: { $regex: `^${itemName.trim()}$`, $options: "i" },
  });

  if (!item) {
    throw new Error(`Item not found in Item Master: ${itemName}`);
  }

  const price = Number(item.netPrice);

  if (!price || price <= 0) {
    throw new Error(`Invalid price for item: ${itemName}`);
  }

  const itemUom = normalize(item.uom);
  const rowUom = normalize(uom);

  // PC based
  if (itemUom === "PC" || rowUom === "PC") {
    return price * qty;
  }

  // KG → GM
  return (price / 1000) * qty;
};


/**
 * Sub-recipe cost per gram
 */
const getSubRecipeCostPerGram = async (bomName) => {
  const rows = await SubRecipe.find({
    bomName: { $regex: bomName.trim(), $options: "i" },
  });

  if (!rows.length) {
    throw new Error(`SubRecipe not found: ${bomName}`);
  }

  // 🔥 SAFE YIELD RESOLUTION
  const rawYield =
    rows[0].yield ??
    rows[0].Yield ??
    rows[0]["Yield"];

  const yieldQty = Number(rawYield);

  if (!yieldQty || isNaN(yieldQty) || yieldQty <= 0) {
    throw new Error(`Invalid yield for SubRecipe: ${bomName}`);
  }

  const totalCost = rows.reduce(
    (sum, r) =>
      sum +
      Number(
        r.quantityPrice ??
        r["Quantity Price"] ??
        0
      ),
    0
  );

  return totalCost / yieldQty;
};


/**
 * MAIN RECIPE COST
 */
export const calculateMainRecipeCost = async (dishName) => {
  console.log("Dish lookup:", dishName);
  

  const rows = await MainRecipe.find({
    "BOM NAME": { $regex: `^${dishName.trim()}$`, $options: "i" },
  });

  console.log("RAW ROWS COUNT:", rows.length);

  if (!rows.length) {
    throw new Error(`Dish not found: ${dishName}`);
  }

  let totalFoodCost = 0;
  let totalPackagingCost = 0;
  const breakdown = [];

  for (const row of rows) {
    console.log("Processing row:", row["ITEM DESCIPTION"]);
    const rawCategory =
    row.category ??
    row["Food/Packaging"] ??
    row["Food Packaging"] ??
    row["Food/Packaging "] ??
    row.FoodPackaging;

  // 🔥 NORMALIZE VALUE
  const category = rawCategory?.toString().trim().toUpperCase();

    let cost = 0;

    if (row.TYPE === "Ingredient") {
      cost = await getIngredientCost(
        row["ITEM DESCIPTION"],
        row.Quantity,
        row.UOM
      );
    }

    if (row.TYPE === "SubRecipe") {
      const costPerGram = await getSubRecipeCostPerGram(
        row["ITEM DESCIPTION"]
      );
      cost = costPerGram * row.Quantity;
    }

    if (category === "F") {
    totalFoodCost += cost;
  }

  // ✅ PACKAGING COST
  if (category === "P") {
    totalPackagingCost += cost;
  }

    breakdown.push({
      item: row["ITEM DESCIPTION"],
      type: row.TYPE,
      category,
      quantity: row.Quantity,
      cost: Number(cost.toFixed(2)),
    });
  }

  return {
    dishName,
    totalFoodCost: Number(totalFoodCost.toFixed(2)),
    totalPackagingCost: Number(totalPackagingCost.toFixed(2)),
    totalCost: Number((totalFoodCost + totalPackagingCost).toFixed(2)),
    breakdown,
  };
};
