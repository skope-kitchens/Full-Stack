import mongoose from "mongoose";
import User from "../models/user.js";
import MenuEntry from "../models/menuEntry.js";
import BrandServiceChecklist from "../models/brandServiceChecklist.js";
import StockUpdate from "../models/stockUpdate.js";
import ProducerAudit from "../models/producerAudit.js";
import ProductionOrder from "../models/productionOrder.js";
import DeliveryQc from "../models/deliveryQc.js";
import cloudinary from "../config/cloudinary.js";
import { computeBrandSalesSummary } from "../utils/salesSummary.js";
import { computeBrandFcrSummary } from "./costing.controller.js";
import { getDishIterations as fetchDishIterations } from "../utils/iterationFcr.js";
import FcrConfirmation from "../models/fcrConfirmation.js";
import { verifyRazorpaySignature } from "../utils/razorpay.js";
import { recomputeGrnVisibilityForInvoice } from "../utils/grnVisibility.js";
import { sendEmail, invoicePaidEmailHtml } from "../services/email.service.js";

/* ============================================================
 * Constants
 * ========================================================== */

// Human-friendly names for the branch codes a client can be assigned.
const BRANCH_DISPLAY = {
  JPNAGAR: "Main Kitchen",
  TESTBRANCH: "Test Branch",
  MARATHAHALLI: "Marathahalli",
  KALYANNAGAR: "Kalyan Nagar",
};

// Map a client branch code → Rista branch code (per CLAUDE.md §8).
// Branches with no mapping (e.g. TESTBRANCH) fall back to the brand's own
// configured Rista codes inside the analytics handlers.
const RISTA_BRANCH_MAP = {
  JPNAGAR: "BEN",
  MARATHAHALLI: "MAR",
  KALYANNAGAR: null,
  TESTBRANCH: null,
};

/* ============================================================
 * Helpers
 * ========================================================== */

// Returns the client's assignedBranches as a fresh array from the DB.
async function getAssignedBranches(userId) {
  const u = await User.findById(userId).select("assignedBranches").lean();
  return Array.isArray(u?.assignedBranches) ? u.assignedBranches : [];
}

// Validates that a branchCode belongs to the client. Writes a 403 and returns
// false when it doesn't; returns true when valid.
async function assertBranchAllowed(req, res, branchCode) {
  if (!branchCode) {
    res.status(400).json({ message: "branchCode is required" });
    return false;
  }
  const allowed = await getAssignedBranches(req.user._id);
  if (!allowed.includes(branchCode)) {
    res.status(403).json({ message: "Branch not assigned to your account" });
    return false;
  }
  return true;
}

function requireClient(req, res) {
  if (req.user?.role !== "client") {
    res.status(403).json({ message: "Client access only" });
    return false;
  }
  return true;
}

/* ============================================================
 * 1. Profile + logo
 * ========================================================== */

export async function getProfile(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const user = await User.findById(req.user._id)
      .select("name brandName email phoneNumber logoUrl assignedBranches lifecycleStage wallet")
      .lean();

    if (!user) return res.status(404).json({ message: "Account not found" });

    return res.json({
      brandName: user.brandName || "",
      company: user.name || "",
      email: user.email || "",
      mobile: user.phoneNumber || "",
      logoUrl: user.logoUrl || "",
      walletBalance: Number(user.wallet?.balance || 0),
      dueAmount: Number(user.wallet?.dueAmount || 0),
      assignedBranches: user.assignedBranches || [],
      lifecycleStage: user.lifecycleStage || "AWAITING_MENU",
    });
  } catch (err) {
    console.error("getProfile error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load profile" });
  }
}

