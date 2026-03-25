import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import { listRistaStores } from "../controllers/rista.controller.js";

const router = express.Router();

// GET /api/rista/stores
router.get(
  "/stores",
  authMiddleware,
  requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"),
  listRistaStores
);

export default router;

