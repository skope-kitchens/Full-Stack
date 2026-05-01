import MainRecipe from "../models/mainrecipe.models.js";
import { brandsMatch } from "../utils/brandMatch.js";

export const getDishList = async (req, res) => {
  try {
    const userBrandName = req.user?.brandName;
    
    if (!userBrandName) {
      return res.status(403).json({ 
        message: "Brand not linked to this account" 
      });
    }

    const allRecipes = await MainRecipe.find(
      {},
      { recipeName: 1, brand: 1, _id: 0 }
    )
      .sort({ recipeName: 1 })
      .lean();

    const recipes = allRecipes.filter(r => brandsMatch(userBrandName, r.brand));

    res.json({
      dishes: [...new Set(recipes.map(r => r.recipeName))],
    });
  } catch (err) {
    console.error("GET DISH LIST ERROR:", err);
    res.status(500).json({ message: "Failed to fetch dishes" });
  }
};

export const getRecipeByName = async (req, res) => {
  try {
    const { recipeName } = req.params;
    const userBrandName = req.user?.brandName;
    
    if (!userBrandName) {
      return res.status(403).json({ 
        message: "Brand not linked to this account" 
      });
    }

    const recipes = await MainRecipe.find({ recipeName }).lean();
    const recipe = recipes.find(r => brandsMatch(userBrandName, r.brand));

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    res.json(recipe);
  } catch (err) {
    console.error("GET RECIPE BY NAME ERROR:", err);
    res.status(500).json({ message: "Failed to fetch recipe" });
  }
};

export const createMainRecipe = async (req, res) => {
  try {
    const { brand, recipeName, items, sopLink } = req.body;

    if (!brand || !recipeName || !Array.isArray(items)) {
      return res.status(400).json({
        message: "Invalid main recipe payload",
      });
    }

    const recipe = await MainRecipe.create({
      brand,
      recipeName,
      sopLink: typeof sopLink === "string" ? sopLink.trim() : "",
      items,
    });

    console.log("MAIN RECIPE SAVED:", recipe._id);

    res.status(201).json({
      message: "Main recipe saved successfully",
      data: recipe,
    });

  } catch (error) {
    console.error("DB SAVE ERROR:", error);
    res.status(500).json({
      message: "Failed to save main recipe",
      error: error.message,
    });
  }
};