export async function updateLogo(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const { logoUrl } = req.body || {};
    if (!logoUrl || !String(logoUrl).trim()) {
      return res.status(400).json({ message: "logoUrl is required" });
    }

    // If a base64 / remote image is sent, push it through Cloudinary; if an
    // already-hosted Cloudinary URL is sent, store it as-is.
    let finalUrl = String(logoUrl).trim();
    const isHosted = /^https?:\/\//i.test(finalUrl) && finalUrl.includes("res.cloudinary.com");
    if (!isHosted) {
      try {
        const uploaded = await cloudinary.uploader.upload(finalUrl, {
          folder: "skope/brand-logos",
        });
        finalUrl = uploaded.secure_url;
      } catch (uploadErr) {
        console.error("Logo upload failed:", uploadErr?.message || uploadErr);
        return res.status(400).json({ message: "Logo upload failed" });
      }
    }

    await User.findByIdAndUpdate(req.user._id, { $set: { logoUrl: finalUrl } });
    return res.json({ logoUrl: finalUrl });
  } catch (err) {
    console.error("updateLogo error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update logo" });
  }
}

/* ============================================================
 * 2. Assigned branches
 * ========================================================== */

export async function getBranches(req, res) {
  try {
    if (!requireClient(req, res)) return;
    const branches = await getAssignedBranches(req.user._id);
    return res.json(
      branches.map((code) => ({
        branchCode: code,
        displayName: BRANCH_DISPLAY[code] || code,
      }))
    );
  } catch (err) {
    console.error("getBranches error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load branches" });
  }
}

/* ============================================================
 * 3. Service Onboarding Status (read-only)
 * Reuses BrandServiceChecklist — single source of truth.
 * ========================================================== */

export async function getOnboardingStatus(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const user = await User.findById(req.user._id).select("lifecycleStage").lean();
    const checklist = await BrandServiceChecklist.findOne({ brandId: req.user._id }).lean();

    const tasks = (checklist?.services || []).map((s) => ({
      taskName: s.name,
      status: s.completed ? "COMPLETED" : "PENDING",
    }));

    return res.json({
      lifecycleStage: user?.lifecycleStage || "AWAITING_MENU",
      tasks,
    });
  } catch (err) {
    console.error("getOnboardingStatus error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load onboarding status" });
  }
}

/* ============================================================
 * 4b. Menu — read back the client's own submitted menu (branch-scoped).
 * Submission itself reuses POST /api/menu-entries.
 * ========================================================== */

export async function getMenu(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const { branchCode } = req.query || {};
    const q = { clientId: req.user._id };
    if (branchCode) {
      if (!(await assertBranchAllowed(req, res, branchCode))) return;
      q.branchCode = branchCode;
    }

    const list = await MenuEntry.find(q).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("getMenu error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load menu" });
  }
}

/* ============================================================
 * 6. Daily Stock (read-only) — brand-wide (stock_updates is not branch-scoped)
 * ========================================================== */

export async function getDailyStock(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const { date } = req.query || {};
    const q = { brandId: req.user._id };

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "date must be YYYY-MM-DD" });
      }
      q.date = new Date(`${date}T00:00:00.000Z`);
    }

    const list = await StockUpdate.find(q).sort({ date: -1 }).lean();

    const data = (list || []).map((d) => ({
      _id: d._id,
      date: new Date(d.date).toISOString().slice(0, 10),
      items: d.items || [],
    }));

    return res.json({ success: true, brandWide: true, data });
  } catch (err) {
    console.error("getDailyStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load daily stock" });
  }
}

/* ============================================================
 * 7. Food Cost / FCR (read-only) — brand-wide (recipes are brand-scoped)
 * Mirrors costing.controller getSummary, scoped to the client's brand.
 * ========================================================== */

export async function getFcr(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const summary = await computeBrandFcrSummary(req.user.brandName);

    return res.json({ success: true, brandWide: true, summary });
  } catch (err) {
    console.error("getFcr error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load FCR" });
  }
}

// Per-dish iteration timeline (T1→T2→T3→TR1→TR2→TR3→Final), each independently
// costed. Only POC-CONFIRMED iterations are returned here — unconfirmed price
// entries never reach the client. Brand-wide (no branch scoping on recipes).
export async function getDishIterations(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const brandName = req.user.brandName;
    const dishes = await fetchDishIterations(brandName);

    const confirmations = await FcrConfirmation.find({ brandName, confirmed: true }).lean();
    const confirmedSet = new Set(
      confirmations.map((c) => `${c.recipeName.trim().toLowerCase()}||${c.phase}||${c.code || ""}`)
    );

    const data = dishes.map((dish) => {
      const iterations = dish.iterations.filter((it) =>
        confirmedSet.has(`${dish.recipeName.trim().toLowerCase()}||${it.phase}||${it.code || ""}`)
      );
      return { recipeName: dish.recipeName, iterations };
    });

    return res.json({ success: true, brandWide: true, dishes: data });
  } catch (err) {
    console.error("getDishIterations error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load FCR iterations" });
  }
}

