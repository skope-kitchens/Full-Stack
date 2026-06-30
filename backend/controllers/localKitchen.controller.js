/**
 * localKitchen.controller.js — Local Kitchen dashboard (#5, B2C).
 *
 * Operators at the normal/local kitchens (Marathahalli, Kalyan Nagar, Jayanagar,
 * and JP Nagar's own assembly op). Code role: LOCAL_KITCHEN. EVERY read/write is
 * BRANCH-SCOPED to req.user.branchCode (from the JWT) — Marathahalli never sees
 * Jayanagar's data.
 *
 * They receive dispatched sub-recipes from the base kitchen (Head Chef), do final
 * assembly, audit their own stock, and request replenishment (raw → Stock
 * Manager via an INVENTORY_TRANSFER indent; sub-recipe → Head Chef via a
 * subrecipe_dispatches REQUESTED row).
 *
 * PRODUCER dashboard: every WRITE appends one procurement_logs entry. NEVER
 * touches money (frozen). brand_stocks transfer pattern reused unchanged.
 */
import mongoose from "mongoose";
import User from "../models/user.js";
import BrandStock from "../models/brandStock.js";
import IngredientIndent from "../models/ingredientIndent.js";
import Projection from "../models/projection.js";
import MenuEntry from "../models/menuEntry.js";
import { stripDeletedMenuItems } from "../utils/menuVisibility.js";
import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import SubrecipeDispatch from "../models/subrecipeDispatch.js";
import ProducerAudit from "../models/producerAudit.js";
import Order from "../models/order.js";

import { escapeRegex } from "../utils/bomExpander.js";
import { getDishIterations } from "../utils/iterationFcr.js";
import { emitProcurementLog } from "../utils/procurementLog.js";
import {
  previewOrderCascade,
  applyOrderCascade,
  reverseOrderCascade,
} from "../utils/orderCascade.js";
import { buildAuditItems, reconcileAuditToLedger, normalizeAuditDate } from "../utils/producerAudit.js";
import { emitAuditLogs } from "./headChef.controller.js";

const brandExact = (brandName) => new RegExp(`^${escapeRegex(String(brandName || "").trim())}$`, "i");

// The kitchen branch this operator runs, from the JWT. Everything is scoped to it.
function kitchenBranch(req) {
  return String(req.user?.branchCode || "").trim().toUpperCase();
}

async function resolveBrandUser(brandName) {
  if (!String(brandName || "").trim()) return null;
  return User.findOne({ brandName: brandExact(brandName) }).select("brandName _id assignedBranches").lean();
}

// Confirm this brand is actually assigned to operate at this kitchen. Returns the
// lean User doc or null (and writes the response).
async function loadBrandForKitchen(req, res) {
  const branch = kitchenBranch(req);
  if (!branch) {
    res.status(400).json({ message: "No branch code on this account — contact admin" });
    return null;
  }
  const brand = await resolveBrandUser(req.params.brandName);
  if (!brand) {
    res.status(404).json({ message: "No client record for this brand" });
    return null;
  }
  const assigned = (brand.assignedBranches || []).map((b) => String(b).toUpperCase());
  if (!assigned.includes(branch)) {
    res.status(403).json({ message: "This brand is not assigned to your kitchen" });
    return null;
  }
  return brand;
}

/* ============================================================
 * 1. Brand list (assigned to this kitchen)
 * ========================================================== */
export async function getBrands(req, res) {
  try {
    const branch = kitchenBranch(req);
    if (!branch) return res.status(400).json({ message: "No branch code on this account — contact admin" });

    const clients = await User.find({
      brandName: { $exists: true, $nin: [null, ""] },
      assignedBranches: branch,
    })
      .select("brandName logoUrl lifecycleStage")
      .lean();

    const data = clients
      .map((c) => ({ brandName: c.brandName, logoUrl: c.logoUrl || null, lifecycleStage: c.lifecycleStage || null }))
      .sort((a, b) => a.brandName.localeCompare(b.brandName));
    return res.json({ success: true, data, branchCode: branch });
  } catch (err) {
    console.error("[LocalKitchen] getBrands error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load brands" });
  }
}

/* ============================================================
 * 2. Incoming dispatches
 * ========================================================== */
