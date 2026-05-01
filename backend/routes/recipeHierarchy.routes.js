import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import TrialRecipe from "../models/trialRecipe.models.js";
import TrainingRecipe from "../models/trainingRecipe.models.js";

const router = express.Router();

// Dropdown source for Add Training Recipe (must come from Trial recipes)
router.get(
  "/recipe-hierarchy/trial-names",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  async (req, res) => {
    try {
      const names = await TrialRecipe.distinct("recipeName", {
        recipeName: { $exists: true, $ne: "" },
      });
      const list = (names || [])
        .map((n) => String(n).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return res.json({ success: true, data: list });
    } catch (err) {
      console.error("Failed to load trial names", err);
      return res.status(500).json({ message: "Failed to load trial recipe names" });
    }
  }
);

// Dropdown source for Add Recipe (must come from Training recipes)
router.get(
  "/recipe-hierarchy/training-names",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  async (req, res) => {
    try {
      const names = await TrainingRecipe.distinct("recipeName", {
        recipeName: { $exists: true, $ne: "" },
      });
      const list = (names || [])
        .map((n) => String(n).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return res.json({ success: true, data: list });
    } catch (err) {
      console.error("Failed to load training names", err);
      return res.status(500).json({ message: "Failed to load training recipe names" });
    }
  }
);

export default router;