/* ============================================================
 * 8 + 9. Analytics — Rista-backed, LIVE only
 * ========================================================== */

async function resolveRistaBranches(branchCode, brandName) {
  const mapped = RISTA_BRANCH_MAP[branchCode];
  if (mapped) return [mapped];
  // No explicit mapping (e.g. TESTBRANCH): fall back to the brand's own codes
  // so the call still returns whatever Rista has for the brand.
  return undefined; // computeBrandSalesSummary will use the brand's configured codes
}

function summaryToKpis(s) {
  if (!s || s.noData) {
    return {
      noData: true,
      totalOrders: 0,
      totalRevenue: 0,
      netRevenue: 0,
      totalTaxes: 0,
      totalDiscounts: 0,
      avgOrderValue: 0,
      avgItemSellingPrice: 0,
    };
  }
  return {
    noData: false,
    totalOrders: s.noOfSales || 0,
    totalRevenue: s.revenue || 0,
    netRevenue: s.netAmount || 0,
    totalTaxes: s.taxTotal || 0,
    totalDiscounts: s.discountTotal || 0,
    avgOrderValue: s.avgSaleAmount || 0,
    avgItemSellingPrice: s.avgItemSellingPrice || 0,
  };
}

export async function getDailyAnalytics(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const freshUser = await User.findById(req.user._id).select("brandName lifecycleStage").lean();
    if (freshUser?.lifecycleStage !== "LIVE") {
      return res.status(403).json({ message: "Analytics unlock once your brand is live" });
    }

    const { branchCode, date } = req.query || {};
    if (!(await assertBranchAllowed(req, res, branchCode))) return;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "date is required in YYYY-MM-DD format" });
    }

    const branches = await resolveRistaBranches(branchCode, freshUser.brandName);
    const summary = await computeBrandSalesSummary({
      brandName: freshUser.brandName,
      day: date,
      branches,
    });

    return res.json(summaryToKpis(summary));
  } catch (err) {
    console.error("getDailyAnalytics error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load analytics" });
  }
}

