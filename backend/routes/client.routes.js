import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { uploadLogo } from "../middleware/uploadLogo.js";
import {
  getProfile,
  updateLogo,
  uploadLogoFile,
  getBranches,
  getOnboardingStatus,
  getSopDocuments,
  getMenu,
  getDailyStock,
  getFcr,
  getDishIterations,
  getDailyAnalytics,
  getRangeAnalytics,
  getInvoices,
  payInvoiceDirect,
  verifyInvoicePayment,
  getGrns,
  getWarehouseAudits,
  getLocalKitchenAudits,
  getBaseKitchenAudits,
} from "../controllers/client.controller.js";

const router = express.Router();

// 1. Profile + logo
router.get("/profile", authMiddleware, getProfile);
router.patch("/logo", authMiddleware, updateLogo);
// Logo file upload → Cloudinary "client-logos", returns { logoUrl }.
// Frontend then PATCHes /logo with that URL to persist it.
router.post("/logo-upload", authMiddleware, uploadLogo, uploadLogoFile);

// 2. Assigned branches
router.get("/branches", authMiddleware, getBranches);

// 3. Service onboarding status (read-only)
router.get("/onboarding-status", authMiddleware, getOnboardingStatus);

// 3b. SOP documents (read-only, no lifecycle gate — POC enters, client reads)
router.get("/sop", authMiddleware, getSopDocuments);

// 4. Menu read-back (branch-scoped). Submission reuses POST /api/menu-entries.
router.get("/menu", authMiddleware, getMenu);

// 6. Daily stock (read-only, brand-wide)
router.get("/daily-stock", authMiddleware, getDailyStock);

// 7. Food cost / FCR (read-only, brand-wide)
router.get("/fcr", authMiddleware, getFcr);
router.get("/fcr/dishes", authMiddleware, getDishIterations);

// 8 + 9. Analytics (Rista-backed, LIVE only)
router.get("/analytics/daily", authMiddleware, getDailyAnalytics);
router.get("/analytics/range", authMiddleware, getRangeAnalytics);

// 11. Invoices — wallet-free, Razorpay-direct (CLAUDE.md §24)
router.get("/invoices", authMiddleware, getInvoices);
router.post("/invoices/:invoiceId/pay-direct", authMiddleware, payInvoiceDirect);
router.post("/invoices/:invoiceId/verify-payment", authMiddleware, verifyInvoicePayment);

// 11b. Goods Received Notes (read-only, brand-scoped)
router.get("/grns", authMiddleware, getGrns);

// 12. Audit History (read-only, LIVE-gated)
router.get("/audits/warehouse", authMiddleware, getWarehouseAudits);
router.get("/audits/local-kitchen", authMiddleware, getLocalKitchenAudits);
router.get("/audits/base-kitchen", authMiddleware, getBaseKitchenAudits);

export default router;
