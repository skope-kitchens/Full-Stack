import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import {
  reviewAndAdvanceToPayment,
  executeBrandProductionPayment,
  getMyPendingProductionOrders,
  getReadyForDispatchOrders,
  dispatchWarehouseIngredients,
  getProductionOrderStatus,
  completeBatchPreparation,
  getActiveProductionOrders,
  markPreparationStarted,
} from "../controllers/productionOrder.controller.js";

const router = express.Router();

// Client — fetch their own orders awaiting payment (literal route before /:id)
router.get("/my-pending", authMiddleware, getMyPendingProductionOrders);

// INGREDIENT_MANAGER — fetch all orders ready for warehouse dispatch
router.get(
  "/ready-for-dispatch",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  getReadyForDispatchOrders
);

// RECIPE_MANAGER — fetch all orders the chef is actively working on (READY_FOR_DISPATCH + IN_PREPARATION)
router.get(
  "/active",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getActiveProductionOrders
);

// RECIPE_MANAGER — chef acknowledges receipt of ingredients and starts cooking
router.patch(
  "/:id/mark-started",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  markPreparationStarted
);

// WALLET_MANAGER — advance indent review → awaiting brand payment
router.patch(
  "/:id/request-payment",
  authMiddleware,
  requireRole("WALLET_MANAGER"),
  reviewAndAdvanceToPayment
);

// INGREDIENT_MANAGER — deduct warehouse stock and advance order → IN_PREPARATION
router.patch(
  "/:id/dispatch",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  dispatchWarehouseIngredients
);

// Client — pay the production invoice (atomic wallet deduction)
router.post("/:id/pay", authMiddleware, executeBrandProductionPayment);

// Auth only — lightweight status poll for the chef waiting for IN_PREPARATION
router.get("/:id/status", authMiddleware, getProductionOrderStatus);

// RECIPE_MANAGER — complete batch, upsert fridge stock, flip both docs to COMPLETED
router.patch(
  "/:id/complete",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  completeBatchPreparation
);

export default router;
