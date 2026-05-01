import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  listBrandStock,
  listAllBrandStock,
  transferBrandStock,
  deleteBrandStockItem,
  markBrandStockUsed,
} from "../controllers/brandStock.controller.js";

const router = express.Router();

router.get("/brand-stock", authMiddleware, requireRole("RECIPE_MANAGER"), listBrandStock);
router.get(
  "/brand-stock/all",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  listAllBrandStock
);
router.post("/brand-stock/transfer", authMiddleware, requireRole("RECIPE_MANAGER"), transferBrandStock);
router.delete(
  "/brand-stock/:id",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  deleteBrandStockItem
);

router.patch(
  "/brand-stock/:id/used",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  markBrandStockUsed
);

export default router;

