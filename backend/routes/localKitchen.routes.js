/**
 * localKitchen.routes.js — Local Kitchen dashboard API, mounted /api/local-kitchen.
 * Every route is gated requireRole("LOCAL_KITCHEN"); every handler is branch-scoped
 * to req.user.branchCode (from the JWT). A kitchen only ever sees its own data.
 */
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  getBrands,
  getDispatches,
  acknowledgeDispatch,
  getStock,
  getAudit,
  postAudit,
  lockAudit,
  postIndent,
  getIndents,
  getRecipes,
  getMenu,
  getProjections,
  getFcr,
  getRecipesForOrders,
  postOrder,
  getOrders,
  deleteOrder,
} from "../controllers/localKitchen.controller.js";

const router = express.Router();
const guard = [authMiddleware, requireRole("LOCAL_KITCHEN")];

// 1. Brand list (assigned to this kitchen)
router.get("/brands", ...guard, getBrands);

// 2. Incoming dispatches
router.get("/dispatches", ...guard, getDispatches);
router.patch("/dispatches/:id/acknowledge", ...guard, acknowledgeDispatch);

// 3. Local stock
router.get("/stock/:brandName", ...guard, getStock);

// 4. Daily closing-stock audit
router.get("/audit/:brandName", ...guard, getAudit);
router.post("/audit/:brandName", ...guard, postAudit);
router.patch("/audit/:brandName/lock", ...guard, lockAudit);

// 5. Request replenishment
router.post("/indent", ...guard, postIndent);
router.get("/indents", ...guard, getIndents);

// 6. Manual Order Entry (CLAUDE.md §25)
router.get("/recipes-for-orders", ...guard, getRecipesForOrders);
router.post("/orders", ...guard, postOrder);
router.get("/orders", ...guard, getOrders);
router.delete("/orders/:orderId", ...guard, deleteOrder);

// 7. Read-only views
router.get("/recipes/:brandName", ...guard, getRecipes);
router.get("/menu/:brandName", ...guard, getMenu);
router.get("/projections/:brandName", ...guard, getProjections);
router.get("/fcr/:brandName", ...guard, getFcr);

export default router;
