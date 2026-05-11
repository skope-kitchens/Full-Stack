import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  upsertStockUpdate,
  listStockUpdatesByBrand,
  listAllStockUpdates,
} from "../controllers/stockUpdate.controller.js";

const router = express.Router();

router.post(
  "/stock-updates",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  upsertStockUpdate
);

router.get(
  "/stock-updates",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  listStockUpdatesByBrand
);

router.get(
  "/stock-updates/all",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  listAllStockUpdates
);

export default router;
