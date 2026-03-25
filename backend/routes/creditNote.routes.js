import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  createCreditNoteAlert,
  deleteCreditNoteAlert,
  listCreditNoteAlerts,
} from "../controllers/creditNote.controller.js";

const router = express.Router();

// Recipe Admin creates alerts
router.post("/", authMiddleware, requireRole("RECIPE_MANAGER"), createCreditNoteAlert);

// Ingredient Admin (and Recipe Admin) can view
router.get("/", authMiddleware, requireRole("INGREDIENT_MANAGER", "RECIPE_MANAGER"), listCreditNoteAlerts);

// Ingredient Admin can delete after action taken
router.delete("/:id", authMiddleware, requireRole("INGREDIENT_MANAGER"), deleteCreditNoteAlert);

export default router;

