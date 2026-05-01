import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import { createMenuEntry, listMenuEntriesForBrand } from "../controllers/menuEntry.controller.js";

const router = express.Router();

// Client creates menu entry
router.post("/menu-entries", authMiddleware, createMenuEntry);

// Recipe admin views menu entries for a brand
router.get(
  "/admin/menu-entries/:brandId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  listMenuEntriesForBrand
);

export default router;