export async function getRangeAnalytics(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const freshUser = await User.findById(req.user._id).select("brandName lifecycleStage").lean();
    if (freshUser?.lifecycleStage !== "LIVE") {
      return res.status(403).json({ message: "Analytics unlock once your brand is live" });
    }

    const { branchCode, startDate, endDate } = req.query || {};
    if (!(await assertBranchAllowed(req, res, branchCode))) return;
    if (
      !startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
      return res.status(400).json({ message: "startDate and endDate are required (YYYY-MM-DD)" });
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (start > end) {
      return res.status(400).json({ message: "startDate must be before endDate" });
    }

    const branches = await resolveRistaBranches(branchCode, freshUser.brandName);

    const agg = {
      totalOrders: 0,
      totalRevenue: 0,
      netRevenue: 0,
      totalTaxes: 0,
      totalDiscounts: 0,
    };
    let totalItemQty = 0;
    let totalItemNet = 0;

    const cursor = new Date(start);
    while (cursor <= end) {
      const day = cursor.toISOString().slice(0, 10);
      try {
        const s = await computeBrandSalesSummary({
          brandName: freshUser.brandName,
          day,
          branches,
        });
        if (s && !s.noData) {
          agg.totalOrders += Number(s.noOfSales || 0);
          agg.totalRevenue += Number(s.revenue || 0);
          agg.netRevenue += Number(s.netAmount || 0);
          agg.totalTaxes += Number(s.taxTotal || 0);
          agg.totalDiscounts += Number(s.discountTotal || 0);
          (s.items || []).forEach((i) => {
            totalItemQty += Number(i.quantity || 0);
            totalItemNet += Number(i.netAmount || 0);
          });
        }
      } catch {
        // skip a failed day silently — matches existing range behaviour
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return res.json({
      noData: agg.totalOrders === 0 && agg.totalRevenue === 0,
      totalOrders: agg.totalOrders,
      totalRevenue: agg.totalRevenue,
      netRevenue: agg.netRevenue,
      totalTaxes: agg.totalTaxes,
      totalDiscounts: agg.totalDiscounts,
      avgOrderValue: agg.totalOrders
        ? Number((agg.totalRevenue / agg.totalOrders).toFixed(2))
        : 0,
      avgItemSellingPrice: totalItemQty
        ? Number((totalItemNet / totalItemQty).toFixed(2))
        : 0,
    });
  } catch (err) {
    console.error("getRangeAnalytics error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load analytics" });
  }
}

/* ============================================================
 * 11. Invoices & billing
 * Merges POC-created invoices (User.invoices) + PRODUCTION invoices
 * (ProductionOrder). PRODUCTION invoices are read-only here and paid
 * via the existing /api/production-orders/:id/pay route.
 * ========================================================== */

export async function getInvoices(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const { branchCode } = req.query || {};
    // branchCode is optional for invoices; if provided it must be assigned.
    if (branchCode) {
      const allowed = await getAssignedBranches(req.user._id);
      if (!allowed.includes(branchCode)) {
        return res.status(403).json({ message: "Branch not assigned to your account" });
      }
    }

    const user = await User.findById(req.user._id).select("invoices").lean();

    let manual = (user?.invoices || []).map((inv) => ({
      id: String(inv._id),
      source: "MANUAL",
      type: inv.type,
      amount: Number(inv.amount || 0),
      commission: Number(inv.commission || 0),
      total: Number(inv.amount || 0) + Number(inv.commission || 0),
      status: inv.status,
      branchCode: inv.branchCode || "",
      notes: inv.notes || "",
      attachmentUrl: inv.attachmentUrl || null,
      attachmentName: inv.attachmentName || null,
      razorpayOrderId: inv.razorpayOrderId || null,
      paidVia: inv.paidVia || null,
      paidAt: inv.paidAt || null,
      parentInvoiceId: inv.parentInvoiceId ? String(inv.parentInvoiceId) : null,
      supplementaryReason: inv.supplementaryReason || "",
      createdAt: inv.createdAt,
    }));

    // Production invoices (only those that actually carry a cost).
    const prodOrders = await ProductionOrder.find({
      brandId: req.user._id,
      "financials.totalIngredientCost": { $gt: 0 },
    })
      .select("financials createdAt branchCode")
      .sort({ createdAt: -1 })
      .lean();

    let production = prodOrders.map((po) => ({
      id: String(po._id),
      source: "PRODUCTION_ORDER",
      type: "PRODUCTION",
      amount: Number(po.financials?.totalIngredientCost || 0),
      commission: 0,
      total: Number(po.financials?.totalIngredientCost || 0),
      status: po.financials?.paymentStatus === "PAID" ? "PAID" : "UNPAID",
      branchCode: po.branchCode || "",
      paidVia: po.financials?.paidVia || null,
      paidAt: po.financials?.paidAt || null,
      createdAt: po.createdAt,
    }));

    if (branchCode) {
      manual = manual.filter((i) => !i.branchCode || i.branchCode === branchCode);
      production = production.filter((i) => !i.branchCode || i.branchCode === branchCode);
    }

    const all = [...manual, ...production].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.json(all);
  } catch (err) {
    console.error("getInvoices error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load invoices" });
  }
}

// Recipient for the "invoice paid" notification. PROCUREMENT → Store Manager;
// everything else → POC. Both are env-configured and OPTIONAL — when unset the
// notification simply no-ops (never throws, never blocks payment).
function raiserEmailFor(invoiceType) {
  if (invoiceType === "PROCUREMENT") return process.env.PROCUREMENT_NOTIFY_EMAIL || "";
  return process.env.POC_NOTIFY_EMAIL || "";
}

/**
 * POST /api/client/invoices/:invoiceId/pay-direct
 * Returns the Razorpay order (created at raise time) + amount/commission so the
 * frontend can launch checkout. NO wallet. PRODUCTION invoices are paid via the
 * production-order route.
 */
