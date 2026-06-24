/**
 * stockManager.controller.js — Stock Manager dashboard (base kitchen warehouse).
 *
 * The Stock Manager (code role INGREDIENT_MANAGER) runs the central JP Nagar
 * warehouse. They own raw-ingredient procurement, the Purchase Register, the
 * Delivery QC gate, fulfilling indents raised BY the Head Chef, daily closing-
 * stock audits, and vendor management. They do NOT cook, do NOT dispatch finished
 * sub-recipes, and NEVER touch money (frozen).
 *
 * PRODUCER dashboard: every write path appends exactly one procurement_logs entry
 * (the Data Analyst dashboard's primary read source). See emitProcurementLog().
 *
 * Untouched by design: applyStockCascade, expandItem, bomExpander, brand_stocks
 * schema, purchase_register schema/FEFO, and the existing indent verify/issue/
 * reset/delete flow (this dashboard rebinds those existing endpoints in the UI;
 * it does not re-implement them).
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/user.js";
import BrandStock from "../models/brandStock.js";
import PurchaseRegister from "../models/purchaseRegister.js";
import IngredientIndent from "../models/ingredientIndent.js";
import ItemMaster from "../models/itemMaster.js";
import Vendor from "../models/vendor.js";
import StockUpdate from "../models/stockUpdate.js";
import DeliveryQc from "../models/deliveryQc.js";
import CreditNoteAlert from "../models/creditNoteAlert.js";

import { escapeRegex } from "../utils/bomExpander.js";
import { convertQty } from "../utils/uomConvert.js";
import { getWarehouseStockAvailable } from "./purchaseRegister.controller.js";
import { emitProcurementLog } from "../utils/procurementLog.js";
import { createInvoiceOrder } from "../utils/razorpay.js";
import { uploadInvoiceBuffer, isValidCloudinaryUrl } from "../utils/cloudinaryUpload.js";
import { recomputeGrnVisibilityByGroup } from "../utils/grnVisibility.js";
import { sendEmail, invoiceRaisedEmailHtml } from "../services/email.service.js";

// Resolve the invoice ids (parent + supplementaries) a client raised against a
// given indent — used to link a GRN to its procurement invoices.
async function findInvoiceIdsForIndent(clientUserId, indentId) {
  if (!clientUserId || !indentId) return [];
  const client = await User.findById(clientUserId).select("invoices").lean();
  if (!client) return [];
  return (client.invoices || [])
    .filter((inv) => inv.indentId && String(inv.indentId) === String(indentId))
    .map((inv) => inv._id);
}

const EXPIRY_WARNING_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// Anchored, case-insensitive EXACT brand match — never substring (prevents
// cross-brand data leaks).
const brandExact = (brandName) => new RegExp(`^${escapeRegex(String(brandName || "").trim())}$`, "i");
const itemExact = (itemName) => new RegExp(`^${escapeRegex(String(itemName || "").trim())}$`, "i");

function normalizeDateOnly(dateStr) {
  const raw = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Resolve a brand's User record (needed for stock_updates.brandId). Returns the
// lean doc or null.
async function resolveBrandUser(brandName) {
  if (!String(brandName || "").trim()) return null;
  return User.findOne({ brandName: brandExact(brandName) }).select("brandName _id").lean();
}

// Load itemmasters thresholds into a Map keyed by lowercased itemName.
async function loadItemMasterMap() {
  const rows = await ItemMaster.find({}, { itemName: 1, shelfLifeDays: 1, minStockLevel: 1, minStockUom: 1 }).lean();
  const map = new Map();
  for (const r of rows) {
    const key = String(r.itemName || "").trim().toLowerCase();
    if (!key) continue;
    // Last write wins — catalog may carry duplicates.
    map.set(key, {
      shelfLifeDays: r.shelfLifeDays ?? null,
      minStockLevel: r.minStockLevel ?? null,
      minStockUom: r.minStockUom ?? null,
    });
  }
  return map;
}

// Near-expiry rule: within shelfLifeDays/2 of expiry OR within EXPIRY_WARNING_DAYS days.
function isNearExpiry(expiryMs, shelfLifeDays, now) {
  if (expiryMs == null) return false;
  const days = (expiryMs - now) / DAY_MS;
  const halfShelf = shelfLifeDays ? shelfLifeDays / 2 : 0;
  const threshold = Math.max(EXPIRY_WARNING_DAYS, halfShelf);
  return days <= threshold;
}

// Group a brand's purchase-register batches per item, computing value, next
// expiry, total-remaining (in minStockUom or a representative uom), and the
// near-expiry / below-min flags. Pure — no DB writes.
function rollupItems(batches, imMap, now) {
  const groups = new Map();
  for (const b of batches) {
    const key = String(b.itemName || "").trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { itemName: b.itemName, batches: [], totalValue: 0, nextExpiry: null });
    }
    const g = groups.get(key);
    g.batches.push(b);
    g.totalValue += Number(b.qtyRemaining || 0) * Number(b.pricePerUnit || 0);
    const exp = b.expiryDate ? new Date(b.expiryDate).getTime() : null;
    if (exp != null && (g.nextExpiry == null || exp < g.nextExpiry)) g.nextExpiry = exp;
  }
  for (const g of groups.values()) {
    const key = String(g.itemName || "").trim().toLowerCase();
    const im = imMap.get(key) || {};
    g.shelfLifeDays = im.shelfLifeDays ?? null;
    g.minStockLevel = im.minStockLevel ?? null;
    g.minStockUom = im.minStockUom ?? null;

    const targetUom = g.minStockUom || g.batches[0]?.uom || "";
    let totalRemaining = 0;
    for (const b of g.batches) {
      const conv = convertQty(Number(b.qtyRemaining || 0), b.uom, targetUom);
      totalRemaining += conv == null ? Number(b.qtyRemaining || 0) : conv;
    }
    g.totalRemaining = Number(totalRemaining.toFixed(4));
    g.totalRemainingUom = targetUom;
    g.belowMin = g.minStockLevel != null && g.totalRemaining < g.minStockLevel;
    g.nearExpiry = isNearExpiry(g.nextExpiry, g.shelfLifeDays, now);
  }
  return groups;
}

/* ============================================================
 * 1. Brand picker / home
 * ========================================================== */

// Internal — builds the per-brand summary array (reused by the rollup too).
async function computeBrandsSummary() {
  const clients = await User.find({ brandName: { $exists: true, $nin: [null, ""] } })
    .select("brandName logoUrl lifecycleStage")
    .lean();
  const imMap = await loadItemMasterMap();

  const indentAgg = await IngredientIndent.aggregate([
    { $match: { status: { $in: ["INDENT_PENDING", "INDENT_VERIFIED", "INDENT_ISSUING"] } } },
    { $group: { _id: { $toLower: "$requestBrandName" }, n: { $sum: 1 } } },
  ]);
  const indentMap = new Map(indentAgg.map((r) => [r._id, r.n]));

  const now = Date.now();
  const summary = [];
  for (const c of clients) {
    const batches = await PurchaseRegister.find({
      brandName: brandExact(c.brandName),
      status: "ACTIVE",
      qtyRemaining: { $gt: 0 },
    }).lean();

    const groups = rollupItems(batches, imMap, now);
    let totalStockValue = 0;
    let nearExpiryCount = 0;
    let lowStockCount = 0;
    for (const g of groups.values()) {
      totalStockValue += g.totalValue;
      if (g.nearExpiry) nearExpiryCount += 1;
      if (g.belowMin) lowStockCount += 1;
    }

    summary.push({
      brandName: c.brandName,
      clientId: String(c._id),
      logoUrl: c.logoUrl || null,
      lifecycleStage: c.lifecycleStage || null,
      totalStockValue: Number(totalStockValue.toFixed(2)),
      activeItemCount: groups.size,
      pendingIndents: indentMap.get(String(c.brandName).trim().toLowerCase()) || 0,
      nearExpiryCount,
      lowStockCount,
    });
  }
  return summary;
}

