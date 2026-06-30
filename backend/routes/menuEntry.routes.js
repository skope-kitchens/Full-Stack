import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  createMenuEntry,
  listMenuEntriesForBrand,
  deleteMenuEntry,
  editMenuItem,
  softDeleteMenuItem,
} from "../controllers/menuEntry.controller.js";

const router = express.Router();

// Client creates menu entry
router.post("/menu-entries", authMiddleware, createMenuEntry);

// Client edits one menu item (recipeName/qty/uom/cost only). Brand-ownership +
// recipe-brand checks live in the controller. (BUG-001)
router.put("/menu-items/:entryId/items/:itemId", authMiddleware, editMenuItem);

// Client soft-deletes one menu item (sets isDeleted: true; subdoc retained).
router.delete("/menu-items/:entryId/items/:itemId", authMiddleware, softDeleteMenuItem);

// Recipe admin views menu entries for a brand
router.get(
  "/admin/menu-entries/:brandId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  listMenuEntriesForBrand
);

// Recipe admin deletes a menu entry
router.delete(
  "/admin/menu-entries/:entryId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  deleteMenuEntry
);

export default router;