export async function payInvoiceDirect(req, res) {
  try {
    if (!requireClient(req, res)) return;
    const { invoiceId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }

    const user = await User.findById(req.user._id).select("invoices").lean();
    const invoice = (user?.invoices || []).find((inv) => String(inv._id) === String(invoiceId));
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (invoice.type === "PRODUCTION") {
      return res.status(400).json({ message: "Production invoices are paid from the production order" });
    }
    if (invoice.status === "PAID") return res.status(400).json({ message: "Invoice already paid" });

    const amount = Number(invoice.amount || 0);
    const commission = Number(invoice.commission || 0);
    if (!(amount > 0)) return res.status(400).json({ message: "Invoice has no payable amount" });
    if (!invoice.razorpayOrderId) {
      return res.status(409).json({ message: "No payment order on this invoice — contact Skope" });
    }

    return res.json({
      success: true,
      invoiceId,
      razorpayOrderId: invoice.razorpayOrderId,
      amount,
      commission,
      total: amount + commission,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("payInvoiceDirect error:", err?.message || err);
    return res.status(500).json({ message: "Failed to start payment" });
  }
}

/**
 * POST /api/client/invoices/:invoiceId/verify-payment
 * Verifies the Razorpay signature, flips the invoice to PAID, recomputes any
 * linked GRN's client visibility, and notifies the raiser. NO wallet.
 */
export async function verifyInvoicePayment(req, res) {
  try {
    if (!requireClient(req, res)) return;
    const { invoiceId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }
    if (!verifyRazorpaySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature })) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    const user = await User.findById(req.user._id).select("invoices name brandName").lean();
    const invoice = (user?.invoices || []).find((inv) => String(inv._id) === String(invoiceId));
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (invoice.type === "PRODUCTION") {
      return res.status(400).json({ message: "Production invoices are paid from the production order" });
    }
    // The signed order must match the order recorded on this invoice.
    if (invoice.razorpayOrderId && String(invoice.razorpayOrderId) !== String(razorpay_order_id)) {
      return res.status(400).json({ message: "Payment does not match this invoice" });
    }

    // Atomic flip, guarded on still-UNPAID so a double callback can't re-fire.
    const paidAt = new Date();
    const updated = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        invoices: { $elemMatch: { _id: invoice._id, status: "UNPAID" } },
      },
      {
        $set: {
          "invoices.$[inv].status": "PAID",
          "invoices.$[inv].razorpayPaymentId": razorpay_payment_id,
          "invoices.$[inv].paidAt": paidAt,
          "invoices.$[inv].paidVia": "RAZORPAY",
        },
      },
      { new: true, arrayFilters: [{ "inv._id": invoice._id, "inv.status": "UNPAID" }] }
    );

    if (!updated) {
      return res.status(400).json({ message: "Invoice already paid" });
    }

    // If linked to any GRN, re-check whether it can now become client-visible.
    // Idempotent + ordering-independent (shared with the Store Manager path).
    recomputeGrnVisibilityForInvoice(invoice._id).catch(() => {});

    // Notify the raiser — fire-and-forget; missing env recipient = silent no-op.
    const to = raiserEmailFor(invoice.type);
    if (to) {
      sendEmail({
        to,
        subject: `Invoice paid — ${user.brandName}`,
        html: invoicePaidEmailHtml({
          invoiceLabel: `INV-${String(invoice._id).slice(-4).toUpperCase()}`,
          clientName: user.name,
          brandName: user.brandName,
          amount: invoice.amount,
          commission: invoice.commission,
          paidAt,
        }),
      }).catch(() => {});
    }

    const fresh = (updated.invoices || []).find((inv) => String(inv._id) === String(invoiceId));
    return res.json({ success: true, invoice: fresh });
  } catch (err) {
    console.error("verifyInvoicePayment error:", err?.message || err);
    return res.status(500).json({ message: "Failed to verify payment" });
  }
}

/**
 * GET /api/client/grns?procurementInvoiceId=&from=&to=
 * Client's view of GRNs linked to their paid procurement invoices — only those
 * that became visible (clientVisibleAt set). Brand-scoped. No LIVE gate
 * (procurement happens during onboarding too).
 */
