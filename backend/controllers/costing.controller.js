import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import ItemMaster from "../models/itemMaster.js";
import { brandsMatch } from "../utils/brandMatch.js";

/* ================= GET MAIN RECIPES ================= */

export const getMainRecipes = async (req, res) => {
  const userBrandName = req.user?.brandName;
  if (!userBrandName) {
    return res.status(403).json({ message: "Brand not linked to this account" });
  }
  const allRecipes = await MainRecipe.find({}, "recipeName brand").lean();
  const recipes = allRecipes.filter(r => brandsMatch(userBrandName, r.brand));
  res.json(recipes);
};

const normalizeCategory = (category) => {
  if (category === "P") return "Packaging";
  return "Food"; // default for "F", undefined, old data
};

/* ================= CALCULATE COST ================= */

export const calculateFoodCost = async (req, res) => {
  const { recipeName, wastagePercent = 0, brandName: bodyBrandName } = req.body;
  // Admin can pass brandName in body to view a brand's recipe; otherwise use logged-in user's brand
  const ADMIN_ROLES = new Set([
    "WALLET_MANAGER",
    "ORDER_MANAGER",
    "RECIPE_MANAGER",
    "INGREDIENT_MANAGER"
  ]);

  const userBrandName =
    req.user?.role && ADMIN_ROLES.has(req.user.role) && bodyBrandName
      ? bodyBrandName
      : req.user?.brandName;
  if (!userBrandName) {
    return res.status(403).json({ message: "Brand not linked to this account" });
  }

  const recipes = await MainRecipe.find({ recipeName }).lean();
  const mainRecipe = recipes.find(r => brandsMatch(userBrandName, r.brand));
  if (!mainRecipe) {
    return res.status(404).json({ message: "Recipe not found for your brand" });
  }

  let breakdown = [];
  let foodCost = 0;
  let packagingCost = 0;

  const subRecipeCache = new Map(); // key: recipeNameLower -> SubRecipe doc (lean)

  // 🔁 expand items recursively
  for (const item of mainRecipe.items) {
    await expandItem({
      item,
      multiplier: 1,
      level: 0,
      breakdown,
      brandName: userBrandName,
      subRecipeCache,
    });
  }

  // recalc totals from breakdown (safe)
  foodCost = breakdown
    .filter(b => b.category === "Food" && b.level === 0)
    .reduce((s, b) => s + b.cost, 0);

  packagingCost = breakdown
    .filter(b => b.category === "Packaging" && b.level === 0)
    .reduce((s, b) => s + b.cost, 0);

  // 12% added food cost
  const foodCostWithTax = foodCost * 1.12;

  // production variance = 5% of food cost WITH 12%
  const productionVariance = foodCostWithTax * 0.05;

  const total =
    foodCostWithTax + packagingCost + productionVariance;

  res.json({
    breakdown,
    foodCost: round(foodCostWithTax), // includes 12%
    packagingCost: round(packagingCost),
    productionVariance: round(productionVariance),
    total: round(total),
  });
};

/* ================= RECURSIVE EXPAND ================= */

async function expandItem({
  item,
  multiplier,
  level,
  breakdown,
  brandName,
  subRecipeCache,
}) {
  const category = normalizeCategory(item.category);

  // For ingredients: use normal cost
  if (item.type !== "SUBRECIPE") {
    const cost = calculateCost(item) * multiplier;
    breakdown.push({
      item: item.refId,
      type: item.type,
      category,
      qty: item.quantity,
      uom: item.uom,
      cost: round(cost),
      level,
    });
    return;
  }

  // For subrecipes:
  // - show the child ingredient costs for display
  // - but totals must not double-count children; totals are calculated using only level === 0 rows
  const explicitCost = calculateCost(item) * multiplier; // if main recipe stored a subrecipe cost explicitly

  const sub = await resolveSubRecipe({
    recipeName: item.refId,
    brandName,
    cache: subRecipeCache,
  });

  let computedCost = 0;
  if (sub) {
    computedCost = await sumSubRecipeCost({
      items: sub.items,
      brandName,
      multiplier,
      subRecipeCache,
    });
  }

  const subCost = explicitCost > 0 ? explicitCost : computedCost;

  breakdown.push({
    item: item.refId,
    type: item.type,
    category,
    qty: item.quantity,
    uom: item.uom,
    cost: round(subCost),
    level,
  });

  // Expand children for display (with real costs)
  if (!sub) return;
  for (const child of sub.items) {
    await expandItem({
      item: child,
      multiplier,
      level: level + 1,
      breakdown,
      brandName,
      subRecipeCache,
    });
  }
}

