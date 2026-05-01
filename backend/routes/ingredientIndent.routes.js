import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  createIndent,
  issueIndentItem,
  listIndent,
  verifyIndentItem,
  deleteIndentItem,
} from "../controllers/ingredientIndent.controller.js";

const router = express.Router();

// Recipe Admin -> send items to Ingredient Admin (Indent)
router.post("/", authMiddleware, requireRole("RECIPE_MANAGER"), createIndent);

// Ingredient Admin -> view/verify/issue
router.get("/", authMiddleware, requireRole("INGREDIENT_MANAGER", "RECIPE_MANAGER"), listIndent);
router.patch("/:id/verify", authMiddleware, requireRole("INGREDIENT_MANAGER"), verifyIndentItem);
router.patch("/:id/issue", authMiddleware, requireRole("INGREDIENT_MANAGER"), issueIndentItem);
router.delete("/:id", authMiddleware, requireRole("INGREDIENT_MANAGER"), deleteIndentItem);

export default router;

