import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  createTrialRecipe,
  createTrainingRecipe,
  listTrialRecipes,
  listTrainingRecipes,
  getTrialRecipeById,
  updateTrialRecipe,
  getTrainingRecipeById,
  updateTrainingRecipe,
  deleteTrialRecipe,
  deleteTrainingRecipe,
} from "../controllers/trialTrainingRecipes.controller.js";

const router = express.Router();

router.post("/trial-recipes", authMiddleware, requireRole("RECIPE_MANAGER"), createTrialRecipe);
router.post("/training-recipes", authMiddleware, requireRole("RECIPE_MANAGER"), createTrainingRecipe);
router.get("/trial-recipes", authMiddleware, requireRole("RECIPE_MANAGER"), listTrialRecipes);
router.get("/training-recipes", authMiddleware, requireRole("RECIPE_MANAGER"), listTrainingRecipes);
router.get("/trial-recipes/:id", authMiddleware, requireRole("RECIPE_MANAGER"), getTrialRecipeById);
router.put("/trial-recipes/:id", authMiddleware, requireRole("RECIPE_MANAGER"), updateTrialRecipe);
router.delete("/trial-recipes/:id", authMiddleware, requireRole("RECIPE_MANAGER"), deleteTrialRecipe);
router.get("/training-recipes/:id", authMiddleware, requireRole("RECIPE_MANAGER"), getTrainingRecipeById);
router.put("/training-recipes/:id", authMiddleware, requireRole("RECIPE_MANAGER"), updateTrainingRecipe);
router.delete("/training-recipes/:id", authMiddleware, requireRole("RECIPE_MANAGER"), deleteTrainingRecipe);

export default router;

