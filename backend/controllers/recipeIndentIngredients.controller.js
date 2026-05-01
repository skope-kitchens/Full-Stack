import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import TrialRecipe from "../models/trialRecipe.models.js";
import TrainingRecipe from "../models/trainingRecipe.models.js";
import { brandsMatch } from "../utils/brandMatch.js";

const normalizeCategory = (category) => {
  if (category === "P") return "Packaging";
  if (!category) return "Food";
  if (category === "F") return "Food";
  return category;
};

const escapeRegex = (text) =>
  String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function resolveSubRecipeByName({ subRecipeName, brand, cache }) {
  const key = `${String(subRecipeName || "").trim().toLowerCase()}:${String(
    brand || ""
  )
    .trim()
    .toLowerCase()}`;

  if (cache.has(key)) return cache.get(key);
  if (!subRecipeName) return null;

  const subs = await SubRecipe.find({
    recipeName: {
      $regex: `^${escapeRegex(subRecipeName)}$`,
      $options: "i",
    },
  }).lean();

  const match =
    (brand ? subs.find((s) => brandsMatch(brand, s.brand)) : null) ||
    subs[0] ||
    null;

  cache.set(key, match);
  return match;
}

async function expandRecipeToLeafIngredients({
  items,
  multiplier,
  brand,
  cache,
  out,
}) {
  for (const item of items || []) {
    if (!item) continue;

    if (item.type !== "SUBRECIPE") {
      out.push({
        itemName: item.refId || "",
        ingredientBrand: item.itemBrand || "",
        categoryName: normalizeCategory(item.category),
        uom: item.uom || "",
        qty: Number(item.quantity || 0) * multiplier,
      });
      continue;
    }

    const sub = await resolveSubRecipeByName({
      subRecipeName: item.refId,
      brand,
      cache,
    });
    if (!sub) continue;

    const nextMultiplier = multiplier * Number(item.quantity || 0);
    await expandRecipeToLeafIngredients({
      items: sub.items,
      multiplier: nextMultiplier,
      brand: sub.brand || brand,
      cache,
      out,
    });
  }
}

// Returns leaf ingredients (INGREDIENT items) expanded recursively.
export const getRecipeIndentIngredients = async (req, res) => {
  try {
    const { recipeKind, recipeId } = req.params;
    if (!recipeKind || !recipeId) {
      return res.status(400).json({ message: "recipeKind and recipeId required" });
    }

    let doc = null;
    let rootBrand = "";

    if (recipeKind === "main") {
      doc = await MainRecipe.findById(recipeId).lean();
      rootBrand = doc?.brand || "";
    } else if (recipeKind === "sub") {
      doc = await SubRecipe.findById(recipeId).lean();
      rootBrand = doc?.brand || "";
    } else if (recipeKind === "trial") {
      doc = await TrialRecipe.findById(recipeId).lean();
      rootBrand = doc?.brand || "";
    } else if (recipeKind === "training") {
      doc = await TrainingRecipe.findById(recipeId).lean();
      rootBrand = doc?.brand || "";
    } else {
      return res.status(400).json({ message: "Invalid recipeKind" });
    }

    if (!doc) return res.status(404).json({ message: "Recipe not found" });

    const out = [];
    const cache = new Map();

    await expandRecipeToLeafIngredients({
      items: doc.items || [],
      multiplier: 1,
      brand: rootBrand,
      cache,
      out,
    });

    res.json({ success: true, ingredients: out });
  } catch (err) {
    console.error("getRecipeIndentIngredients error:", err?.message || err);
    return res.status(500).json({ message: "Failed to expand recipe ingredients" });
  }
};