export async function getGrns(req, res) {
  try {
    if (!requireClient(req, res)) return;

    const me = await User.findById(req.user._id).select("brandName").lean();
    if (!me?.brandName) return res.json({ success: true, data: [] });

    const { procurementInvoiceId, from, to } = req.query || {};
    const q = {
      brandName: new RegExp(`^${String(me.brandName).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      clientVisibleAt: { $ne: null },
    };
    if (procurementInvoiceId && mongoose.Types.ObjectId.isValid(procurementInvoiceId)) {
      q.linkedInvoiceIds = procurementInvoiceId;
    }
    if (from || to) {
      q.clientVisibleAt = {
        $ne: null,
        ...(from ? { $gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { $lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      };
    }

    const rows = await DeliveryQc.find(q).sort({ clientVisibleAt: -1, createdAt: -1 }).lean();

    // Group rows by GRN (grnGroupId).
    const groups = new Map();
    for (const r of rows) {
      const key = String(r.grnGroupId || r._id);
      if (!groups.has(key)) {
        groups.set(key, {
          grnId: key,
          date: r.clientVisibleAt || r.createdAt,
          linkedInvoiceIds: (r.linkedInvoiceIds || []).map((id) => String(id)),
          items: [],
        });
      }
      groups.get(key).items.push({
        itemName: r.itemName,
        ingredientBrand: r.ingredientBrand || "",
        vendorName: r.vendorName || "",
        receivedQty: Number(r.receivedQty || 0),
        uom: r.uom || "",
        finalUnitPrice: Number(r.pricePerUnit || 0),
        qcStatus: r.qcStatus,
      });
    }

    return res.json({ success: true, data: [...groups.values()] });
  } catch (err) {
    console.error("getGrns error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load GRNs" });
  }
}

/* ============================================================
 * 12. Audit History (read-only, LIVE-gated)
 * Surfaces LOCKED closing-stock audits to the client:
 *   - Warehouse audits   → stock_updates (Store Manager lock/correction)
 *   - Local Kitchen      → producer_audits scope=LOCAL (per branch)
 *   - Base Kitchen       → producer_audits scope=BASE_SEMI_FINISHED (JP Nagar)
 * Reads ONLY locked audits (lockedAt set). Schemas are NOT modified.
 * The existing Daily Stock view (getDailyStock) is untouched and still
 * serves the IN_TRIAL workflow.
 * ========================================================== */

// LIVE gate — re-reads lifecycleStage from the DB, mirroring the analytics gate.
// Returns the fresh user on success, or null after writing a 403.
async function requireLiveClient(req, res) {
  if (!requireClient(req, res)) return null;
  const fresh = await User.findById(req.user._id)
    .select("brandName lifecycleStage")
    .lean();
  if (fresh?.lifecycleStage !== "LIVE") {
    res.status(403).json({ message: "Audit history unlocks once your brand is live" });
    return null;
  }
  return fresh;
}

// Parse from/to (YYYY-MM-DD). Defaults to the last 7 days when omitted.
// Returns { ok, error, from, to } with `to` pushed to end-of-day.
function parseAuditRange(query) {
  const raw = query || {};
  const re = /^\d{4}-\d{2}-\d{2}$/;
  let to;
  if (raw.to) {
    if (!re.test(raw.to)) return { ok: false, error: "to must be YYYY-MM-DD" };
    to = new Date(`${raw.to}T23:59:59.999Z`);
  } else {
    to = new Date();
  }
  let from;
  if (raw.from) {
    if (!re.test(raw.from)) return { ok: false, error: "from must be YYYY-MM-DD" };
    from = new Date(`${raw.from}T00:00:00.000Z`);
  } else {
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (from > to) return { ok: false, error: "from must be before to" };
  return { ok: true, from, to };
}

// Shared shape for a variance row sent to the client.
function mapVarianceRow(v) {
  return {
    itemName: v.itemName,
    uom: v.uom || "",
    expectedQty: Number(v.expectedQty || 0),
    actualQty: Number(v.actualQty || 0),
    varianceQty: Number(v.varianceQty || 0),
    reason: v.reason || null,
    reasonNote: v.reasonNote || "",
  };
}

export async function getWarehouseAudits(req, res) {
  try {
    const live = await requireLiveClient(req, res);
    if (!live) return;

    const range = parseAuditRange(req.query);
    if (!range.ok) return res.status(400).json({ message: range.error });

    // Locked Store Manager audits only. POC/legacy daily-stock rows never set
    // lockedAt, so this filter cleanly excludes them.
    const docs = await StockUpdate.find({
      brandId: req.user._id,
      lockedAt: { $ne: null },
      date: { $gte: range.from, $lte: range.to },
    })
      .sort({ date: -1, correctionSeq: 1 })
      .lean();

    const data = docs.map((d) => {
      const items = (d.variances || []).map(mapVarianceRow);
      return {
        date: new Date(d.date).toISOString().slice(0, 10),
        lockedAt: d.lockedAt,
        correctionSeq: d.correctionSeq || 0,
        correctionOf: d.correctionOf || null,
        items,
        totalVarianceItems: items.filter((i) => i.varianceQty !== 0).length,
      };
    });

    return res.json({ success: true, brandWide: true, data });
  } catch (err) {
    console.error("getWarehouseAudits error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load warehouse audits" });
  }
}

export async function getLocalKitchenAudits(req, res) {
  try {
    const live = await requireLiveClient(req, res);
    if (!live) return;

    const range = parseAuditRange(req.query);
    if (!range.ok) return res.status(400).json({ message: range.error });

    const { branchCode } = req.query || {};
    const allowed = await getAssignedBranches(req.user._id);
    if (branchCode && !allowed.includes(branchCode)) {
      return res.status(403).json({ message: "Branch not assigned to your account" });
    }

    // Branches to present: the filtered one, else every assigned branch.
    const branches = branchCode ? [branchCode] : allowed;

    const q = {
      brandId: req.user._id,
      scope: "LOCAL",
      lockedAt: { $ne: null },
      date: { $gte: range.from, $lte: range.to },
    };
    if (branchCode) q.branchCode = branchCode;

    const docs = await ProducerAudit.find(q)
      .sort({ date: -1, correctionSeq: 1 })
      .lean();

    // Group locked audits by branchCode.
    const byBranch = new Map();
    for (const d of docs) {
      const code = d.branchCode;
      if (!byBranch.has(code)) byBranch.set(code, []);
      byBranch.get(code).push({
        date: new Date(d.date).toISOString().slice(0, 10),
        lockedAt: d.lockedAt,
        correctionSeq: d.correctionSeq || 0,
        correctionOf: d.correctionOf || null,
        items: (d.variances || []).map(mapVarianceRow),
      });
    }

    // Emit one entry per assigned branch (empty audits[] drives the per-branch
    // empty state). Any audit branch not in assignedBranches still surfaces.
    const codes = new Set([...branches, ...byBranch.keys()]);
    const data = [...codes].map((code) => ({
      branchCode: code,
      branchDisplayName: BRANCH_DISPLAY[code] || code,
      audits: byBranch.get(code) || [],
    }));
    data.sort((a, b) => a.branchDisplayName.localeCompare(b.branchDisplayName));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("getLocalKitchenAudits error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load local kitchen audits" });
  }
}

export async function getBaseKitchenAudits(req, res) {
  try {
    const live = await requireLiveClient(req, res);
    if (!live) return;

    const range = parseAuditRange(req.query);
    if (!range.ok) return res.status(400).json({ message: range.error });

    const docs = await ProducerAudit.find({
      brandId: req.user._id,
      scope: "BASE_SEMI_FINISHED",
      lockedAt: { $ne: null },
      date: { $gte: range.from, $lte: range.to },
    })
      .sort({ date: -1, correctionSeq: 1 })
      .lean();

    const data = docs.map((d) => ({
      date: new Date(d.date).toISOString().slice(0, 10),
      lockedAt: d.lockedAt,
      correctionSeq: d.correctionSeq || 0,
      correctionOf: d.correctionOf || null,
      items: (d.variances || []).map(mapVarianceRow),
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("getBaseKitchenAudits error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load base kitchen audits" });
  }
}
