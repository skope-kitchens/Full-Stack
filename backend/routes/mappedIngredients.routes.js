import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  getMappedIngredients,
  upsertMappedIngredients,
} from "../controllers/mappedIngredients.controller.js";

const router = express.Router();

router.post("/", authMiddleware, requireRole("RECIPE_MANAGER"), upsertMappedIngredients);
router.get("/:recipeId", authMiddleware, requireRole("RECIPE_MANAGER"), getMappedIngredients);

export default router;

