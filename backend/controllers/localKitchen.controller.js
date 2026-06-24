/**
 * localKitchen.controller.js — Local Kitchen dashboard (#5, B2C).
 *
 * Operators at the normal/local kitchens (Marathahalli, Kalyan Nagar, and JP
 * Nagar's own assembly op). Code role: LOCAL_KITCHEN. EVERY read/write is
 * BRANCH-SCOPED to req.user.branchCode (from the JWT) — Marathahalli never sees
 * Kalyan's data.
 *
 * They receive dispatched sub-recipes from the base kitchen (Head Chef), do final
 * assembly, audit their own stock, and request replenishment (raw → Stock
 * Manager via an INVENTORY_TRANSFER indent; sub-recipe → Head Chef via a
 * subrecipe_dispatches REQUESTED row).
 *
 * PRODUCER dashboard: every WRITE appends one procurement_logs entry. NEVER
 * touches money (frozen). brand_stocks transfer pattern reused unchanged.
 */
import User from "../models/user.js";
import BrandStock from "../models/brandStock.js";
import IngredientIndent from "../models/ingredientIndent.js";
import Projection from "../models/projection.js";
import MenuEntry from "../models/menuEntry.js";
import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import SubrecipeDispatch from "../models/subrecipeDispatch.js";
import ProducerAudit from "../models/producerAudit.js";

import { escapeRegex } from "../utils/bomExpander.js";
import { getDishIterations } from "../utils/iterationFcr.js";
import { emitProcurementLog } from "../utils/procurementLog.js";
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
    return res.json({ success: true, data: list });
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