export async function getDispatches(req, res) {
  try {
    const branch = kitchenBranch(req);
    if (!branch) return res.status(400).json({ message: "No branch code on this account — contact admin" });

    const q = { toBranchCode: branch };
    if (req.query?.brandName && String(req.query.brandName).trim()) q.brandName = brandExact(req.query.brandName);
    if (req.query?.status && String(req.query.status).trim()) q.status = String(req.query.status).trim().toUpperCase();

    const list = await SubrecipeDispatch.find(q).sort({ createdAt: -1 }).limit(300).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[LocalKitchen] getDispatches error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load dispatches" });
  }
}

export async function acknowledgeDispatch(req, res) {
  try {
    const branch = kitchenBranch(req);
    if (!branch) return res.status(400).json({ message: "No branch code on this account — contact admin" });

    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) return res.status(400).json({ message: "Invalid dispatch id" });

    const status = String(req.body?.status || "").toUpperCase();
    if (!["RECEIVED", "DISCREPANCY"].includes(status)) {
      return res.status(400).json({ message: "status must be RECEIVED or DISCREPANCY" });
    }
    const discrepancyNote = String(req.body?.discrepancyNote || "").trim();

    // Atomic claim: only a DISPATCHED row addressed to THIS kitchen can be acted on.
    const dispatch = await SubrecipeDispatch.findOneAndUpdate(
      { _id: id, toBranchCode: branch, status: "DISPATCHED" },
      {
        $set: {
          status,
          receivedBy: req.user?._id || req.user?.adminId || null,
          receivedAt: new Date(),
          ...(status === "DISCREPANCY" ? { discrepancyNote } : {}),
        },
      },
      { new: true }
    );

    if (!dispatch) {
      const existing = await SubrecipeDispatch.findById(id).select("status toBranchCode").lean();
      if (!existing) return res.status(404).json({ message: "Dispatch not found" });
      if (existing.toBranchCode !== branch) return res.status(403).json({ message: "This dispatch is for another kitchen" });
      return res.status(409).json({ message: `Dispatch is "${existing.status}" — cannot acknowledge` });
    }

    // On RECEIVED, credit this kitchen's BRANCH_KITCHEN stock for the sub-recipe.
    if (status === "RECEIVED") {
      await BrandStock.findOneAndUpdate(
        { brandName: dispatch.brandName, itemName: dispatch.subRecipeName, location: "BRANCH_KITCHEN", branchCode: branch },
        {
          $setOnInsert: { uom: dispatch.uom || "", ownedBy: dispatch.brandName, inventoryManaged: true },
          $inc: { qtyRemaining: dispatch.qty },
          $push: {
            history: {
              type: "TRANSFER_IN",
              qty: dispatch.qty,
              uom: dispatch.uom || "",
              at: new Date(),
              referenceId: dispatch._id,
              referenceKind: "TRANSFER",
              fromBrandName: dispatch.brandName,
              actorRole: "LOCAL_KITCHEN",
              note: `Received sub-recipe dispatch from ${dispatch.fromBranchCode}`,
            },
          },
        },
        { upsert: true, new: true }
      );

      await emitProcurementLog({
        eventType: "SUBRECIPE_RECEIVED",
        req,
        brandName: dispatch.brandName,
        itemName: dispatch.subRecipeName,
        qty: dispatch.qty,
        uom: dispatch.uom,
        refId: dispatch._id,
        refCollection: "subrecipe_dispatches",
        metadata: { fromBranchCode: dispatch.fromBranchCode, toBranchCode: branch },
      });
    }

    return res.json({ success: true, data: dispatch });
  } catch (err) {
    console.error("[LocalKitchen] acknowledgeDispatch error:", err?.message || err);
    return res.status(500).json({ message: "Failed to acknowledge dispatch" });
  }
}

/* ============================================================
 * 3. Local stock (this kitchen's brand_stocks)
 * ========================================================== */
export async function getStock(req, res) {
  try {
    const brand = await loadBrandForKitchen(req, res);
    if (!brand) return;
    const branch = kitchenBranch(req);

    const rows = await BrandStock.find(
      { brandName: brandExact(brand.brandName), branchCode: branch, status: "Pending" },
      { itemName: 1, ingredientBrand: 1, uom: 1, qtyRemaining: 1, location: 1 }
    ).lean();

    rows.sort((a, b) => (a.location || "").localeCompare(b.location || "") || a.itemName.localeCompare(b.itemName));
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[LocalKitchen] getStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load stock" });
  }
}

