import SubRecipe from "../models/subrecipe.models.js";
import { brandsMatch } from "../utils/brandMatch.js";

/* ---------------- HELPER ---------------- */
const calculateItemCost = (item) => {
  const qty = Number(item.quantity || 0);
  const price = Number(item.netPrice || 0);

  if (!qty || !price) return 0;

  if (item.uom === "GM") {
    return (qty / 1000) * price;
  }
  return qty * price; // PC / KG
};

/* ---------------- GET LIST ---------------- */
export const getSubRecipes = async (req, res) => {
  try {
    const { brand } = req.query;

    const filter = brand
      ? { brand: { $regex: `^${String(brand).trim()}$`, $options: "i" } }
      : {};

    const list = await SubRecipe.find(
      filter,
      { recipeName: 1, brand: 1 }
    ).sort({ recipeName: 1 });

    res.json(list);
  } catch (err) {
    console.error("GET SUBRECIPES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch subrecipes" });
  }
};

/* ---------------- GET LIST FOR LOGGED-IN BRAND ---------------- */
export const getSubRecipeDishList = async (req, res) => {
  try {
    const userBrandName = req.user?.brandName;

    if (!userBrandName) {
      return res.status(403).json({
        message: "Brand not linked to this account",
      });
    }

    const allSubrecipes = await SubRecipe.find(
      {},
      { recipeName: 1, brand: 1 }
    )
      .sort({ recipeName: 1 })
      .lean();

    const subRecipes = allSubrecipes.filter((r) =>
      brandsMatch(userBrandName, r.brand)
    );

    res.json({ subRecipes });
  } catch (err) {
    console.error("GET SUBRECIPE DISH LIST ERROR:", err);
    res.status(500).json({ message: "Failed to fetch subrecipes" });
  }
};



/* ---------------- GET COST ---------------- */
export const getSubRecipeCost = async (req, res) => {
  try {
    const { recipeName } = req.params;

    const sub = await SubRecipe.findOne({
      recipeName: { $regex: `^${recipeName}$`, $options: "i" },
    });

    if (!sub) {
      return res.status(404).json({
        message: "SubRecipe not found",
      });
    }

    const totalCost = sub.items.reduce(
      (sum, item) => sum + calculateItemCost(item),
      0
    );

    res.json({
      recipeName: sub.recipeName,
      cost: Number(totalCost.toFixed(2)),
    });

  } catch (err) {
    console.error("SUBRECIPE COST ERROR:", err);
    res.status(500).json({
      message: "Failed to calculate subrecipe cost",
    });
  }
};

/* ---------------- CREATE ---------------- */
export const createSubRecipe = async (req, res) => {
  try {
    const { brand, recipeName, items } = req.body;

    if (!brand || !recipeName || !Array.isArray(items)) {
      return res.status(400).json({
        message: "Invalid sub recipe payload",
      });
    }

    const subRecipe = await SubRecipe.create({
      brand,
      recipeName,
      items,
    });

    res.status(201).json({
      message: "Sub recipe saved successfully",
      data: subRecipe,
    });

  } catch (error) {
    console.error("SUB RECIPE SAVE ERROR:", error);
    res.status(500).json({
      message: "Failed to save sub recipe",
    });
  }
};
