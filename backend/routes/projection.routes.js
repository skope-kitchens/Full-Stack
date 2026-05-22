import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  createProjection,
  getMyProjections,
  getPendingProjections,
  getNetRequirements,
  convertProjectionToProductionOrder,
} from "../controllers/projection.controller.js";

const router = express.Router();

// Client submits a projection (no wallet deduction at this stage)
router.post("/", authMiddleware, createProjection);

// Client views their own submission history
router.get("/my", authMiddleware, getMyProjections);

// Chef (RECIPE_MANAGER) views all pending projections across brands
router.get(
  "/pending",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getPendingProjections
);

// Chef runs the Net Production Engine for a specific projection
// All /:id routes must be registered AFTER /my and /pending so string literals win
router.get(
  "/:id/net-requirements",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getNetRequirements
);

// Chef confirms the projection and creates a ProductionOrder at PENDING_INDENT_APPROVAL
router.post(
  "/:id/convert",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  convertProjectionToProductionOrder
);

export default router;
