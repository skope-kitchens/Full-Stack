import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import { uploadInvoiceAttachment } from "../middleware/uploadInvoiceAttachment.js";
import {
  getBrandsSummary,
  getAllBrandsRollup,
  getBrandStock,
  getBrandStockExpiring,
  getBrandStockLow,
  getBrandIndents,
  logIndentEvent,
  postGrn,
  postInvoiceAttachment,
  postProcurementInvoice,
  updateGrnReceived,
  getProcurementInvoices,
  getQcFailures,
  getVendorAlerts,
  resolveVendorAlert,
  getPurchasesLog,
  getClosingStock,
  postClosingStock,
  lockClosingStock,
  postClosingStockCorrection,
  getReorderInsights,
  patchIngredientThresholds,
  listVendors,
  getVendorDetail,
  createVendor,
  updateVendor,
  setVendorStatus,
} from "../controllers/stockManager.controller.js";

const router = express.Router();

// Every Stock Manager route is gated to the INGREDIENT_MANAGER role (the base
// kitchen warehouse owner). authMiddleware already scopes warehouseId/branchCodes
// onto req.user from the JWT.
const guard = [authMiddleware, requireRole("INGREDIENT_MANAGER")];

// 1. Brand picker / home
router.get("/brands-summary", ...guard, getBrandsSummary);
router.get("/all-brands-rollup", ...guard, getAllBrandsRollup);

// 2. Stock Overview (per brand)
router.get("/stock/:brandName/expiring", ...guard, getBrandStockExpiring);
router.get("/stock/:brandName/low", ...guard, getBrandStockLow);
router.get("/stock/:brandName", ...guard, getBrandStock);

// 3. Indents (incoming) — list only; verify/issue reuse /api/ingredient-indent.
router.get("/indents/:brandName", ...guard, getBrandIndents);
router.post("/indents/log", ...guard, logIndentEvent);

// 4. GRN + Delivery QC
router.post("/grn", ...guard, postGrn);
router.patch("/grn/:grnId/update-received", ...guard, updateGrnReceived);
router.get("/qc-failures", ...guard, getQcFailures);

// 4c. Procurement invoicing (wallet-free, Razorpay-direct) + supplementary
router.post("/invoice-attachment", ...guard, uploadInvoiceAttachment, postInvoiceAttachment);
router.post("/invoice", ...guard, postProcurementInvoice);
router.get("/invoices", ...guard, getProcurementInvoices);

// 4b. Vendor Alerts (renamed "Credit Note" — operational, no money)
router.get("/vendor-alerts/:brandName", ...guard, getVendorAlerts);
router.delete("/vendor-alerts/:id", ...guard, resolveVendorAlert);

// 5. Purchases log
router.get("/purchases", ...guard, getPurchasesLog);

// 6. Closing Stock Audit
router.get("/closing-stock/:brandName", ...guard, getClosingStock);
router.post("/closing-stock/:brandName", ...guard, postClosingStock);
router.patch("/closing-stock/:brandName/lock", ...guard, lockClosingStock);
router.post("/closing-stock/:brandName/correction", ...guard, postClosingStockCorrection);

// 7. Reorder Insights (derived)
router.get("/reorder-insights/:brandName", ...guard, getReorderInsights);

// 8. Ingredient master thresholds
router.patch("/ingredient/:itemName", ...guard, patchIngredientThresholds);

// 9. Vendor management (global)
router.get("/vendors", ...guard, listVendors);
router.get("/vendors/:id", ...guard, getVendorDetail);
router.post("/vendors", ...guard, createVendor);
router.patch("/vendors/:id/status", ...guard, setVendorStatus);
router.patch("/vendors/:id", ...guard, updateVendor);

export default router;