/* ================= HELPERS ================= */
const escapeRegex = (text) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


const calculateCost = ({ quantity, netPrice, uom }) => {
  const qty = Number(quantity || 0);
  const price = Number(netPrice || 0);

  if (!qty || !price) return 0;

  if (uom === "GM") {
    return (qty / 1000) * price;
  }

  return qty * price;
};

async function resolveSubRecipe({ recipeName, brandName, cache }) {
  const key = String(recipeName || "").trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  const subs = await SubRecipe.find({ recipeName }).lean();
  const match = subs.find((s) => brandsMatch(brandName, s.brand)) || subs[0] || null;
  cache.set(key, match);
  return match;
}

async function sumSubRecipeCost({ items, brandName, multiplier, subRecipeCache }) {
  let sum = 0;
  for (const it of items || []) {
    if (it.type === "SUBRECIPE") {
      const sub = await resolveSubRecipe({
        recipeName: it.refId,
        brandName,
        cache: subRecipeCache,
      });
      if (!sub) continue;
      const explicit = calculateCost(it) * multiplier;
      const nested = await sumSubRecipeCost({
        items: sub.items,
        brandName,
        multiplier,
        subRecipeCache,
      });
      sum += explicit > 0 ? explicit : nested;
    } else {
      sum += calculateCost(it) * multiplier;
    }
  }
  return sum;
}

/* ================= SUMMARY ================= */

export const getSummary = async (req, res) => {
  const userBrandName = req.user?.brandName;
  if (!userBrandName) {
    return res.status(403).json({ message: "Brand not linked to this account" });
  }

  const allRecipes = await MainRecipe.find({}, "recipeName brand").lean();
  const recipes = allRecipes.filter(r => brandsMatch(userBrandName, r.brand));

  const summary = [];

  for (const recipe of recipes) {
    const result = await calculateRecipe(recipe._id);

    summary.push({
      dishName: recipe.recipeName,
      brand: recipe.brand,
      foodCost: result.foodCost,
      packagingCost: result.packagingCost,
      productionVariance: result.productionVariance,
      totalCost: result.total,
    });
  }

  res.json({ summary });
};

async function calculateRecipe(recipeId) {
  const mainRecipe = await MainRecipe.findById(recipeId);
  if (!mainRecipe) return null;

  let breakdown = [];
  const subRecipeCache = new Map();

  for (const item of mainRecipe.items) {
    await expandItem({
      item,
      multiplier: 1,
      level: 0,
      breakdown,
      brandName: mainRecipe.brand,
      subRecipeCache,
    });
  }

  const foodCost = breakdown
    .filter(b => b.category === "Food" && b.level === 0)
    .reduce((s, b) => s + b.cost, 0);

  const packagingCost = breakdown
    .filter(b => b.category === "Packaging" && b.level === 0)
    .reduce((s, b) => s + b.cost, 0);

  const foodCostWithTax = foodCost * 1.12;
  const productionVariance = foodCostWithTax * 0.05;

  return {
    foodCost: round(foodCostWithTax), // includes 12%
    packagingCost: round(packagingCost),
    productionVariance: round(productionVariance),
    total: round(
      foodCostWithTax + packagingCost + productionVariance
    ),
  };
}

const round = (n) => Number(n.toFixed(2));