export async function getBrandsSummary(req, res) {
  try {
    const summary = await computeBrandsSummary();
    summary.sort((a, b) => a.brandName.localeCompare(b.brandName));
    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error("[StockManager] getBrandsSummary error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load brand summary" });
  }
}

export async function getAllBrandsRollup(req, res) {
  try {
    const summary = await computeBrandsSummary();
    const rollup = summary.reduce(
      (acc, b) => {
        acc.totalStockValue += b.totalStockValue;
        acc.activeItemCount += b.activeItemCount;
        acc.pendingIndents += b.pendingIndents;
        acc.nearExpiryCount += b.nearExpiryCount;
        acc.lowStockCount += b.lowStockCount;
        return acc;
      },
      { brandCount: summary.length, totalStockValue: 0, activeItemCount: 0, pendingIndents: 0, nearExpiryCount: 0, lowStockCount: 0 }
    );
    rollup.totalStockValue = Number(rollup.totalStockValue.toFixed(2));
    return res.json({ success: true, data: rollup });
  } catch (err) {
    console.error("[StockManager] getAllBrandsRollup error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load roll-up" });
  }
}

/* ============================================================
 * 2. Stock Overview (per brand)
 * ========================================================== */

// Shared loader → returns { rows, groups } for a brand's ACTIVE purchase batches.
async function loadBrandStockRows(brandName) {
  const imMap = await loadItemMasterMap();
  const now = Date.now();
  const batches = await PurchaseRegister.find({
    brandName: brandExact(brandName),
    status: "ACTIVE",
    qtyRemaining: { $gt: 0 },
  })
    .sort({ expiryDate: 1 })
    .lean();

  const groups = rollupItems(batches, imMap, now);

  const rows = [];
  for (const g of groups.values()) {
    for (const b of g.batches) {
      const expMs = b.expiryDate ? new Date(b.expiryDate).getTime() : null;
      rows.push({
        _id: b._id,
        itemName: b.itemName,
        ingredientBrand: b.ingredientBrand,
        qtyRemaining: b.qtyRemaining,
        qtyPurchased: b.qtyPurchased,
        uom: b.uom,
        pricePerUnit: b.pricePerUnit,
        expiryDate: b.expiryDate,
        purchaseDate: b.purchaseDate,
        vendorName: b.vendorName || "",
        batchAgeDays: b.purchaseDate ? Math.floor((now - new Date(b.purchaseDate).getTime()) / DAY_MS) : null,
        shelfLifeDays: g.shelfLifeDays,
        minStockLevel: g.minStockLevel,
        minStockUom: g.minStockUom,
        itemTotalRemaining: g.totalRemaining,
        itemTotalRemainingUom: g.totalRemainingUom,
        nearExpiry: isNearExpiry(expMs, g.shelfLifeDays, now),
        belowMin: g.belowMin,
      });
    }
  }
  rows.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  return { rows, groups };
}

export async function getBrandStock(req, res) {
  try {
    const { brandName } = req.params;
    if (!String(brandName || "").trim()) return res.status(400).json({ message: "brandName is required" });

    const { search } = req.query || {};
    let { rows } = await loadBrandStockRows(brandName);

    if (search && String(search).trim()) {
      const term = String(search).trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.itemName.toLowerCase().includes(term) ||
          String(r.ingredientBrand || "").toLowerCase().includes(term)
      );
    }
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[StockManager] getBrandStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load stock" });
  }
}

export async function getBrandStockExpiring(req, res) {
  try {
    const { brandName } = req.params;
    if (!String(brandName || "").trim()) return res.status(400).json({ message: "brandName is required" });

    const days = Number(req.query?.days);
    const windowDays = Number.isFinite(days) && days > 0 ? days : EXPIRY_WARNING_DAYS;
    const now = Date.now();
    const { rows } = await loadBrandStockRows(brandName);
    const data = rows.filter((r) => {
      if (!r.expiryDate) return false;
      const d = (new Date(r.expiryDate).getTime() - now) / DAY_MS;
      return d <= windowDays;
    });
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[StockManager] getBrandStockExpiring error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load expiring stock" });
  }
}