/* ============================================================
 * 4. Daily Closing Stock Audit (branch-scoped, LOCAL scope)
 * ========================================================== */
async function localStockSnapshot(brandName, branch) {
  const rows = await BrandStock.find(
    { brandName: brandExact(brandName), branchCode: branch, status: "Pending", location: { $in: ["BRANCH_KITCHEN", "SEMI_FINISHED"] } },
    { itemName: 1, uom: 1, qtyRemaining: 1 }
  ).lean();
  // Group same item across locations.
  const map = new Map();
  for (const r of rows) {
    const key = String(r.itemName || "").trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, { itemName: r.itemName, uom: r.uom || "", qty: 0 });
    map.get(key).qty += Number(r.qtyRemaining || 0);
  }
  const snap = Array.from(map.values()).map((g) => ({
    itemName: g.itemName, uom: g.uom, expectedQty: Number(g.qty.toFixed(4)), actualQty: Number(g.qty.toFixed(4)), varianceQty: 0,
  }));
  snap.sort((a, b) => a.itemName.localeCompare(b.itemName));
  return snap;
}

export async function getAudit(req, res) {
  try {
    const brand = await loadBrandForKitchen(req, res);
    if (!brand) return;
    const branch = kitchenBranch(req);
    const dateObj = normalizeAuditDate(req.query?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const records = await ProducerAudit.find({ brandId: brand._id, branchCode: branch, scope: "LOCAL", date: dateObj })
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
            _id: r._id, correctionSeq: r.correctionSeq || 0, correctionOf: r.correctionOf || null,
            lockedAt: r.lockedAt || null, lockedBy: r.lockedBy || null, variances: r.variances || [],
          })),
        },
      });
    }

    const snapshot = await localStockSnapshot(brand.brandName, branch);
    return res.json({ success: true, data: { existing: false, brandName: brand.brandName, date: req.query.date, snapshot } });
  } catch (err) {
    console.error("[LocalKitchen] getAudit error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load audit" });
  }
}

export async function postAudit(req, res) {
  try {
    const brand = await loadBrandForKitchen(req, res);
    if (!brand) return;
    const branch = kitchenBranch(req);
    const dateObj = normalizeAuditDate(req.body?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const built = buildAuditItems(req.body?.items);
    if (!built.ok) return res.status(400).json({ message: built.error });

    const existing = await ProducerAudit.findOne({ brandId: brand._id, branchCode: branch, scope: "LOCAL", date: dateObj, correctionSeq: 0 }).lean();
    if (existing?.lockedAt) return res.status(409).json({ message: "This day's audit is locked. Use a correction instead." });

    const doc = await ProducerAudit.findOneAndUpdate(
      { brandId: brand._id, branchCode: branch, scope: "LOCAL", date: dateObj, correctionSeq: 0 },
      { $set: { brandName: String(brand.brandName).trim(), variances: built.items } },
      { upsert: true, new: true }
    ).lean();
    return res.json({ success: true, data: { _id: doc._id, locked: false } });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: "Audit for this brand/date already exists" });
    console.error("[LocalKitchen] postAudit error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save audit" });
  }
}

