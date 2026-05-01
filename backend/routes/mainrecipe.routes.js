import express from "express";
import {
  createMainRecipe,
  getDishList,
  getRecipeByName
} from "../controllers/mainrecipe.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";

const router = express.Router();

// Creating recipes is restricted to RECIPE_MANAGER admins
router.post("/", authMiddleware, requireRole("RECIPE_MANAGER"), createMainRecipe);

// Reading recipes remains available to authenticated application users
router.get("/dish-list", authMiddleware, getDishList);
router.get("/recipe/:recipeName", authMiddleware, getRecipeByName);

export default router;
