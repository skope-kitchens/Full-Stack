import ItemMaster from "../models/itemMaster.js";
import SubRecipe from "../models/subRecipe.js";
import MainRecipe from "../models/mainRecipe.js";

/* ---------------- HELPERS ---------------- */

const normalize = (uom) =>
  typeof uom === "string"
    ? uom.toUpperCase().replace("PCS", "PC")
    : "";

const safeTrim = (v) =>
  typeof v === "string" ? v.trim() : "";

/* ---------------- INGREDIENT COST ---------------- */

const getIngredientCost = async (itemName, qty, uom) => {
  const name = safeTrim(itemName);
  if (!name) throw new Error("Ingredient name missing");

  const item = await ItemMaster.findOne({
    itemName: { $regex: `^${name}$`, $options: "i" },
  });

  if (!item) {
    throw new Error(`Item not found in Item Master: ${name}`);
  }

  const price = Number(item.netPrice || 0);
  if (price <= 0) {
    throw new Error(`Invalid price for item: ${name}`);
  }

  const itemUom = normalize(item.uom);
  const rowUom = normalize(uom);
  const quantity = Number(qty || 0);

  if (itemUom === "PC" || rowUom === "PC") {
    return price * quantity;
  }

  return (price / 1000) * quantity;
};

/* ---------------- SUB-RECIPE COST ---------------- */

const getSubRecipeCostPerGram = async (bomName) => {
  const name = safeTrim(bomName);
  if (!name) throw new Error("SubRecipe name missing");

  const rows = await SubRecipe.find({
    bomName: { $regex: `^${name}$`, $options: "i" },
  });

  if (!rows.length) {
    throw new Error(`SubRecipe not found: ${name}`);
  }

  const yieldQty = Number(
    rows[0].yield ??
    rows[0]["Yield"] ??
    0
  );

  if (yieldQty <= 0) {
    throw new Error(`Invalid yield for SubRecipe: ${name}`);
  }

  const totalCost = rows.reduce(
    (sum, r) => sum + Number(r.quantityPrice || 0),
    0
  );

  return totalCost / yieldQty;
};

/* ---------------- MAIN RECIPE COST ---------------- */

export const calculateMainRecipeCost = async (
  dishName,
  wastagePercent = 5,
  brandName
) => {
  const dish = safeTrim(dishName);
  const brand = safeTrim(brandName);

  if (!dish || !brand) {
    throw new Error("Dish name or brand missing");
  }

  const brandRegex = new RegExp(
    brand.split(/\s+/)[0],
    "i"
  );

  const rows = await MainRecipe.find({
    bomName: { $regex: `^${dish}$`, $options: "i" },
    brand: brandRegex,
  });

  if (!rows.length) {
    throw new Error(`Dish not found for brand: ${dish}`);
  }

  let totalFoodCost = 0;
  let totalPackagingCost = 0;
  const breakdown = [];

  for (const row of rows) {
    const type = row.TYPE ?? row.type ?? "";
    const qty = Number(row.Quantity ?? row.quantity ?? 0);
    const uom = row.UOM ?? row.uom;

    const category = String(row["Food/Packeging"] || "")
  .trim()
  .toUpperCase();




    let cost = 0;

    const itemDesc =
      row["ITEM DESCIPTION"] ??
      row.itemDescription ??
      "";

    if (type === "Ingredient") {
      cost = await getIngredientCost(itemDesc, qty, uom);
    }

    if (type === "SubRecipe") {
      const costPerGram = await getSubRecipeCostPerGram(itemDesc);
      cost = costPerGram * qty;
    }

    if (category === "F") totalFoodCost += cost;
    if (category === "P") totalPackagingCost += cost;

    breakdown.push({
      item: itemDesc,
      type,
      category,
      quantity: qty,
      cost: Number(cost.toFixed(2)),
    });
  }

  const wastageRate = Number(wastagePercent) / 100;
  if (isNaN(wastageRate) || wastageRate < 0) {
    throw new Error("Invalid wastage percentage");
  }

  const wastageCost = totalFoodCost * wastageRate;

  return {
    dishName: dish,
    totalFoodCost: +totalFoodCost.toFixed(2),
    totalPackagingCost: +totalPackagingCost.toFixed(2),
    wastagePercent,
    wastageCost: +wastageCost.toFixed(2),
    totalCost: +(
      totalFoodCost +
      totalPackagingCost +
      wastageCost
    ).toFixed(2),
    breakdown,
  };
};