export async function lockAudit(req, res) {
  try {
    const brand = await loadBrandForKitchen(req, res);
    if (!brand) return;
    const branch = kitchenBranch(req);
    const dateObj = normalizeAuditDate(req.body?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const isCorrection = req.body?.correction === true;
    const original = await ProducerAudit.findOne({ brandId: brand._id, branchCode: branch, scope: "LOCAL", date: dateObj, correctionSeq: 0 });

    if (isCorrection) {
      if (!original) return res.status(404).json({ message: "No original audit to correct for this date" });
      if (!original.lockedAt) return res.status(409).json({ message: "Original audit is not locked yet — edit the draft instead" });

      const built = buildAuditItems(req.body?.items);
      if (!built.ok) return res.status(400).json({ message: built.error });

      const last = await ProducerAudit.find({ brandId: brand._id, branchCode: branch, scope: "LOCAL", date: dateObj })
        .sort({ correctionSeq: -1 }).limit(1).select("correctionSeq").lean();
      const nextSeq = (last[0]?.correctionSeq || 0) + 1;

      const doc = await ProducerAudit.create({
        brandId: brand._id, brandName: String(brand.brandName).trim(), branchCode: branch,
        scope: "LOCAL", date: dateObj, correctionSeq: nextSeq, correctionOf: original._id,
        variances: built.items, lockedAt: new Date(), lockedBy: req.user?._id || req.user?.adminId || null,
      });
      await reconcileAuditToLedger({ brandName: String(brand.brandName).trim(), branchCode: branch, location: ["BRANCH_KITCHEN", "SEMI_FINISHED"], items: built.items, req });
      await emitAuditLogs(req, brand.brandName, doc, "LOCAL_KITCHEN_AUDIT_LOCKED", req.body.date, nextSeq);
      return res.status(201).json({ success: true, data: { _id: doc._id, correctionSeq: nextSeq } });
    }

    if (!original) return res.status(404).json({ message: "No draft audit found — save it first" });
    if (original.lockedAt) return res.status(409).json({ message: "Audit already locked" });

    original.lockedAt = new Date();
    original.lockedBy = req.user?._id || req.user?.adminId || null;
    await original.save();
    await reconcileAuditToLedger({ brandName: String(brand.brandName).trim(), branchCode: branch, location: ["BRANCH_KITCHEN", "SEMI_FINISHED"], items: original.variances || [], req });
    await emitAuditLogs(req, brand.brandName, original, "LOCAL_KITCHEN_AUDIT_LOCKED", req.body.date, 0);
    return res.json({ success: true, data: { _id: original._id, lockedAt: original.lockedAt } });
  } catch (err) {
    console.error("[LocalKitchen] lockAudit error:", err?.message || err);
    return res.status(500).json({ message: "Failed to lock audit" });
  }
}

/* ============================================================
 * 5. Request Replenishment (routed by type)
 * ========================================================== */
export async function postIndent(req, res) {
  try {
    const branch = kitchenBranch(req);
    if (!branch) return res.status(400).json({ message: "No branch code on this account — contact admin" });

    const brandName = String(req.body?.brandName || "").trim();
    const requestType = String(req.body?.requestType || "").toUpperCase();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!brandName) return res.status(400).json({ message: "brandName is required" });
    if (!["RAW_INGREDIENT", "SUB_RECIPE"].includes(requestType)) {
      return res.status(400).json({ message: "requestType must be RAW_INGREDIENT or SUB_RECIPE" });
    }
    if (items.length === 0) return res.status(400).json({ message: "items[] is required" });

    const brand = await resolveBrandUser(brandName);
    const assigned = (brand?.assignedBranches || []).map((b) => String(b).toUpperCase());
    if (!brand || !assigned.includes(branch)) {
      return res.status(403).json({ message: "This brand is not assigned to your kitchen" });
    }

    const now = new Date();
    let created;

    if (requestType === "RAW_INGREDIENT") {
      // INVENTORY_TRANSFER indent routed to the Stock Manager — relocate warehouse
      // stock to THIS kitchen. Reuses the existing indent shape unchanged.
      const docs = items
        .map((r) => ({
          requestBrandName: brandName,
          clientBrandId: brand._id,
          clientBrandName: brandName,
          recipeId: null,
          recipeKind: "manual",
          recipeName: "Local Kitchen Replenishment",
          branchCode: branch,
          indentType: "INVENTORY_TRANSFER",
          sourceBranchCode: req.user?.warehouseId || "",
          itemName: String(r.itemName || "").trim(),
          ingredientBrand: String(r.ingredientBrand || "").trim(),
          uom: String(r.uom || ""),
          qty: Number(r.qty || 0),
          cost: 0,
          status: "INDENT_PENDING",
        }))
        .filter((d) => d.itemName);
      if (docs.length === 0) return res.status(400).json({ message: "Each item needs an itemName" });
      created = await IngredientIndent.insertMany(docs, { ordered: false });
    } else {
      // SUB_RECIPE request → a subrecipe_dispatches REQUESTED row for the Head Chef.
      const docs = items
        .map((r) => ({
          brandName,
          subRecipeName: String(r.itemName || "").trim(),
          qty: Number(r.qty || 0),
          uom: String(r.uom || ""),
          fromBranchCode: "JPNAGAR",
          toBranchCode: branch,
          status: "REQUESTED",
          requestedBy: req.user?._id || req.user?.adminId || null,
          requestedAt: now,
        }))
        .filter((d) => d.subRecipeName);
      if (docs.length === 0) return res.status(400).json({ message: "Each item needs a sub-recipe name" });
      created = await SubrecipeDispatch.insertMany(docs, { ordered: false });
    }

    await emitProcurementLog({
      eventType: "LOCAL_KITCHEN_INDENT_RAISED",
      req,
      brandName,
      qty: null,
      refCollection: requestType === "RAW_INGREDIENT" ? "ingredient_indents" : "subrecipe_dispatches",
      metadata: { requestType, branchCode: branch, count: created.length, items: items.map((i) => i.itemName) },
    });

    return res.status(201).json({ success: true, count: created.length, requestType });
  } catch (err) {
    console.error("[LocalKitchen] postIndent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to raise request" });
  }
}

