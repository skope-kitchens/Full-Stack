import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";

const normalizeCategory = (category) => {
  if (category === "P") return "Packaging";
  return "Food";
};

const round = (n) => Number(n.toFixed(2));

const calculateCost = ({ quantity, netPrice, uom }) => {
  const qty = Number(quantity || 0);
  const price = Number(netPrice || 0);
  if (!qty || !price) return 0;
  if (uom === "GM") return (qty / 1000) * price;
  return qty * price;
};

async function expandItem({ item, multiplier, level, breakdown, brand }) {
  const isSubrecipeChild = level > 0;
  const baseCost = isSubrecipeChild
    ? 0
    : calculateCost(item) * multiplier;

  breakdown.push({
    item: item.refId,
    type: item.type,
    category: normalizeCategory(item.category),
    qty: item.quantity,
    uom: item.uom,
    cost: round(baseCost),
    level,
  });

  if (item.type === "SUBRECIPE") {
    const subQuery = brand
      ? { recipeName: item.refId, brand }
      : { recipeName: item.refId };
    const sub = await SubRecipe.findOne(subQuery);
    if (!sub) return;
    for (const child of sub.items) {
      await expandItem({
        item: child,
        multiplier,
        level: level + 1,
        breakdown,
        brand: brand || sub.brand,
      });
    }
  }
}

export const getAllRecipes = async (req, res) => {
  try {
    const { brand } = req.query;

    const query = brand
      ? { brand: { $regex: brand, $options: "i" } }
      : {};

    const recipes = await MainRecipe.find(query)
      .select("recipeName brand")
      .sort({ brand: 1, recipeName: 1 })
      .lean();

    res.json(recipes);
  } catch (err) {
    console.error("Admin get all recipes error:", err);
    res.status(500).json({ message: "Failed to fetch recipes" });
  }
};

export const getRecipeBreakdown = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const mainRecipe = await MainRecipe.findById(recipeId);
    
    if (!mainRecipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    const breakdown = [];
    for (const item of mainRecipe.items) {
      await expandItem({
        item,
        multiplier: 1,
        level: 0,
        breakdown,
        brand: mainRecipe.brand,
      });
    }

    res.json({
      recipeName: mainRecipe.recipeName,
      brand: mainRecipe.brand,
      breakdown,
    });
  } catch (err) {
    console.error("Admin get recipe breakdown error:", err);
    res.status(500).json({ message: "Failed to fetch breakdown" });
  }
};

/** GET full main recipe by id (for admin edit) */
export const getMainRecipeById = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const mainRecipe = await MainRecipe.findById(recipeId).lean();
    if (!mainRecipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }
    res.json(mainRecipe);
  } catch (err) {
    console.error("Admin get main recipe by id error:", err);
    res.status(500).json({ message: "Failed to fetch recipe" });
  }
};

/** PUT update main recipe items */
export const updateMainRecipe = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const { items, recipeName, brand, sopLink } = req.body;
    const mainRecipe = await MainRecipe.findById(recipeId);
    if (!mainRecipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }
    if (Array.isArray(items)) {
      mainRecipe.items = items;
    }
    if (typeof recipeName === "string" && recipeName.trim()) {
      mainRecipe.recipeName = recipeName.trim();
    }
    if (typeof brand === "string" && brand.trim()) {
      mainRecipe.brand = brand.trim();
    }
    if (typeof sopLink === "string") {
      mainRecipe.sopLink = sopLink.trim();
    }
    await mainRecipe.save();
    res.json({ success: true, recipe: mainRecipe });
  } catch (err) {
    console.error("Admin update main recipe error:", err);
    res.status(500).json({ message: "Failed to update recipe" });
  }
};

/** GET list of subrecipes for admin (with _id) */
export const getAdminSubRecipes = async (req, res) => {
  try {
    const list = await SubRecipe.find({})
      .select("recipeName brand")
      .sort({ brand: 1, recipeName: 1 })
      .lean();
    res.json(list);
  } catch (err) {
    console.error("Admin get subrecipes error:", err);
    res.status(500).json({ message: "Failed to fetch subrecipes" });
  }
};

/** GET full subrecipe by id (for admin edit) */
export const getSubRecipeById = async (req, res) => {
  try {
    const { id } = req.params;
    const sub = await SubRecipe.findById(id).lean();
    if (!sub) {
      return res.status(404).json({ message: "Sub recipe not found" });
    }
    res.json(sub);
  } catch (err) {
    console.error("Admin get sub recipe by id error:", err);
    res.status(500).json({ message: "Failed to fetch sub recipe" });
  }
};

/** PUT update subrecipe items */
export const updateSubRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, recipeName, brand } = req.body;
    const sub = await SubRecipe.findById(id);
    if (!sub) {
      return res.status(404).json({ message: "Sub recipe not found" });
    }
    if (Array.isArray(items)) {
      sub.items = items;
    }
    if (typeof recipeName === "string" && recipeName.trim()) {
      sub.recipeName = recipeName.trim();
    }
    if (typeof brand === "string" && brand.trim()) {
      sub.brand = brand.trim();
    }
    await sub.save();
    res.json({ success: true, recipe: sub });
  } catch (err) {
    console.error("Admin update sub recipe error:", err);
    res.status(500).json({ message: "Failed to update sub recipe" });
  }
};
