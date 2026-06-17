import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  getFridgeStock,
  submitFridgeAudit,
  listFridgeAudits,
} from "../controllers/fridgeAudit.controller.js";

const router = express.Router();

router.get("/fridge-stock", authMiddleware, requireRole("RECIPE_MANAGER"), getFridgeStock);
router.post("/fridge-audit", authMiddleware, requireRole("RECIPE_MANAGER"), submitFridgeAudit);
router.get("/fridge-audit", authMiddleware, requireRole("RECIPE_MANAGER"), listFridgeAudits);

export default router;