export async function getIndents(req, res) {
  try {
    const branch = kitchenBranch(req);
    if (!branch) return res.status(400).json({ message: "No branch code on this account — contact admin" });
    const { brandName, status } = req.query || {};

    const indentQ = { branchCode: branch, recipeName: "Local Kitchen Replenishment" };
    if (brandName && String(brandName).trim()) indentQ.requestBrandName = brandExact(brandName);
    if (status && String(status).trim()) indentQ.status = String(status).trim();
    const rawIndents = await IngredientIndent.find(indentQ).sort({ createdAt: -1 }).limit(200).lean();

    const subQ = { toBranchCode: branch };
    if (brandName && String(brandName).trim()) subQ.brandName = brandExact(brandName);
    // Only this kitchen's own requests (those it raised) — REQUESTED/DISPATCHED/etc.
    const subRequests = await SubrecipeDispatch.find({ ...subQ, requestedBy: { $ne: null } }).sort({ createdAt: -1 }).limit(200).lean();

    return res.json({ success: true, data: { rawIngredient: rawIndents, subRecipe: subRequests } });
  } catch (err) {
    console.error("[LocalKitchen] getIndents error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load requests" });
  }
}

/* ============================================================
 * 6. Read-only views (recipes / menu / projections / fcr)
 * ========================================================== */
export async function getRecipes(req, res) {
  try {
    const brand = await loadBrandForKitchen(req, res);
    if (!brand) return;
    const [mains, subs] = await Promise.all([
      MainRecipe.find({ brand: brandExact(brand.brandName) }, { recipeName: 1, items: 1, sopLink: 1 }).sort({ recipeName: 1 }).lean(),
      SubRecipe.find({ brand: brandExact(brand.brandName) }, { recipeName: 1, yield: 1, items: 1 }).sort({ recipeName: 1 }).lean(),
    ]);
    return res.json({ success: true, data: { mainRecipes: mains, subRecipes: subs } });
  } catch (err) {
    console.error("[LocalKitchen] getRecipes error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load recipes" });
  }
}

export async function getMenu(req, res) {
  try {
    const brand = await loadBrandForKitchen(req, res);
    if (!brand) return;
    const branch = kitchenBranch(req);
    // Branch-scoped: only this kitchen's menu entries.
    const list = await MenuEntry.find({ clientId: brand._id, branchCode: branch }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: stripDeletedMenuItems(list) });
  } catch (err) {
    console.error("[LocalKitchen] getMenu error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load menu" });
  }
}

export async function getProjections(req, res) {
  try {
    const brand = await loadBrandForKitchen(req, res);
    if (!brand) return;
    const branch = kitchenBranch(req);
    const list = await Projection.find({ brandId: brand._id, branchCode: branch }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[LocalKitchen] getProjections error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load projections" });
  }
}

export async function getFcr(req, res) {
  try {
    const brand = await loadBrandForKitchen(req, res);
    if (!brand) return;
    const dishes = await getDishIterations(brand.brandName);
    return res.json({ success: true, data: dishes });
  } catch (err) {
    console.error("[LocalKitchen] getFcr error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load FCR" });
  }
}

