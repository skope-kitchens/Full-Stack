import express from "express";
import {
  createSubRecipe,
  getSubRecipeDishList,
  getSubRecipes,
  getSubRecipeCost
} from "../controllers/subrecipe.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";

const router = express.Router();

// Creating recipes is restricted to RECIPE_MANAGER admins
router.post("/", authMiddleware, requireRole("RECIPE_MANAGER"), createSubRecipe);

// Reading subrecipes remains available as before
router.get("/", getSubRecipes);
router.get("/dish-list", authMiddleware, getSubRecipeDishList);
router.get("/:recipeName/cost", getSubRecipeCost);

export default router;