export async function getBrandStockLow(req, res) {
  try {
    const { brandName } = req.params;
    if (!String(brandName || "").trim()) return res.status(400).json({ message: "brandName is required" });

    const { groups } = await loadBrandStockRows(brandName);
    const data = [];
    for (const g of groups.values()) {
      if (g.belowMin) {
        data.push({
          itemName: g.itemName,
          currentQty: g.totalRemaining,
          uom: g.totalRemainingUom,
          minStockLevel: g.minStockLevel,
          minStockUom: g.minStockUom,
          shelfLifeDays: g.shelfLifeDays,
        });
      }
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[StockManager] getBrandStockLow error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load low stock" });
  }
}

/* ============================================================
 * 3. Indents (incoming — Stock Manager fulfils)
 * Verify/Issue actions reuse the EXISTING /api/ingredient-indent endpoints.
 * This is the brand-scoped LIST only.
 * ========================================================== */

export async function getBrandIndents(req, res) {
  try {
    const { brandName } = req.params;
    if (!String(brandName || "").trim()) return res.status(400).json({ message: "brandName is required" });

    const { status } = req.query || {};
    const q = { requestBrandName: brandExact(brandName) };
    if (status) q.status = status;

    const list = await IngredientIndent.find(q).sort({ createdAt: -1 }).lean();

    await Promise.all(
      list.map(async (doc) => {
        // Source: projection-driven indents carry a recipeId + non-manual kind;
        // manual indents are raised ad-hoc by the chef.
        doc.source = doc.recipeKind === "manual" ? "CUSTOM" : "PROJECTION";
        // Surface how much is already on hand in Warehouse Stock for unissued
        // PROCUREMENT indents (same field the legacy queue shows).
        if (doc.status !== "ISSUED" && (!doc.indentType || doc.indentType === "PROCUREMENT")) {
          doc.warehouseStockAvailable = await getWarehouseStockAvailable({
            brandName: doc.requestBrandName,
            itemName: doc.itemName,
            ingredientBrand: doc.ingredientBrand,
            uom: doc.uom,
          });
        }
      })
    );

    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[StockManager] getBrandIndents error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load indents" });
  }
}

// The Stock Manager UI calls this AFTER a successful verify/issue (which reuse
// the existing, untouched /api/ingredient-indent endpoints) so the analytics
// event stream stays complete without modifying the frozen indent controller.
export async function logIndentEvent(req, res) {
  try {
    const { indentId, eventType } = req.body || {};
    if (!["INDENT_VERIFIED", "INDENT_ISSUED"].includes(eventType)) {
      return res.status(400).json({ message: "eventType must be INDENT_VERIFIED or INDENT_ISSUED" });
    }
    if (!indentId || !/^[0-9a-fA-F]{24}$/.test(String(indentId))) {
      return res.status(400).json({ message: "Valid indentId is required" });
    }
    const indent = await IngredientIndent.findById(indentId).lean();
    if (!indent) return res.status(404).json({ message: "Indent not found" });

    await emitProcurementLog({
      eventType,
      req,
      brandName: indent.requestBrandName,
      itemName: indent.itemName,
      qty: indent.qty,
      uom: indent.uom,
      refId: indent._id,
      refCollection: "ingredient_indents",
      metadata: { indentType: indent.indentType, cost: indent.cost, status: indent.status, branchCode: indent.branchCode },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("[StockManager] logIndentEvent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to log indent event" });
  }
}

/* ============================================================
 * 4. GRN + Delivery QC
 * ========================================================== */

export async function postGrn(req, res) {
  try {
    const { indentId, vendorId, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    // Resolve brand + branch context from the indent when provided.
    let indent = null;
    if (indentId && /^[0-9a-fA-F]{24}$/.test(String(indentId))) {
      indent = await IngredientIndent.findById(indentId).lean();
    }

    let vendor = null;
    if (vendorId && /^[0-9a-fA-F]{24}$/.test(String(vendorId))) {
      vendor = await Vendor.findById(vendorId).lean();
    }

    // One GRN submission = one logical GRN (grnGroupId), even with many item rows.
    const grnGroupId = new mongoose.Types.ObjectId();

    // Link this GRN to the procurement invoice(s) raised against the indent, so
    // it can become client-visible only once they are all paid.
    let linkedInvoiceIds = [];
    if (indent?._id && indent?.clientBrandId) {
      linkedInvoiceIds = await findInvoiceIdsForIndent(indent.clientBrandId, indent._id);
    }

    const results = [];
    for (const raw of items) {
      const itemName = String(raw?.itemName || indent?.itemName || "").trim();
      const ingredientBrand = String(raw?.ingredientBrand || indent?.ingredientBrand || "").trim();
      const brandName = String(raw?.brandName || indent?.requestBrandName || "").trim();
      const uom = String(raw?.uom || indent?.uom || "").trim();
      const plannedQty = Number(raw?.plannedQty ?? indent?.qty ?? 0);
      const purchasedQty = Number(raw?.purchasedQty ?? 0);
      const receivedQty = Number(raw?.receivedQty ?? 0);
      const price = Number(raw?.price ?? 0);
      const qcStatus = String(raw?.qcStatus || "PENDING").toUpperCase();
      const qcNote = String(raw?.qcNote || "").trim();
      const expiryDate = raw?.expiryDate ? new Date(raw.expiryDate) : null;

      if (!itemName || !brandName) {
        results.push({ itemName, ok: false, error: "itemName and brandName are required" });
        continue;
      }
      if (!["PENDING", "ACCEPTED", "SHORT", "REJECTED", "PARTIAL"].includes(qcStatus)) {
        results.push({ itemName, ok: false, error: "invalid qcStatus" });
        continue;
      }

      const credits = qcStatus === "ACCEPTED" || qcStatus === "PARTIAL";
      let purchaseRegisterId = null;

      if (credits) {
        // Stock is credited only on ACCEPTED/PARTIAL. Crediting needs the full
        // batch detail the Purchase Register requires.
        if (!ingredientBrand) {
          results.push({ itemName, ok: false, error: "ingredientBrand is required to credit stock (ACCEPTED/PARTIAL)" });
          continue;
        }
        if (!uom) {
          results.push({ itemName, ok: false, error: "uom is required to credit stock" });
          continue;
        }
        if (!Number.isFinite(receivedQty) || receivedQty <= 0) {
          results.push({ itemName, ok: false, error: "receivedQty must be > 0 to credit stock" });
          continue;
        }
        if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
          results.push({ itemName, ok: false, error: "valid expiryDate is required to credit stock" });
          continue;
        }

        const pr = await PurchaseRegister.create({
          brandName,
          itemName,
          ingredientBrand,
          uom,
          qtyPurchased: receivedQty,
          qtyRemaining: receivedQty,
          pricePerUnit: Number.isFinite(price) ? price : 0,
          expiryDate,
          purchaseDate: new Date(),
          vendorName: vendor?.storeName || vendor?.supplierName || String(raw?.vendorName || "").trim(),
          status: "ACTIVE",
          history: [
            {
              type: "PURCHASE_IN",
              qty: receivedQty,
              uom,
              at: new Date(),
              referenceKind: "MANUAL",
              newQty: receivedQty,
              note: `GRN${qcStatus === "PARTIAL" ? " (partial)" : ""}${indent ? " against indent" : ""}`,
            },
          ],
        });
        purchaseRegisterId = pr._id;

        await emitProcurementLog({
          eventType: "PURCHASE",
          req,
          brandName,
          itemName,
          vendorId: vendor?._id || null,
          qty: receivedQty,
          uom,
          refId: pr._id,
          refCollection: "purchase_register",
          metadata: { ingredientBrand, price, qcStatus, indentId: indent?._id || null },
        });
      }

      const qcDoc = await DeliveryQc.create({
        purchaseRegisterId,
        brandName,
        itemName,
        ingredientBrand,
        vendorId: vendor?._id || null,
        vendorName: vendor?.storeName || vendor?.supplierName || String(raw?.vendorName || "").trim(),
        indentId: indent?._id || null,
        plannedQty,
        purchasedQty,
        receivedQty,
        uom,
        pricePerUnit: Number.isFinite(price) ? price : 0,
        expiryDate: expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null,
        qcStatus,
        qcNote,
        qcBy: req.user?._id || req.user?.adminId || null,
        qcAt: new Date(),
        warehouseId: req.user?.warehouseId || "",
        grnGroupId,
        linkedInvoiceIds,
        // Received qty is captured here at GRN time; mark it entered when a real
        // quantity arrived (ACCEPTED/PARTIAL). It can still be revised via
        // PATCH /grn/:grnId/update-received.
        receivedQtyEntered: Number.isFinite(receivedQty) && receivedQty > 0,
      });

      await emitProcurementLog({
        eventType: "QC",
        req,
        brandName,
        itemName,
        vendorId: vendor?._id || null,
        qty: receivedQty,
        uom,
        refId: qcDoc._id,
        refCollection: "delivery_qc",
        metadata: { qcStatus, plannedQty, purchasedQty, receivedQty, credited: credits, qcNote },
      });

      results.push({ itemName, ok: true, qcStatus, credited: credits, purchaseRegisterId, deliveryQcId: qcDoc._id });
    }

    // Touch vendor lastDeliveryAt on any successful GRN line.
    if (vendor?._id && results.some((r) => r.ok)) {
      await Vendor.findByIdAndUpdate(vendor._id, { $set: { lastDeliveryAt: new Date() } });
    }

    // If invoices were already paid before this GRN, it may already be visible.
    if (linkedInvoiceIds.length && results.some((r) => r.ok)) {
      await recomputeGrnVisibilityByGroup(grnGroupId);
    }

    return res.status(201).json({
      success: true,
      data: results,
      grnGroupId: String(grnGroupId),
      linkedInvoiceIds: linkedInvoiceIds.map((id) => String(id)),
    });
  } catch (err) {
    console.error("[StockManager] postGrn error:", err?.message || err);
    return res.status(500).json({ message: "Failed to record GRN" });
  }
}

/* ============================================================
 * Procurement Invoicing (Stock Manager) — wallet-free, Razorpay-direct.
 * Raises a PROCUREMENT invoice (parent or supplementary) onto the client and
 * creates a Razorpay order so the client can pay from their dashboard.
 * (CLAUDE.md §24)
 * ========================================================== */

// Upload a procurement-invoice attachment (PDF/DOC/DOCX) to Cloudinary.
export async function postInvoiceAttachment(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const { attachmentUrl, attachmentName } = await uploadInvoiceBuffer(
      req.file.buffer,
      req.file.originalname || "attachment"
    );
    return res.status(201).json({ success: true, attachmentUrl, attachmentName });
  } catch (err) {
    console.error("[StockManager] postInvoiceAttachment error:", err?.message || err);
    return res.status(500).json({ message: err?.message || "Failed to upload attachment" });
  }
}

export async function postProcurementInvoice(req, res) {
  try {
    const {
      clientId,
      items,
      notes,
      attachmentUrl,
      attachmentName,
      parentInvoiceId,
      supplementaryReason,
      indentId,
      branchCode,
    } = req.body || {};

    if (!clientId || !/^[0-9a-fA-F]{24}$/.test(String(clientId))) {
      return res.status(400).json({ message: "Valid clientId is required" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    // Validate + total the line items.
    let amount = 0;
    const cleanItems = [];
    for (const raw of items) {
      const itemName = String(raw?.itemName || "").trim();
      const qty = Number(raw?.qty);
      const unitPrice = Number(raw?.unitPrice);
      const uom = String(raw?.uom || "").trim();
      if (!itemName || !(qty > 0) || !(unitPrice >= 0)) {
        return res.status(400).json({ message: `Invalid line item: ${itemName || "(unnamed)"}` });
      }
      amount += qty * unitPrice;
      cleanItems.push({ itemName, qty, unitPrice, uom });
    }
    amount = Math.round(amount * 100) / 100;
    if (!(amount > 0)) {
      return res.status(400).json({ message: "Invoice amount must be greater than 0" });
    }

    const client = await User.findById(clientId).select("invoices email name brandName assignedBranches").lean();
    if (!client || !client.brandName) {
      return res.status(404).json({ message: "Client not found" });
    }

    let branch = "";
    if (branchCode) {
      branch = String(branchCode).trim().toUpperCase();
      if (!(client.assignedBranches || []).includes(branch)) {
        return res.status(403).json({ message: "Branch not assigned to this client" });
      }
    }

    // Supplementary invoice → parent must exist and belong to the SAME client.
    let parentId = null;
    if (parentInvoiceId) {
      if (!/^[0-9a-fA-F]{24}$/.test(String(parentInvoiceId))) {
        return res.status(400).json({ message: "Invalid parentInvoiceId" });
      }
      const parent = (client.invoices || []).find((inv) => String(inv._id) === String(parentInvoiceId));
      if (!parent) {
        return res.status(404).json({ message: "Parent invoice not found for this client" });
      }
      if (!String(supplementaryReason || "").trim()) {
        return res.status(400).json({ message: "supplementaryReason is required for a supplementary invoice" });
      }
      parentId = parent._id;
    }

    if (attachmentUrl && !isValidCloudinaryUrl(attachmentUrl)) {
      return res.status(400).json({ message: "Invalid attachment URL" });
    }

    let indId = null;
    if (indentId && /^[0-9a-fA-F]{24}$/.test(String(indentId))) {
      indId = new mongoose.Types.ObjectId(String(indentId));
    }

    // Razorpay order for the full amount (no commission on procurement).
    let order;
    try {
      order = await createInvoiceOrder(amount, "PROC");
    } catch (e) {
      console.error("[StockManager] Razorpay order failed:", e?.message || e);
      return res.status(502).json({ message: "Could not create payment order" });
    }

    const invoice = {
      type: "PROCUREMENT",
      amount,
      commission: 0,
      notes: String(notes || ""),
      branchCode: branch,
      attachmentUrl: attachmentUrl || null,
      attachmentName: attachmentName || null,
      razorpayOrderId: order.id,
      status: "UNPAID",
      paidVia: null,
      parentInvoiceId: parentId,
      supplementaryReason: String(supplementaryReason || ""),
      indentId: indId,
      createdAt: new Date(),
    };

    const updated = await User.findByIdAndUpdate(
      clientId,
      { $push: { invoices: invoice } },
      { new: true }
    ).select("invoices");
    const created = updated.invoices[updated.invoices.length - 1];

    await emitProcurementLog({
      eventType: "PROCUREMENT_INVOICE_RAISED",
      req,
      brandName: client.brandName,
      itemName: cleanItems[0]?.itemName || "",
      qty: null,
      refId: created._id,
      refCollection: "users.invoices",
      metadata: {
        amount,
        items: cleanItems,
        parentInvoiceId: parentId ? String(parentId) : null,
        supplementaryReason: supplementaryReason || "",
        indentId: indId ? String(indId) : null,
      },
    });

    // Fire-and-forget client email — never blocks.
    if (client.email) {
      sendEmail({
        to: client.email,
        subject: `New procurement invoice — Skope Kitchens`,
        html: invoiceRaisedEmailHtml({
          brandName: client.brandName,
          type: "PROCUREMENT",
          amount,
          commission: 0,
          notes,
          branchCode: branch,
          attachmentUrl: attachmentUrl || "",
          attachmentName: attachmentName || "",
          supplementaryReason: supplementaryReason || "",
        }),
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      invoice: created,
      razorpayOrderId: order.id,
    });
  } catch (err) {
    console.error("[StockManager] postProcurementInvoice error:", err?.message || err);
    return res.status(500).json({ message: "Failed to raise procurement invoice" });
  }
}

// Store Manager updates final received qty / price after buying. Marks
// receivedQtyEntered and re-checks GRN client visibility.
export async function updateGrnReceived(req, res) {
  try {
    const { grnId } = req.params;
    const { items } = req.body || {};
    if (!grnId || !/^[0-9a-fA-F]{24}$/.test(String(grnId))) {
      return res.status(400).json({ message: "Invalid grnId" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const rows = await DeliveryQc.find({ grnGroupId: grnId });
    if (!rows.length) {
      return res.status(404).json({ message: "GRN not found" });
    }

    const byName = new Map(
      items.map((it) => [String(it?.itemName || "").trim().toLowerCase(), it])
    );

    for (const row of rows) {
      const match = byName.get(String(row.itemName || "").trim().toLowerCase());
      if (match) {
        const rq = Number(match.receivedQty);
        const fp = Number(match.finalUnitPrice);
        if (Number.isFinite(rq) && rq >= 0) row.receivedQty = rq;
        if (Number.isFinite(fp) && fp >= 0) row.pricePerUnit = fp;
      }
      row.receivedQtyEntered = true;
      await row.save();
    }

    const visible = await recomputeGrnVisibilityByGroup(grnId);

    await emitProcurementLog({
      eventType: "GRN_RECEIVED_UPDATED",
      req,
      brandName: rows[0]?.brandName || "",
      itemName: rows[0]?.itemName || "",
      qty: null,
      refId: rows[0]?._id || null,
      refCollection: "delivery_qc",
      metadata: { grnGroupId: grnId, itemsUpdated: items.length, clientVisible: visible },
    });

    return res.json({ success: true, grnGroupId: grnId, clientVisible: visible });
  } catch (err) {
    console.error("[StockManager] updateGrnReceived error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update GRN" });
  }
}

// Store Manager's view of procurement invoices they raised, supplementaries
// grouped under their parents.
export async function getProcurementInvoices(req, res) {
  try {
    const { status, clientId } = req.query || {};

    const match = {};
    if (clientId && /^[0-9a-fA-F]{24}$/.test(String(clientId))) {
      match._id = new mongoose.Types.ObjectId(String(clientId));
    }

    const clients = await User.find(match)
      .select("brandName name invoices")
      .lean();

    const flat = [];
    for (const c of clients) {
      for (const inv of c.invoices || []) {
        if (inv.type !== "PROCUREMENT") continue;
        if (status && inv.status !== status) continue;
        flat.push({
          id: String(inv._id),
          clientId: String(c._id),
          clientName: c.name || "",
          brandName: c.brandName || "",
          amount: Number(inv.amount || 0),
          status: inv.status,
          branchCode: inv.branchCode || "",
          notes: inv.notes || "",
          attachmentUrl: inv.attachmentUrl || null,
          attachmentName: inv.attachmentName || null,
          paidAt: inv.paidAt || null,
          parentInvoiceId: inv.parentInvoiceId ? String(inv.parentInvoiceId) : null,
          supplementaryReason: inv.supplementaryReason || "",
          indentId: inv.indentId ? String(inv.indentId) : null,
          createdAt: inv.createdAt,
        });
      }
    }

    // Group: parents carry their supplementaries.
    const parents = flat.filter((i) => !i.parentInvoiceId);
    const supps = flat.filter((i) => i.parentInvoiceId);
    const grouped = parents
      .map((p) => ({
        ...p,
        supplementaries: supps
          .filter((s) => s.parentInvoiceId === p.id)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Orphan supplementaries (parent filtered out by status) still surface.
    const parentIds = new Set(parents.map((p) => p.id));
    const orphanSupps = supps
      .filter((s) => !parentIds.has(s.parentInvoiceId))
      .map((s) => ({ ...s, supplementaries: [] }));

    return res.json({ success: true, data: [...grouped, ...orphanSupps] });
  } catch (err) {
    console.error("[StockManager] getProcurementInvoices error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load procurement invoices" });
  }
}

export async function getQcFailures(req, res) {
  try {
    const { brandName } = req.query || {};
    const q = { qcStatus: { $in: ["SHORT", "REJECTED"] } };
    if (brandName && String(brandName).trim()) q.brandName = brandExact(brandName);

    const list = await DeliveryQc.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[StockManager] getQcFailures error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load QC failures" });
  }
}

/* ============================================================
 * 4b. Vendor Alerts (operational — the renamed "Credit Note" alerts)
 *
 * NOT money — touches only `credit_note_alerts` (no wallet/dues/GST/Razorpay).
 * A Head-Chef → Stock-Manager handoff: the Head Chef (RECIPE_MANAGER) raises an
 * alert flagging an ingredient/vendor issue (created via the existing
 * /api/credit-notes POST); the Stock Manager reviews and resolves it here. Pairs
 * with the GRN+QC flow (QC rejects bad goods → vendor alert is the follow-up).
 * ========================================================== */

export async function getVendorAlerts(req, res) {
  try {
    const { brandName } = req.params;
    if (!String(brandName || "").trim()) return res.status(400).json({ message: "brandName is required" });

    const q = { brandName: brandExact(brandName) };
    if (req.query?.status && ["OPEN", "RESOLVED"].includes(String(req.query.status).toUpperCase())) {
      q.status = String(req.query.status).toUpperCase();
    }
    const list = await CreditNoteAlert.find(q).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[StockManager] getVendorAlerts error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load vendor alerts" });
  }
}

export async function resolveVendorAlert(req, res) {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) return res.status(400).json({ message: "Invalid alert id" });

    // Hard delete mirrors the legacy "clear" behavior; the procurement_logs entry
    // preserves the full audit trail (ingredient, brand, note) so nothing is lost.
    const alert = await CreditNoteAlert.findByIdAndDelete(id).lean();
    if (!alert) return res.status(404).json({ message: "Vendor alert not found" });

    await emitProcurementLog({
      eventType: "VENDOR_ALERT_RESOLVED",
      req,
      brandName: alert.brandName,
      itemName: alert.ingredientName,
      refId: alert._id,
      refCollection: "credit_note_alerts",
      metadata: { note: alert.note, createdByRole: alert.createdByRole, priorStatus: alert.status },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[StockManager] resolveVendorAlert error:", err?.message || err);
    return res.status(500).json({ message: "Failed to resolve vendor alert" });
  }
}

/* ============================================================
 * 5. Purchases Log
 * ========================================================== */

export async function getPurchasesLog(req, res) {
  try {
    const { brandName, vendorId, itemName, from, to, qcStatus } = req.query || {};

    const q = {};
    if (brandName && String(brandName).trim()) q.brandName = brandExact(brandName);
    if (itemName && String(itemName).trim()) q.itemName = itemExact(itemName);
    if (from || to) {
      q.purchaseDate = {};
      const f = normalizeDateOnly(from);
      const t = normalizeDateOnly(to);
      if (f) q.purchaseDate.$gte = f;
      if (t) q.purchaseDate.$lte = new Date(t.getTime() + DAY_MS - 1);
      if (Object.keys(q.purchaseDate).length === 0) delete q.purchaseDate;
    }

    const batches = await PurchaseRegister.find(q).sort({ purchaseDate: -1 }).limit(500).lean();

    // Join QC by purchaseRegisterId.
    const ids = batches.map((b) => b._id);
    const qcDocs = await DeliveryQc.find({ purchaseRegisterId: { $in: ids } })
      .select("purchaseRegisterId qcStatus qcNote vendorId vendorName")
      .lean();
    const qcMap = new Map(qcDocs.map((d) => [String(d.purchaseRegisterId), d]));

    let data = batches.map((b) => {
      const qc = qcMap.get(String(b._id)) || null;
      return {
        ...b,
        qcStatus: qc?.qcStatus || null,
        qcNote: qc?.qcNote || "",
        qcVendorId: qc?.vendorId || null,
      };
    });

    if (qcStatus && String(qcStatus).trim()) {
      data = data.filter((d) => d.qcStatus === String(qcStatus).trim().toUpperCase());
    }
    if (vendorId && /^[0-9a-fA-F]{24}$/.test(String(vendorId))) {
      data = data.filter((d) => String(d.qcVendorId || "") === String(vendorId));
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[StockManager] getPurchasesLog error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load purchases log" });
  }
}

/* ============================================================
 * 6. Closing Stock Audit
 * ========================================================== */

// Reconcile a locked audit's actual counts into the brand_stocks ledger — the
// SAME best-effort pattern upsertStockUpdate uses (match brand+item, skip if
// 0 or >1 ledger rows, RECONCILIATION history). Never throws.
async function reconcileAuditToLedger(brandName, items, req) {
  try {
    for (const item of items) {
      const stockDocs = await BrandStock.find(
        { brandName, itemName: item.itemName },
        { _id: 1, qtyRemaining: 1, uom: 1 }
      ).lean();
      if (stockDocs.length === 0) continue;
      if (stockDocs.length > 1) {
        console.warn(`[StockManager] Multiple brand_stocks for "${brandName}" / "${item.itemName}" — skipping reconcile`);
        continue;
      }
      const stockDoc = stockDocs[0];
      const previousQty = Number(stockDoc.qtyRemaining || 0);
      const newQty = Number(item.actualQty);
      const delta = newQty - previousQty;
      if (!Number.isFinite(delta) || delta === 0) continue;

      await BrandStock.findByIdAndUpdate(stockDoc._id, {
        $inc: { qtyRemaining: delta },
        $push: {
          history: {
            type: "RECONCILIATION",
            qty: Math.abs(delta),
            uom: item.uom || stockDoc.uom || "",
            note: "Closing-stock audit reconcile",
            at: new Date(),
            actorRole: req?.user?.role || "",
          },
        },
      });
    }
  } catch (err) {
    console.error("[StockManager] reconcileAuditToLedger error:", err?.message || err);
  }
}

// Validate + normalize the submitted audit rows. Non-zero variance rows REQUIRE
// a reason. Returns { ok, error, items } where items is the persisted shape.
function buildAuditItems(rawItems) {
  const VALID_REASONS = ["WASTAGE", "SPOILAGE", "MISCOUNT", "THEFT", "OTHER"];
  const items = [];
  for (const r of Array.isArray(rawItems) ? rawItems : []) {
    const itemName = String(r?.itemName || "").trim();
    if (!itemName) continue;
    const uom = String(r?.uom || "").trim();
    const expectedQty = Number(r?.expectedQty || 0);
    const actualQty = Number(r?.actualQty || 0);
    if (!Number.isFinite(expectedQty) || !Number.isFinite(actualQty) || actualQty < 0) {
      return { ok: false, error: `Invalid quantities for "${itemName}"` };
    }
    const varianceQty = Number((actualQty - expectedQty).toFixed(4));
    let reason = r?.varianceReason ? String(r.varianceReason).trim().toUpperCase() : null;
    const reasonNote = String(r?.reasonNote || "").trim();

    if (varianceQty !== 0) {
      if (!reason || !VALID_REASONS.includes(reason)) {
        return { ok: false, error: `"${itemName}" has a variance — a valid reason is required` };
      }
    } else {
      reason = null;
    }
    items.push({ itemName, uom, expectedQty, actualQty, varianceQty, reason, reasonNote });
  }
  if (items.length === 0) return { ok: false, error: "At least one valid item is required" };
  return { ok: true, items };
}

// Build the items[] (legacy daily-stock shape) snapshot so the client's existing
// Daily Stock view keeps working — remainingQty = the audited actual count.
function auditToLegacyItems(items) {
  return items.map((i) => ({
    itemName: i.itemName,
    uom: i.uom || "NA",
    issueQty: 0,
    usedQty: 0,
    wastageQty: 0,
    remainingQty: i.actualQty,
  }));
}

export async function getClosingStock(req, res) {
  try {
    const { brandName } = req.params;
    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });

    const dateObj = normalizeDateOnly(req.query?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    // Return ALL records for the day (original seq 0 + corrections), stacked.
    const records = await StockUpdate.find({ brandId: brand._id, date: dateObj })
      .sort({ correctionSeq: 1 })
      .lean();

    if (records.length > 0) {
      return res.json({
        success: true,
        data: {
          existing: true,
          brandName: brand.brandName,
          date: req.query.date,
          records: records.map((r) => ({
            _id: r._id,
            correctionSeq: r.correctionSeq || 0,
            correctionOf: r.correctionOf || null,
            lockedAt: r.lockedAt || null,
            lockedBy: r.lockedBy || null,
            variances: r.variances || [],
            items: r.items || [],
            createdAt: r.createdAt,
          })),
        },
      });
    }

    // No record yet → pre-populate the expected snapshot from Warehouse Stock.
    const { groups } = await loadBrandStockRows(brandName);
    const snapshot = [];
    for (const g of groups.values()) {
      snapshot.push({
        itemName: g.itemName,
        uom: g.totalRemainingUom || "",
        expectedQty: g.totalRemaining,
        actualQty: g.totalRemaining,
        varianceQty: 0,
      });
    }
    snapshot.sort((a, b) => a.itemName.localeCompare(b.itemName));

    return res.json({
      success: true,
      data: { existing: false, brandName: brand.brandName, date: req.query.date, snapshot },
    });
  } catch (err) {
    console.error("[StockManager] getClosingStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load closing stock" });
  }
}

export async function postClosingStock(req, res) {
  try {
    const { brandName } = req.params;
    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });

    const dateObj = normalizeDateOnly(req.body?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const built = buildAuditItems(req.body?.items);
    if (!built.ok) return res.status(400).json({ message: built.error });

    // Cannot overwrite a locked original. Corrections go through the correction route.
    const existing = await StockUpdate.findOne({ brandId: brand._id, date: dateObj, correctionSeq: 0 }).lean();
    if (existing?.lockedAt) {
      return res.status(409).json({ message: "This day's audit is already locked. Use a correction instead." });
    }

    const doc = await StockUpdate.findOneAndUpdate(
      { brandId: brand._id, date: dateObj, correctionSeq: 0 },
      {
        $set: {
          brandName: String(brand.brandName).trim(),
          variances: built.items,
          items: auditToLegacyItems(built.items),
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, data: { _id: doc._id, locked: false } });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Audit for this brand/date already exists" });
    }
    console.error("[StockManager] postClosingStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save closing stock" });
  }
}

export async function lockClosingStock(req, res) {
  try {
    const { brandName } = req.params;
    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });

    const dateObj = normalizeDateOnly(req.body?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const doc = await StockUpdate.findOne({ brandId: brand._id, date: dateObj, correctionSeq: 0 });
    if (!doc) return res.status(404).json({ message: "No draft audit found for this date — save it first" });
    if (doc.lockedAt) return res.status(409).json({ message: "Audit already locked" });

    doc.lockedAt = new Date();
    doc.lockedBy = req.user?._id || req.user?.adminId || null;
    await doc.save();

    // Reconcile actual counts into the ledger.
    await reconcileAuditToLedger(String(brand.brandName).trim(), doc.variances || [], req);

    // Emit one VARIANCE_RECORDED per non-zero variance + one STOCK_RECONCILED.
    for (const v of doc.variances || []) {
      if (Number(v.varianceQty) !== 0) {
        await emitProcurementLog({
          eventType: "VARIANCE_RECORDED",
          req,
          brandName: brand.brandName,
          itemName: v.itemName,
          qty: v.varianceQty,
          uom: v.uom,
          refId: doc._id,
          refCollection: "stock_updates",
          metadata: { expectedQty: v.expectedQty, actualQty: v.actualQty, reason: v.reason, reasonNote: v.reasonNote, date: req.body.date, correctionSeq: 0 },
        });
      }
    }
    await emitProcurementLog({
      eventType: "STOCK_RECONCILED",
      req,
      brandName: brand.brandName,
      refId: doc._id,
      refCollection: "stock_updates",
      metadata: { date: req.body.date, correctionSeq: 0, itemCount: (doc.variances || []).length },
    });

    return res.json({ success: true, data: { _id: doc._id, lockedAt: doc.lockedAt } });
  } catch (err) {
    console.error("[StockManager] lockClosingStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to lock audit" });
  }
}

export async function postClosingStockCorrection(req, res) {
  try {
    const { brandName } = req.params;
    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });

    const dateObj = normalizeDateOnly(req.body?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const original = await StockUpdate.findOne({ brandId: brand._id, date: dateObj, correctionSeq: 0 }).lean();
    if (!original) return res.status(404).json({ message: "No original audit to correct for this date" });
    if (!original.lockedAt) {
      return res.status(409).json({ message: "Original audit is not locked yet — edit the draft instead of correcting" });
    }

    const built = buildAuditItems(req.body?.items);
    if (!built.ok) return res.status(400).json({ message: built.error });

    // Next correction sequence number.
    const last = await StockUpdate.find({ brandId: brand._id, date: dateObj })
      .sort({ correctionSeq: -1 })
      .limit(1)
      .select("correctionSeq")
      .lean();
    const nextSeq = (last[0]?.correctionSeq || 0) + 1;

    const doc = await StockUpdate.create({
      brandId: brand._id,
      brandName: String(brand.brandName).trim(),
      date: dateObj,
      correctionSeq: nextSeq,
      correctionOf: original._id,
      variances: built.items,
      items: auditToLegacyItems(built.items),
      lockedAt: new Date(),
      lockedBy: req.user?._id || req.user?.adminId || null,
    });

    // Corrections re-reconcile the ledger to the corrected actuals.
    await reconcileAuditToLedger(String(brand.brandName).trim(), built.items, req);

    for (const v of built.items) {
      if (Number(v.varianceQty) !== 0) {
        await emitProcurementLog({
          eventType: "VARIANCE_RECORDED",
          req,
          brandName: brand.brandName,
          itemName: v.itemName,
          qty: v.varianceQty,
          uom: v.uom,
          refId: doc._id,
          refCollection: "stock_updates",
          metadata: { expectedQty: v.expectedQty, actualQty: v.actualQty, reason: v.reason, reasonNote: v.reasonNote, date: req.body.date, correctionSeq: nextSeq },
        });
      }
    }
    await emitProcurementLog({
      eventType: "STOCK_RECONCILED",
      req,
      brandName: brand.brandName,
      refId: doc._id,
      refCollection: "stock_updates",
      metadata: { date: req.body.date, correctionSeq: nextSeq, correctionOf: String(original._id) },
    });

    return res.status(201).json({ success: true, data: { _id: doc._id, correctionSeq: nextSeq } });
  } catch (err) {
    console.error("[StockManager] postClosingStockCorrection error:", err?.message || err);
    return res.status(500).json({ message: "Failed to record correction" });
  }
}

/* ============================================================
 * 7. Reorder Insights (DERIVED — observational, never auto-indents)
 * ========================================================== */

export async function getReorderInsights(req, res) {
  try {
    const { brandName } = req.params;
    if (!String(brandName || "").trim()) return res.status(400).json({ message: "brandName is required" });

    const imMap = await loadItemMasterMap();
    const now = Date.now();

    // All batches (any status) for cadence; active groups for current qty/expiry.
    const allBatches = await PurchaseRegister.find({ brandName: brandExact(brandName) })
      .select("itemName purchaseDate expiryDate qtyRemaining uom status pricePerUnit")
      .lean();

    const activeGroups = rollupItems(
      allBatches.filter((b) => b.status === "ACTIVE" && Number(b.qtyRemaining || 0) > 0),
      imMap,
      now
    );

    // Per-item purchase-date list for cadence.
    const byItem = new Map();
    for (const b of allBatches) {
      const key = String(b.itemName || "").trim().toLowerCase();
      if (!byItem.has(key)) byItem.set(key, { itemName: b.itemName, dates: [] });
      if (b.purchaseDate) byItem.get(key).dates.push(new Date(b.purchaseDate).getTime());
    }

    const data = [];
    for (const [key, info] of byItem.entries()) {
      const dates = info.dates.sort((a, b) => a - b);
      const lastPurchaseAt = dates.length ? new Date(dates[dates.length - 1]) : null;
      let avgCadenceDays = null;
      if (dates.length >= 2) {
        let gapSum = 0;
        for (let i = 1; i < dates.length; i++) gapSum += (dates[i] - dates[i - 1]) / DAY_MS;
        avgCadenceDays = Number((gapSum / (dates.length - 1)).toFixed(1));
      }
      const g = activeGroups.get(key);
      const im = imMap.get(key) || {};
      const currentQty = g?.totalRemaining ?? 0;
      const minStockLevel = im.minStockLevel ?? null;
      const shelfLifeDays = im.shelfLifeDays ?? null;
      const nextExpiryAt = g?.nextExpiry ? new Date(g.nextExpiry) : null;

      const daysSinceLast = lastPurchaseAt ? (now - lastPurchaseAt.getTime()) / DAY_MS : null;
      const belowMin = minStockLevel != null && currentQty < minStockLevel;
      const nearExpiry = g ? isNearExpiry(g.nextExpiry, shelfLifeDays, now) : false;
      const cadenceDrift =
        avgCadenceDays != null && daysSinceLast != null && daysSinceLast > avgCadenceDays * 1.5;

      let advisory = "OK";
      if (belowMin) advisory = "BELOW_MIN";
      else if (nearExpiry) advisory = "NEAR_EXPIRY";
      else if (cadenceDrift) advisory = "CADENCE_DRIFT";

      data.push({
        itemName: info.itemName,
        lastPurchaseAt,
        daysSinceLastPurchase: daysSinceLast == null ? null : Math.floor(daysSinceLast),
        avgCadenceDays,
        currentQty,
        currentUom: g?.totalRemainingUom || im.minStockUom || "",
        minStockLevel,
        minStockUom: im.minStockUom ?? null,
        shelfLifeDays,
        nextExpiryAt,
        advisory,
      });
    }

    data.sort((a, b) => a.itemName.localeCompare(b.itemName));
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[StockManager] getReorderInsights error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load reorder insights" });
  }
}

/* ============================================================
 * 8. Ingredient master thresholds
 * ========================================================== */

export async function patchIngredientThresholds(req, res) {
  try {
    const { itemName } = req.params;
    const clean = String(itemName || "").trim();
    if (!clean) return res.status(400).json({ message: "itemName is required" });

    const { shelfLifeDays, minStockLevel, minStockUom } = req.body || {};
    const set = {};
    if (shelfLifeDays !== undefined) {
      const v = shelfLifeDays === null || shelfLifeDays === "" ? null : Number(shelfLifeDays);
      if (v !== null && (!Number.isFinite(v) || v < 0)) return res.status(400).json({ message: "shelfLifeDays must be a non-negative number" });
      set.shelfLifeDays = v;
    }
    if (minStockLevel !== undefined) {
      const v = minStockLevel === null || minStockLevel === "" ? null : Number(minStockLevel);
      if (v !== null && (!Number.isFinite(v) || v < 0)) return res.status(400).json({ message: "minStockLevel must be a non-negative number" });
      set.minStockLevel = v;
    }
    if (minStockUom !== undefined) {
      set.minStockUom = minStockUom ? String(minStockUom).trim() : null;
    }
    if (Object.keys(set).length === 0) return res.status(400).json({ message: "Nothing to update" });

    // itemmasters has no unique key on itemName — update every matching catalog row.
    const result = await ItemMaster.updateMany({ itemName: itemExact(clean) }, { $set: set });

    if (result.matchedCount === 0 && result.n === 0) {
      // No catalog row exists yet — create a minimal one so the threshold persists.
      await ItemMaster.create({ itemName: clean, ...set });
    }

    await emitProcurementLog({
      eventType: "INGREDIENT_THRESHOLD_SET",
      req,
      itemName: clean,
      refCollection: "itemmasters",
      metadata: set,
    });

    return res.json({ success: true, data: set });
  } catch (err) {
    console.error("[StockManager] patchIngredientThresholds error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update ingredient thresholds" });
  }
}

/* ============================================================
 * 9. Vendor management (global — not brand-scoped)
 * ========================================================== */

export async function listVendors(req, res) {
  try {
    const { status, search } = req.query || {};
    const q = {};
    if (status && ["ACTIVE", "INACTIVE"].includes(String(status).toUpperCase())) {
      q.status = String(status).toUpperCase();
    }
    if (search && String(search).trim()) {
      const re = new RegExp(escapeRegex(String(search).trim()), "i");
      q.$or = [{ supplierName: re }, { storeName: re }, { email: re }, { phoneNumber: re }];
    }
    const vendors = await Vendor.find(q)
      .select("supplierName storeName email phoneNumber address fssai pan status notes lastDeliveryAt createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: vendors });
  } catch (err) {
    console.error("[StockManager] listVendors error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load vendors" });
  }
}

export async function getVendorDetail(req, res) {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) return res.status(400).json({ message: "Invalid vendor id" });

    const vendor = await Vendor.findById(id)
      .select("supplierName storeName email phoneNumber address fssai pan status notes lastDeliveryAt createdAt")
      .lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // Recent purchases for this vendor — via the QC link (which carries vendorId).
    const recentPurchases = await DeliveryQc.find({ vendorId: id })
      .sort({ createdAt: -1 })
      .limit(25)
      .select("brandName itemName receivedQty uom qcStatus pricePerUnit createdAt")
      .lean();

    return res.json({ success: true, data: { ...vendor, recentPurchases } });
  } catch (err) {
    console.error("[StockManager] getVendorDetail error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load vendor" });
  }
}