/* ============================================================
 * 7. Manual Order Entry (CLAUDE.md §25)
 *
 * Replaces the (leadership-pending) Rista integration with manual order capture
 * at the kitchen. Every recorded order fires the stock cascade (orderCascade.js,
 * which replicates the production-order deduction pattern — applyStockCascade
 * itself is untouched). Dropdown-only: orders can ONLY be recorded for dishes
 * that already exist as a MainRecipe for the brand. A dish not yet in MainRecipe
 * cannot be recorded — known, accepted limitation for this build.
 *
 * Definition: "order" = one dish unit. A qty-3 entry counts as 3 orders in totals
 * (consistent with the client analytics reroute).
 * ========================================================== */

const ORDER_SOURCES = ["WALK_IN", "SWIGGY", "ZOMATO", "OWNLY", "OTHER"];
const ORDER_TIME_BUCKETS = ["MORNING", "AFTERNOON", "EVENING", "LATE_NIGHT"];
const ORDER_BACKDATE_DAYS = 7;       // how far back an order may be dated
const ORDER_DELETE_WINDOW_MIN = 30;  // delete/reverse only within this many minutes

// Validate a brandName (from the request body) is assigned to THIS kitchen.
// Returns the brand User doc, or null after writing the error response.
async function loadBrandFromBody(req, res, brandName) {
  const branch = kitchenBranch(req);
  if (!branch) {
    res.status(400).json({ message: "No branch code on this account — contact admin" });
    return null;
  }
  if (!String(brandName || "").trim()) {
    res.status(400).json({ message: "brandName is required" });
    return null;
  }
  const brand = await resolveBrandUser(brandName);
  if (!brand) {
    res.status(404).json({ message: "No client record for this brand" });
    return null;
  }
  const assigned = (brand.assignedBranches || []).map((b) => String(b).toUpperCase());
  if (!assigned.includes(branch)) {
    res.status(403).json({ message: "Brand not served by this kitchen" });
    return null;
  }
  return brand;
}

