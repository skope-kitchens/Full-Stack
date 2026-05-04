import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  upsertStockUpdate,
  listStockUpdatesByBrand,
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

export default router;