export async function createVendor(req, res) {
  try {
    const { supplierName, storeName, email, phoneNumber, address, fssai, pan, notes } = req.body || {};
    if (!String(supplierName || "").trim()) return res.status(400).json({ message: "supplierName is required" });
    if (!String(storeName || "").trim()) return res.status(400).json({ message: "storeName is required" });
    if (!String(email || "").trim()) return res.status(400).json({ message: "email is required" });

    const existing = await Vendor.findOne({ email: String(email).toLowerCase().trim() }).select("_id").lean();
    if (existing) return res.status(409).json({ message: "A vendor with this email already exists" });

    // Vendors created here do not log in yet — set a random password hash so the
    // required field is satisfied. The vendor can reset it later to gain access.
    const randomPwd = crypto.randomBytes(24).toString("hex");
    const passwordHash = await bcrypt.hash(randomPwd, 12);

    const vendor = await Vendor.create({
      supplierName: String(supplierName).trim(),
      storeName: String(storeName).trim(),
      email: String(email).toLowerCase().trim(),
      password: passwordHash,
      phoneNumber: String(phoneNumber || "").trim(),
      address: address || {},
      fssai: String(fssai || "").trim(),
      pan: String(pan || "").trim().toUpperCase(),
      notes: String(notes || "").trim(),
      status: "ACTIVE",
      createdBy: req.user?._id || req.user?.adminId || null,
    });

    await emitProcurementLog({
      eventType: "VENDOR_CREATED",
      req,
      vendorId: vendor._id,
      refId: vendor._id,
      refCollection: "vendors",
      metadata: { supplierName: vendor.supplierName, storeName: vendor.storeName },
    });

    const { password, ...safe } = vendor.toObject();
    return res.status(201).json({ success: true, data: safe });
  } catch (err) {
    if (err?.name === "ValidationError") {
      return res.status(400).json({ message: Object.values(err.errors)[0]?.message || "Invalid vendor data" });
    }
    if (err?.code === 11000) return res.status(409).json({ message: "A vendor with this email already exists" });
    console.error("[StockManager] createVendor error:", err?.message || err);
    return res.status(500).json({ message: "Failed to create vendor" });
  }
}

