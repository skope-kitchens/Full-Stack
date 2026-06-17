import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  listBrandStock,
  listAllBrandStock,
  transferBrandStock,
  deleteBrandStockItem,
  markBrandStockUsed,
  archiveBrandStockItem,
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
  requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"),
  markBrandStockUsed
);

// ARCHIVE — soft delete. RECIPE_MANAGER is scoped to their own branch's kitchen
// stock and may only archive items with qtyRemaining === 0 (enforced in controller).
router.patch(
  "/brand-stock/:id/archive",
  authMiddleware,
  requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"),
  archiveBrandStockItem
);

// RECONCILE — both roles (qty correction, not destructive; RECIPE_MANAGER needs this in RecipeInventoryModal)
router.patch(
  "/brand-stock/:id/reconcile",
  authMiddleware,
  requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"),
  reconcileStock
);

export default router;

