import express from "express";
import {
  getInventoryItems,
  getClientInventory,
} from "../controllers/inventory.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";

const router = express.Router();

// Admin inventory via Rista (ingredient manager only)
router.get(
  "/items",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER", "RECIPE_MANAGER"),
  getInventoryItems
);

// Client-specific kitchen inventory
router.get("/:clientId", authMiddleware, getClientInventory);

export default router;
