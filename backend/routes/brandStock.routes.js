import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  listBrandStock,
  listAllBrandStock,
  transferBrandStock,
  deleteBrandStockItem,
  markBrandStockUsed,
  reconcileStock,
} from "../controllers/brandStock.controller.js";

const router = express.Router();

// READ — RECIPE_MANAGER and INGREDIENT_MANAGER can both view brand stock
router.get("/brand-stock", authMiddleware, requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"), listBrandStock);
router.get(
  "/brand-stock/all",
  authMiddleware,
  requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"),
  listAllBrandStock
);

// IRREVERSIBLE MUTATIONS — INGREDIENT_MANAGER only
router.post("/brand-stock/transfer", authMiddleware, requireRole("INGREDIENT_MANAGER"), transferBrandStock);
router.delete(
  "/brand-stock/:id",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  deleteBrandStockItem
);
router.patch(
  "/brand-stock/:id/used",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  markBrandStockUsed
);

// RECONCILE — both roles (qty correction, not destructive; RECIPE_MANAGER needs this in RecipeInventoryModal)
router.patch(
  "/brand-stock/:id/reconcile",
  authMiddleware,
  requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"),
  reconcileStock
);

export default router;

