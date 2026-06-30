/**
 * poc.routes.js — POC dashboard API, mounted at /api/poc.
 *
 * Every route is gated by requireRole("POC"). A POC acts across ALL clients
 * (that is the role), but each handler validates the specific clientId exists
 * and that any branchCode is within that client's assignedBranches.
 *
 * No wallet/GST routes live here. Invoices create an UNPAID record + a Razorpay
 * order so the client can pay directly from their dashboard (no wallet). See
 * CLAUDE.md §24.
 */
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import { uploadInvoiceAttachment } from "../middleware/uploadInvoiceAttachment.js";
import {
  postInvoiceAttachment,
  listClients,
  getClientHeader,
  getOnboarding,
  patchOnboardingTask,
  postOnboardingTask,
  deleteOnboardingTask,
  postDailyStock,
  getDailyStock,
  getFcrItems,
  postFcrItem,
  patchFcrConfirm,
  getFcrSummary,
  getProducerData,
  getSop,
  postSop,
  patchBranches,
  postInvoice,
  getInvoices,
  patchProcurementMode,
  postProcurementList,
  getProcurementList,
  patchProcurementListPrices,
  getIngredientLists,
  acknowledgeIngredientList,
  patchIngredientListPrices,
  postRaiseInvoiceFromList,
  getMenu,
  getProjections,
  patchClientType,
  patchGoLive,
} from "../controllers/poc.controller.js";

const router = express.Router();

// Gate the entire router to the POC role.
router.use(authMiddleware, requireRole("POC"));

/* 1. Client list + workspace header */
router.get("/clients", listClients);
router.get("/clients/:clientId", getClientHeader);

/* 2. Onboarding status (writer) — reuses BrandServiceChecklist */
router.get("/clients/:clientId/onboarding", getOnboarding);
router.patch("/clients/:clientId/onboarding-task", patchOnboardingTask);
router.post("/clients/:clientId/onboarding-task", postOnboardingTask);
router.delete("/clients/:clientId/onboarding-task", deleteOnboardingTask);

/* 3. Daily stock (writer) — reuses stock_updates, brand-wide */
router.get("/clients/:clientId/daily-stock", getDailyStock);
router.post("/clients/:clientId/daily-stock", postDailyStock);

/* 4. FCR (brand-scoped + phase-scoped) + summary + future producer data */
router.get("/clients/:clientId/fcr-items", getFcrItems);
router.post("/clients/:clientId/fcr-item", postFcrItem);
router.patch("/clients/:clientId/fcr-confirm", patchFcrConfirm);
router.get("/clients/:clientId/fcr-summary", getFcrSummary);
router.get("/clients/:clientId/producer-data", getProducerData);

/* 5. SOP — links only */
router.get("/clients/:clientId/sop", getSop);
router.post("/clients/:clientId/sop", postSop);

/* 6. Branch assignment */
router.patch("/clients/:clientId/branches", patchBranches);

/* 7. Invoicing — raises an UNPAID record + Razorpay order (client pays via dashboard) */
router.post("/clients/:clientId/invoice-attachment", uploadInvoiceAttachment, postInvoiceAttachment);
router.post("/clients/:clientId/invoice", postInvoice);
router.get("/clients/:clientId/invoices", getInvoices);

/* 8. Procurement mode + ingredient list */
router.patch("/clients/:clientId/procurement-mode", patchProcurementMode);
router.post("/clients/:clientId/procurement-list", postProcurementList);
router.get("/clients/:clientId/procurement-list", getProcurementList);
router.patch("/clients/:clientId/procurement-list/prices", patchProcurementListPrices);

/* 8b. Ingredient lists from the Head Chef (read + acknowledge) */
router.get("/clients/:clientId/ingredient-lists", getIngredientLists);
router.patch("/clients/:clientId/ingredient-lists/:listId/acknowledge", acknowledgeIngredientList);
router.patch("/clients/:clientId/ingredient-lists/:listId/prices", patchIngredientListPrices);
router.post("/clients/:clientId/ingredient-lists/:listId/raise-invoice", postRaiseInvoiceFromList);

/* 9. Menu & projections — view-only */
router.get("/clients/:clientId/menu", getMenu);
router.get("/clients/:clientId/projections", getProjections);

/* 10. Client settings — clientType + go-live */
router.patch("/clients/:clientId/client-type", patchClientType);
router.patch("/clients/:clientId/go-live", patchGoLive);

export default router;
