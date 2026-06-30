/**
 * headChef.routes.js — Head Chef dashboard API, mounted at /api/head-chef.
 * Every route is gated by requireRole("RECIPE_MANAGER") (the Head Chef code role).
 * Recipe/trial/training CRUD is NOT here — it reuses the existing RECIPE_MANAGER
 * routes (/api/mainrecipes, /api/subrecipes, /api/trial-recipes,
 * /api/training-recipes, /api/ingredient-indent).
 */
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import { uploadExcel } from "../middleware/uploadExcel.js";
import {
  getBrandsSummary,
  addIngredient,
  getRecipeImportTemplate,
  postRecipeImportPreview,
  postRecipeImportCommit,
  sendIngredientListToPoc,
  sendCustomIngredientListToPoc,
  promoteToFinal,
  getProductionPlan,
  postDispatch,
  listDispatches,
  listDispatchDiscrepancies,
  listDispatchRequests,
  listIndents,
  postCustomIndent,
  getQcFailures,
  postVendorAlert,
  listVendorAlerts,
  getBaseAudit,
  postBaseAudit,
  lockBaseAudit,
  getReorderInsights,
  getRistaStockComparison,
  getFcr,
  getMenu,
  getProjections,
} from "../controllers/headChef.controller.js";

const router = express.Router();
const guard = [authMiddleware, requireRole("RECIPE_MANAGER")];

// 1. Brand picker / home
router.get("/brands-summary", ...guard, getBrandsSummary);

// 2. Ingredient catalog
router.post("/ingredient", ...guard, addIngredient);

// 3. Ingredient list → POC
router.post("/clients/:clientId/ingredient-list", ...guard, sendIngredientListToPoc);
router.post("/clients/:clientId/ingredient-list-custom", ...guard, sendCustomIngredientListToPoc);

// 4. Promote to Final
router.post("/promote-to-final", ...guard, promoteToFinal);

// 5. Production planning
router.get("/production-plan", ...guard, getProductionPlan);

// 6. Sub-recipe dispatch
router.post("/dispatch", ...guard, postDispatch);
router.get("/dispatches", ...guard, listDispatches);
router.get("/dispatches/discrepancies", ...guard, listDispatchDiscrepancies);
router.get("/requests", ...guard, listDispatchRequests);

// 7. Indents (raise to Stock Manager)
router.get("/indents", ...guard, listIndents);
router.post("/indents/custom", ...guard, postCustomIndent);

// 8. QC failures
router.get("/qc-failures", ...guard, getQcFailures);

// 9. Vendor alerts (raise)
router.post("/vendor-alerts", ...guard, postVendorAlert);
router.get("/vendor-alerts", ...guard, listVendorAlerts);

// 10. Base Kitchen Stock Audit (SEMI_FINISHED)
router.get("/audit/:brandName", ...guard, getBaseAudit);
router.post("/audit/:brandName", ...guard, postBaseAudit);
router.patch("/audit/:brandName/lock", ...guard, lockBaseAudit);

// 11. Reorder insights
router.get("/reorder-insights", ...guard, getReorderInsights);

// 12. Stock (Rista) reconciliation — FUTURE-HOOK
router.get("/rista-stock-comparison", ...guard, getRistaStockComparison);

// 13. FCR + 14. Menu/Projections (read-only)
router.get("/fcr/:brandName", ...guard, getFcr);
router.get("/menu/:brandName", ...guard, getMenu);
router.get("/projections/:brandName", ...guard, getProjections);

// 15. Recipe Import (bulk onboarding via Excel template) — CLAUDE.md §26
router.get("/recipe-import-template", ...guard, getRecipeImportTemplate);
router.post("/recipe-import-preview", ...guard, uploadExcel, postRecipeImportPreview);
router.post("/recipe-import-commit", ...guard, uploadExcel, postRecipeImportCommit);

export default router;
