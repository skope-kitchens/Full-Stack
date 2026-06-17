import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  createPurchaseEntry,
  listPurchaseRegisterByBrand,
  correctPurchaseEntry,
  cancelPurchaseEntry,
} from "../controllers/purchaseRegister.controller.js";

const router = express.Router();

// Ingredient Admin -> record a new purchase batch
router.post("/", authMiddleware, requireRole("INGREDIENT_MANAGER"), createPurchaseEntry);

// Ingredient Admin -> view a brand's purchase register stock (FEFO order)
router.get("/:brandName", authMiddleware, requireRole("INGREDIENT_MANAGER"), listPurchaseRegisterByBrand);

// Ingredient Admin -> audit-safe correction of remaining qty
router.patch("/:id/correct", authMiddleware, requireRole("INGREDIENT_MANAGER"), correctPurchaseEntry);

// Ingredient Admin -> cancel an untouched batch
router.patch("/:id/cancel", authMiddleware, requireRole("INGREDIENT_MANAGER"), cancelPurchaseEntry);

export default router;