// UTC start-of-day range for a normalized order date.
function dayRange(dateObj) {
  const start = new Date(dateObj);
  const end = new Date(dateObj);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * GET /api/local-kitchen/recipes-for-orders?brandName=
 * Dropdown options (recipeId + name) for the brand the chef is recording against.
 */
export async function getRecipesForOrders(req, res) {
  try {
    const brand = await loadBrandFromBody(req, res, req.query?.brandName);
    if (!brand) return;
    const recipes = await MainRecipe.find(
      { brand: brandExact(brand.brandName) },
      { recipeName: 1 }
    ).sort({ recipeName: 1 }).lean();
    const data = recipes.map((r) => ({ recipeId: r._id, recipeName: r.recipeName }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[LocalKitchen] getRecipesForOrders error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load dishes" });
  }
}

/**
 * POST /api/local-kitchen/orders
 * Record a manual order; fires the stock cascade at this kitchen's branch.
 */
export async function postOrder(req, res) {
  try {
    const branch = kitchenBranch(req);
    if (!branch) return res.status(400).json({ message: "No branch code on this account — contact admin" });

    const {
      brandName, recipeId, qty, unitPrice, source, timeBucket,
      orderDate, override, overrideReason,
    } = req.body || {};

    const brand = await loadBrandFromBody(req, res, brandName);
    if (!brand) return;

    // Field validation
    if (!recipeId || !/^[0-9a-fA-F]{24}$/.test(String(recipeId))) {
      return res.status(400).json({ message: "A valid dish (recipeId) is required" });
    }
    const qtyNum = Number(qty);
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      return res.status(400).json({ message: "qty must be a whole number of at least 1" });
    }
    const priceNum = Number(unitPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return res.status(400).json({ message: "unitPrice must be 0 or more" });
    }
    if (!ORDER_SOURCES.includes(String(source))) {
      return res.status(400).json({ message: `source must be one of ${ORDER_SOURCES.join(", ")}` });
    }
    if (!ORDER_TIME_BUCKETS.includes(String(timeBucket))) {
      return res.status(400).json({ message: `timeBucket must be one of ${ORDER_TIME_BUCKETS.join(", ")}` });
    }

    // Order date: default today (UTC), allow up to 7 days back, never in the future.
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateStr = orderDate ? String(orderDate).trim() : todayStr;
    const dateObj = normalizeAuditDate(dateStr);
    if (!dateObj) return res.status(400).json({ message: "orderDate must be YYYY-MM-DD" });
    const today = normalizeAuditDate(todayStr);
    const diffDays = Math.round((today.getTime() - dateObj.getTime()) / 86400000);
    if (diffDays < 0) return res.status(400).json({ message: "orderDate cannot be in the future" });
    if (diffDays > ORDER_BACKDATE_DAYS) {
      return res.status(400).json({ message: `orderDate can be at most ${ORDER_BACKDATE_DAYS} days back` });
    }

    // Dish must exist as a MainRecipe for this brand (dropdown-only contract).
    const recipe = await MainRecipe.findOne({
      _id: recipeId,
      brand: brandExact(brand.brandName),
    }).select("recipeName").lean();
    if (!recipe) return res.status(404).json({ message: "Dish not found for this brand" });

    const isOverride = override === true;
    const totalAmount = Number((qtyNum * priceNum).toFixed(2));

    // Pre-check the cascade (pure read). Soft-block unless overriding.
    const preview = await previewOrderCascade({
      brandName: brand.brandName, branchCode: branch, recipeId, qty: qtyNum,
    });
    if (preview.recipeMissing) {
      return res.status(404).json({ message: "Dish recipe could not be expanded" });
    }
    if (!preview.canFulfil && !isOverride) {
      return res.status(409).json({
        blocked: true,
        reason: "INSUFFICIENT_STOCK",
        items: preview.insufficientItems,
      });
    }

    // Override requires a non-empty reason.
    const reason = String(overrideReason || "").trim();
    if (isOverride && !preview.canFulfil && !reason) {
      return res.status(400).json({ message: "overrideReason is required when overriding insufficient stock" });
    }

    // cascadeApplied is true only when stock genuinely covered the order.
    const cascadeApplied = preview.canFulfil;

    // Atomic: order insert + all stock debits commit/rollback together.
    const session = await mongoose.startSession();
    let savedOrder;
    try {
      await session.withTransaction(async () => {
        const created = await Order.create([{
          entryType: "MANUAL_LOCAL",
          brand: brand._id,           // legacy required field = brandId
          brandId: brand._id,
          brandName: brand.brandName,
          branchCode: branch,
          recipeId,
          recipeName: recipe.recipeName,
          qty: qtyNum,
          unitPrice: priceNum,
          totalAmount,
          amount: totalAmount,        // legacy field kept in sync
          source: String(source),
          timeBucket: String(timeBucket),
          orderDate: dateObj,
          enteredBy: req.user?._id || req.user?.adminId || null,
          enteredAt: new Date(),
          cascadeApplied,
          overrideReason: cascadeApplied ? "" : reason,
          status: "COMPLETED",
        }], { session });

        const order = created[0];

        const { deductions } = await applyOrderCascade({
          brandName: brand.brandName,
          branchCode: branch,
          recipeId,
          qty: qtyNum,
          orderId: order._id,
          allowNegative: isOverride,
          session,
        });

        order.cascadeDeductions = deductions;
        await order.save({ session });
        savedOrder = order;
      });
    } finally {
      await session.endSession();
    }

    await emitProcurementLog({
      eventType: "ORDER_INGESTED",
      req,
      brandName: brand.brandName,
      qty: qtyNum,
      refId: savedOrder._id,
      refCollection: "orders",
      metadata: {
        branchCode: branch,
        recipeName: recipe.recipeName,
        qty: qtyNum,
        totalAmount,
        source: String(source),
        timeBucket: String(timeBucket),
        orderDate: dateStr,
        override: isOverride && !cascadeApplied,
      },
    });

    return res.status(201).json({ success: true, data: savedOrder });
  } catch (err) {
    console.error("[LocalKitchen] postOrder error:", err?.message || err);
    return res.status(500).json({ message: "Failed to record order" });
  }
}

/**
 * GET /api/local-kitchen/orders?date=&brandName=
 * Today's (or a given day's) orders for this kitchen, grouped by recipe + bucket.
 * totalOrders = Σ qty (one dish unit = one order).
 */
export async function getOrders(req, res) {
  try {
    const branch = kitchenBranch(req);
    if (!branch) return res.status(400).json({ message: "No branch code on this account — contact admin" });

    const dateStr = req.query?.date ? String(req.query.date).trim() : new Date().toISOString().slice(0, 10);
    const dateObj = normalizeAuditDate(dateStr);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    const { start, end } = dayRange(dateObj);

    const q = {
      entryType: "MANUAL_LOCAL",
      branchCode: branch,
      orderDate: { $gte: start, $lt: end },
    };
    if (req.query?.brandName && String(req.query.brandName).trim()) {
      q.brandName = brandExact(req.query.brandName);
    }

    const orders = await Order.find(q).sort({ enteredAt: 1 }).lean();

    const emptyBuckets = () => {
      const b = {};
      ORDER_TIME_BUCKETS.forEach((k) => { b[k] = { qty: 0, totalRevenue: 0 }; });
      return b;
    };

    const byRecipe = new Map();
    let totalOrders = 0;
    let totalRevenue = 0;

    for (const o of orders) {
      const key = String(o.recipeId || o.recipeName);
      if (!byRecipe.has(key)) {
        byRecipe.set(key, {
          recipeName: o.recipeName,
          recipeId: o.recipeId,
          bucketBreakdown: emptyBuckets(),
          totalQty: 0,
          totalRevenue: 0,
          entries: [],
        });
      }
      const g = byRecipe.get(key);
      const bucket = ORDER_TIME_BUCKETS.includes(o.timeBucket) ? o.timeBucket : "MORNING";
      g.bucketBreakdown[bucket].qty += Number(o.qty || 0);
      g.bucketBreakdown[bucket].totalRevenue += Number(o.totalAmount || 0);
      g.totalQty += Number(o.qty || 0);
      g.totalRevenue += Number(o.totalAmount || 0);
      g.entries.push({
        _id: o._id,
        qty: o.qty,
        unitPrice: o.unitPrice,
        totalAmount: o.totalAmount,
        source: o.source,
        timeBucket: o.timeBucket,
        enteredAt: o.enteredAt,
        cascadeApplied: o.cascadeApplied,
        overrideReason: o.overrideReason,
      });

      totalOrders += Number(o.qty || 0);
      totalRevenue += Number(o.totalAmount || 0);
    }

    const data = [...byRecipe.values()].sort((a, b) => a.recipeName.localeCompare(b.recipeName));

    return res.json({
      success: true,
      summary: { totalOrders, totalRevenue: Number(totalRevenue.toFixed(2)), date: dateStr },
      data,
    });
  } catch (err) {
    console.error("[LocalKitchen] getOrders error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load orders" });
  }
}

/**
 * DELETE /api/local-kitchen/orders/:orderId
 * Correct a just-entered mistake. Allowed only within ORDER_DELETE_WINDOW_MIN of
 * entry. Reverses the cascade (credits the deducted ingredients back) then deletes.
 */
export async function deleteOrder(req, res) {
  try {
    const branch = kitchenBranch(req);
    if (!branch) return res.status(400).json({ message: "No branch code on this account — contact admin" });

    const { orderId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(orderId))) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    const order = await Order.findOne({ _id: orderId, entryType: "MANUAL_LOCAL", branchCode: branch });
    if (!order) return res.status(404).json({ message: "Order not found for this kitchen" });

    const ageMin = (Date.now() - new Date(order.enteredAt || order.createdAt).getTime()) / 60000;
    if (ageMin > ORDER_DELETE_WINDOW_MIN) {
      return res.status(409).json({
        message: `Orders can only be deleted within ${ORDER_DELETE_WINDOW_MIN} minutes of entry`,
      });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await reverseOrderCascade({
          deductions: order.cascadeDeductions || [],
          orderId: order._id,
          recipeName: order.recipeName,
          session,
        });
        await Order.deleteOne({ _id: order._id }, { session });
      });
    } finally {
      await session.endSession();
    }

    await emitProcurementLog({
      eventType: "ORDER_REVERSED",
      req,
      brandName: order.brandName,
      qty: order.qty,
      refId: order._id,
      refCollection: "orders",
      metadata: {
        branchCode: branch,
        recipeName: order.recipeName,
        qty: order.qty,
        totalAmount: order.totalAmount,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[LocalKitchen] deleteOrder error:", err?.message || err);
    return res.status(500).json({ message: "Failed to delete order" });
  }
}