export async function updateVendor(req, res) {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) return res.status(400).json({ message: "Invalid vendor id" });

    const allowed = ["supplierName", "storeName", "phoneNumber", "address", "fssai", "pan", "notes"];
    const set = {};
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) {
        if (k === "pan") set[k] = String(req.body[k] || "").trim().toUpperCase();
        else if (k === "address") set[k] = req.body[k] || {};
        else set[k] = String(req.body[k] || "").trim();
      }
    }
    if (Object.keys(set).length === 0) return res.status(400).json({ message: "Nothing to update" });

    const vendor = await Vendor.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true })
      .select("supplierName storeName email phoneNumber address fssai pan status notes lastDeliveryAt")
      .lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    await emitProcurementLog({
      eventType: "VENDOR_UPDATED",
      req,
      vendorId: id,
      refId: id,
      refCollection: "vendors",
      metadata: { fields: Object.keys(set) },
    });

    return res.json({ success: true, data: vendor });
  } catch (err) {
    if (err?.name === "ValidationError") {
      return res.status(400).json({ message: Object.values(err.errors)[0]?.message || "Invalid vendor data" });
    }
    console.error("[StockManager] updateVendor error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update vendor" });
  }
}

export async function setVendorStatus(req, res) {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) return res.status(400).json({ message: "Invalid vendor id" });

    const status = String(req.body?.status || "").toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({ message: "status must be ACTIVE or INACTIVE" });
    }

    const vendor = await Vendor.findByIdAndUpdate(id, { $set: { status } }, { new: true })
      .select("supplierName storeName status")
      .lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    await emitProcurementLog({
      eventType: "VENDOR_UPDATED",
      req,
      vendorId: id,
      refId: id,
      refCollection: "vendors",
      metadata: { status },
    });

    return res.json({ success: true, data: vendor });
  } catch (err) {
    console.error("[StockManager] setVendorStatus error:", err?.message || err);
    return res.status(500).json({ message: "Failed to update vendor status" });
  }
}
