/**
 * headChef.controller.js — Head Chef dashboard (#4, base kitchen JP Nagar).
 *
 * Code role: RECIPE_MANAGER (no new role). The Head Chef owns recipe lifecycle
 * (Main/Sub/Trial/Training), promotes training recipes to Final, plans bulk
 * sub-recipe production, dispatches finished sub-recipes to the local kitchens,
 * raises indents + vendor alerts to the Stock Manager, audits SEMI_FINISHED
 * stock, sends ingredient lists to the POC, and reconciles vs Rista POS.
 *
 * PRODUCER dashboard: every WRITE path appends exactly one procurement_logs entry
 * (the Data Analyst dashboard's read source). See emitProcurementLog().
 *
 * UNTOUCHED / FROZEN (verified): applyStockCascade, expandItem, bomExpander,
 * brand_stocks schema, purchase_register schema/FEFO, recipe schemas, wallet/
 * money. Recipe/trial/training CRUD is REUSED from the existing RECIPE_MANAGER-
 * gated routes (/api/mainrecipes, /api/subrecipes, /api/trial-recipes,
 * /api/training-recipes, /api/ingredient-indent) — this controller adds only the
 * NEW Head-Chef-specific endpoints.
 */
import mongoose from "mongoose";

import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import TrialRecipe from "../models/trialRecipe.models.js";
import TrainingRecipe from "../models/trainingRecipe.models.js";
import FcrConfirmation from "../models/fcrConfirmation.js";
import IngredientIndent from "../models/ingredientIndent.js";
import BrandStock from "../models/brandStock.js";
import DeliveryQc from "../models/deliveryQc.js";
import CreditNoteAlert from "../models/creditNoteAlert.js";
import Projection from "../models/projection.js";
import MenuEntry from "../models/menuEntry.js";
import User from "../models/user.js";
import ItemMaster from "../models/itemMaster.js";
import SubrecipeDispatch from "../models/subrecipeDispatch.js";
import IngredientListToPoc from "../models/ingredientListToPoc.js";
import ProducerAudit from "../models/producerAudit.js";

import { escapeRegex, extractIngredientsFromBOM, aggregateIngredients } from "../utils/bomExpander.js";
import { getWarehouseStockAvailable } from "./purchaseRegister.controller.js";
import { getDishIterations } from "../utils/iterationFcr.js";
import { emitProcurementLog } from "../utils/procurementLog.js";
import { buildAuditItems, reconcileAuditToLedger, normalizeAuditDate } from "../utils/producerAudit.js";
import { ristaClient } from "../ristaClient.js";
import {
  buildTemplateWorkbook,
  parseWorkbook,
  validateImport,
  importToken,
} from "../utils/recipeImport.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_BRANCH = "JPNAGAR"; // base kitchen in B2C (default when no branch on JWT)

// The base kitchen is wherever THIS Head Chef is — their JWT branchCode (e.g.
// JPNAGAR in prod, TESTBRANCH in the test env). SEMI_FINISHED stock, dispatch
// source, and the base audit all scope to it.
const baseBranchOf = (req) => String(req.user?.branchCode || BASE_BRANCH).toUpperCase();
const TRIAL_CODES = ["T1", "T2", "T3"];
const TRAINING_CODES = ["TR1", "TR2", "TR3"];

// Anchored, case-insensitive EXACT brand match — never substring (no cross-brand leak).
const brandExact = (brandName) => new RegExp(`^${escapeRegex(String(brandName || "").trim())}$`, "i");

// Resolve a brand's client User record (for menu/projection/audit ownership).
async function resolveBrandUser(brandName) {
  if (!String(brandName || "").trim()) return null;
  return User.findOne({ brandName: brandExact(brandName) }).select("brandName _id assignedBranches").lean();
}

// Kitchen branchCode → Rista branch code. Only the mapped ones are wired; unknown
// kitchens fall through to a graceful "not configured" empty state.
const RISTA_BRANCH = { JPNAGAR: "BEN", MARATHAHALLI: "MAR" };

/* ============================================================
 * 1. Brand picker / home
 * ========================================================== */
export async function getBrandsSummary(req, res) {
  try {
    const clients = await User.find({ brandName: { $exists: true, $nin: [null, ""] } })
      .select("brandName logoUrl lifecycleStage")
      .lean();

    // Pre-aggregate the per-brand counts we can do in one pass each.
    const mainAgg = await MainRecipe.aggregate([
      { $group: { _id: { $toLower: "$brand" }, n: { $sum: 1 } } },
    ]);
    const trialAgg = await TrialRecipe.aggregate([{ $group: { _id: { $toLower: "$brand" }, n: { $sum: 1 } } }]);
    const trainAgg = await TrainingRecipe.aggregate([{ $group: { _id: { $toLower: "$brand" }, n: { $sum: 1 } } }]);
    const confAgg = await FcrConfirmation.aggregate([
      { $match: { confirmed: true } },
      { $group: { _id: { brand: { $toLower: "$brandName" }, phase: "$phase" }, n: { $sum: 1 } } },
    ]);
    const indentAgg = await IngredientIndent.aggregate([
      { $match: { status: { $in: ["INDENT_PENDING", "INDENT_VERIFIED", "INDENT_ISSUING"] } } },
      { $group: { _id: { $toLower: "$requestBrandName" }, n: { $sum: 1 } } },
    ]);
    const qcAgg = await DeliveryQc.aggregate([
      { $match: { qcStatus: { $in: ["SHORT", "REJECTED"] } } },
      { $group: { _id: { $toLower: "$brandName" }, n: { $sum: 1 } } },
    ]);

    const toMap = (agg) => new Map(agg.map((r) => [r._id, r.n]));
    const mainMap = toMap(mainAgg);
    const trialMap = toMap(trialAgg);
    const trainMap = toMap(trainAgg);
    const indentMap = toMap(indentAgg);
    const qcMap = toMap(qcAgg);
    const confMap = new Map(); // `${brand}|${phase}` → n
    for (const r of confAgg) confMap.set(`${r._id.brand}|${r._id.phase}`, r.n);

    const summary = clients.map((c) => {
      const key = String(c.brandName).trim().toLowerCase();
      const trials = trialMap.get(key) || 0;
      const trainings = trainMap.get(key) || 0;
      const trialsConfirmed = confMap.get(`${key}|TRIAL`) || 0;
      const trainingsConfirmed = confMap.get(`${key}|TRAINING`) || 0;
      const finalsConfirmed = confMap.get(`${key}|FINAL`) || 0;
      return {
        brandName: c.brandName,
        clientId: String(c._id),
        logoUrl: c.logoUrl || null,
        lifecycleStage: c.lifecycleStage || null,
        mainRecipes: mainMap.get(key) || 0,
        pendingTrials: Math.max(0, trials - trialsConfirmed),
        pendingTraining: Math.max(0, trainings - trainingsConfirmed),
        confirmedFinals: finalsConfirmed,
        pendingIndents: indentMap.get(key) || 0,
        qcFailures: qcMap.get(key) || 0,
      };
    });

    summary.sort((a, b) => a.brandName.localeCompare(b.brandName));
    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error("[HeadChef] getBrandsSummary error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load brand summary" });
  }
}

/* ============================================================
 * 2. Ingredient catalog — Head Chef adds new ingredient rows
 * ========================================================== */
export async function addIngredient(req, res) {
  try {
    const itemName = String(req.body?.itemName || "").trim();
    if (!itemName) return res.status(400).json({ message: "itemName is required" });
    const uom = String(req.body?.uom || "").trim();
    const ingredientBrand = String(req.body?.ingredientBrand || "").trim();
    const brandSpec = String(req.body?.brandSpec || "").trim();

    // Don't duplicate an existing catalog row (case-insensitive).
    const existing = await ItemMaster.findOne({
      itemName: new RegExp(`^${escapeRegex(itemName)}$`, "i"),
    }).select("_id").lean();
    if (existing) return res.status(409).json({ message: "An ingredient with this name already exists" });

    // shelfLifeDays / minStockLevel left null — the Stock Manager owns those.
    const doc = await ItemMaster.create({ itemName, uom, ingredientBrand, brandSpec });
    return res.status(201).json({ success: true, data: { _id: doc._id, itemName, uom } });
  } catch (err) {
    console.error("[HeadChef] addIngredient error:", err?.message || err);
    return res.status(500).json({ message: "Failed to add ingredient" });
  }
}

/* ============================================================
 * 3. Ingredient List → POC (trial/training procurement handoff)
 * ========================================================== */
export async function sendIngredientListToPoc(req, res) {
  try {
    const { clientId } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(clientId))) return res.status(400).json({ message: "Invalid clientId" });

    const client = await User.findById(clientId).select("brandName").lean();
    if (!client?.brandName) return res.status(404).json({ message: "Client brand not found" });

    const phase = String(req.body?.phase || "").toUpperCase();
    const code = String(req.body?.code || "").toUpperCase();
    if (!["TRIAL", "TRAINING"].includes(phase)) return res.status(400).json({ message: "phase must be TRIAL or TRAINING" });
    const validCodes = phase === "TRIAL" ? TRIAL_CODES : TRAINING_CODES;
    if (!validCodes.includes(code)) return res.status(400).json({ message: `code must be one of ${validCodes.join("/")}` });

    const Model = phase === "TRIAL" ? TrialRecipe : TrainingRecipe;
    const codeField = phase === "TRIAL" ? "trialCode" : "trainingCode";
    // recipeName disambiguates WHICH dish to send when a brand has multiple
    // recipes at the same code (e.g. several T1 trials). Optional & backward-
    // compatible: when omitted, falls back to the first match (legacy behavior).
    const recipeName = String(req.body?.recipeName || "").trim();
    const query = { brand: brandExact(client.brandName), [codeField]: code };
    if (recipeName) query.recipeName = new RegExp(`^${escapeRegex(recipeName)}$`, "i");
    const recipe = await Model.findOne(query).lean();
    if (!recipe) {
      return res.status(404).json({
        message: recipeName
          ? `No ${phase.toLowerCase()} ${code} recipe named "${recipeName}" for this brand`
          : `No ${phase.toLowerCase()} ${code} recipe exists for this brand yet`,
      });
    }

    const leaves = await extractIngredientsFromBOM(recipe.items, 1, client.brandName, new Set());
    const items = Array.from(aggregateIngredients(leaves).values()).map((d) => ({
      itemName: d.itemName,
      qty: Number(Number(d.qty || 0).toFixed(4)),
      uom: d.uom || "",
      refId: d.itemName,
    }));
    if (items.length === 0) {
      return res.status(400).json({ message: "That recipe has no ingredients to send" });
    }

    const now = new Date();
    const doc = await IngredientListToPoc.create({
      brandName: client.brandName,
      clientId: client._id,
      phase,
      code,
      recipeName: recipe.recipeName || "",
      items,
      sentBy: req.user?._id || req.user?.adminId || null,
      sentAt: now,
    });

    await emitProcurementLog({
      eventType: "INGREDIENT_LIST_SENT_TO_POC",
      req,
      brandName: client.brandName,
      refId: doc._id,
      refCollection: "ingredient_lists_to_poc",
      metadata: { phase, code, recipeName: recipe.recipeName, itemCount: items.length },
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error("[HeadChef] sendIngredientListToPoc error:", err?.message || err);
    return res.status(500).json({ message: "Failed to send ingredient list" });
  }
}

/* ============================================================
 * 4. Promote training recipe → Final (MainRecipe)
 * ========================================================== */
export async function promoteToFinal(req, res) {
  try {
    const brandName = String(req.body?.brandName || "").trim();
    const recipeName = String(req.body?.recipeName || "").trim();
    const sourceCode = String(req.body?.sourceCode || "").toUpperCase();
    if (!brandName || !recipeName) return res.status(400).json({ message: "brandName and recipeName are required" });
    if (!TRAINING_CODES.includes(sourceCode)) return res.status(400).json({ message: `sourceCode must be one of ${TRAINING_CODES.join("/")}` });

    const training = await TrainingRecipe.findOne({
      brand: brandExact(brandName),
      recipeName: new RegExp(`^${escapeRegex(recipeName)}$`, "i"),
      trainingCode: sourceCode,
    }).lean();
    if (!training) {
      return res.status(404).json({ message: `No ${sourceCode} training recipe found for "${recipeName}"` });
    }

    // Copy the BOM verbatim (refId/qty/uom/yield/netPrice/type/category/etc).
    const items = (training.items || []).map((it) => ({
      type: it.type,
      category: it.category,
      refId: it.refId,
      yield: it.yield,
      itemBrand: it.itemBrand,
      specification: it.specification,
      quantity: it.quantity,
      uom: it.uom,
      netPrice: it.netPrice,
    }));

    const existing = await MainRecipe.findOne({
      brand: brandExact(brandName),
      recipeName: new RegExp(`^${escapeRegex(recipeName)}$`, "i"),
    });

    let mainRecipe;
    let action;
    if (existing) {
      existing.items = items;
      if (training.sopLink) existing.sopLink = training.sopLink;
      mainRecipe = await existing.save();
      action = "UPDATED";
    } else {
      mainRecipe = await MainRecipe.create({
        brand: brandName,
        recipeName,
        sopLink: training.sopLink || "",
        items,
      });
      action = "CREATED";
    }

    await emitProcurementLog({
      eventType: "RECIPE_PROMOTED",
      req,
      brandName,
      refId: mainRecipe._id,
      refCollection: "mainrecipes",
      metadata: { recipeName, sourceCode, action, mainRecipeId: String(mainRecipe._id) },
    });

    return res.json({ success: true, data: { _id: mainRecipe._id, recipeName, action } });
  } catch (err) {
    console.error("[HeadChef] promoteToFinal error:", err?.message || err);
    return res.status(500).json({ message: "Failed to promote recipe" });
  }
}

/* ============================================================
 * 5. Production Planning (read-only intelligence)
 * ========================================================== */
export async function getProductionPlan(req, res) {
  try {
    const brandName = String(req.query?.brandName || "").trim();
    if (!brandName) return res.status(400).json({ message: "brandName is required" });
    const dateObj = normalizeAuditDate(req.query?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const dayStart = dateObj;
    const dayEnd = new Date(dateObj.getTime() + DAY_MS - 1);

    const projections = await Projection.find({
      brandName: brandExact(brandName),
      status: "CHEF_CONFIRMED",
      forDate: { $gte: dayStart, $lte: dayEnd },
    }).lean();

    // Cache MainRecipe lookups per dish.
    const recipeCache = new Map();
    const getRecipe = async (recipeName) => {
      const key = recipeName.toLowerCase();
      if (recipeCache.has(key)) return recipeCache.get(key);
      const r = await MainRecipe.findOne({
        brand: brandExact(brandName),
        recipeName: new RegExp(`^${escapeRegex(recipeName)}$`, "i"),
      }).lean();
      recipeCache.set(key, r);
      return r;
    };

    // subRecipeName → { uom, total, perKitchen: Map(branchCode → qty) }
    const plan = new Map();
    for (const proj of projections) {
      const branchCode = String(proj.branchCode || "").toUpperCase();
      for (const pItem of proj.items || []) {
        const recipe = await getRecipe(String(pItem.recipeName || ""));
        if (!recipe) continue;
        const dishQty = Number(pItem.targetQty || 0);
        if (dishQty <= 0) continue;
        for (const ri of recipe.items || []) {
          if (String(ri.type).toUpperCase() !== "SUBRECIPE") continue;
          const subName = String(ri.refId || "").trim();
          if (!subName) continue;
          const required = Number(ri.quantity || 0) * dishQty;
          if (required <= 0) continue;
          const key = subName.toLowerCase();
          if (!plan.has(key)) plan.set(key, { subRecipeName: subName, uom: ri.uom || "", total: 0, perKitchen: new Map() });
          const g = plan.get(key);
          g.total += required;
          g.perKitchen.set(branchCode, (g.perKitchen.get(branchCode) || 0) + required);
        }
      }
    }

    const data = Array.from(plan.values()).map((g) => ({
      subRecipeName: g.subRecipeName,
      totalRequiredQty: Number(g.total.toFixed(4)),
      uom: g.uom,
      perKitchenBreakdown: Array.from(g.perKitchen.entries()).map(([branchCode, qty]) => ({
        branchCode,
        qty: Number(qty.toFixed(4)),
      })),
    }));
    data.sort((a, b) => a.subRecipeName.localeCompare(b.subRecipeName));

    return res.json({ success: true, data, projectionsConsidered: projections.length });
  } catch (err) {
    console.error("[HeadChef] getProductionPlan error:", err?.message || err);
    return res.status(500).json({ message: "Failed to build production plan" });
  }
}

/* ============================================================
 * 6. Sub-Recipe Dispatch
 * ========================================================== */
async function semiFinishedAvailable(brandName, subRecipeName, branchCode) {
  const rows = await BrandStock.find(
    { brandName, itemName: new RegExp(`^${escapeRegex(subRecipeName)}$`, "i"), location: "SEMI_FINISHED", branchCode, status: "Pending" },
    { qtyRemaining: 1 }
  ).lean();
  return rows.reduce((s, r) => s + Number(r.qtyRemaining || 0), 0);
}

export async function postDispatch(req, res) {
  try {
    const brandName = String(req.body?.brandName || "").trim();
    const subRecipeName = String(req.body?.subRecipeName || "").trim();
    const qty = Number(req.body?.qty || 0);
    const uom = String(req.body?.uom || "").trim();
    const toBranchCode = String(req.body?.toBranchCode || "").trim().toUpperCase();
    const fulfillRequestId = req.body?.fulfillRequestId; // optional: fulfilling a REQUESTED row

    if (!brandName || !subRecipeName || !toBranchCode) {
      return res.status(400).json({ message: "brandName, subRecipeName and toBranchCode are required" });
    }
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ message: "qty must be > 0" });

    const fromBranchCode = String(req.user?.branchCode || BASE_BRANCH).toUpperCase();

    const sub = await SubRecipe.findOne({ recipeName: new RegExp(`^${escapeRegex(subRecipeName)}$`, "i"), brand: brandExact(brandName) }).lean()
      || await SubRecipe.findOne({ recipeName: new RegExp(`^${escapeRegex(subRecipeName)}$`, "i") }).lean();
    if (!sub) return res.status(404).json({ message: "Sub-recipe not found for this brand" });

    const available = await semiFinishedAvailable(brandName, subRecipeName, fromBranchCode);
    if (available < qty) {
      return res.status(409).json({
        message: `Not enough prepared stock — only ${available} ${uom || ""} of "${subRecipeName}" in the base-kitchen fridge (SEMI_FINISHED). Cook a batch first.`,
      });
    }

    // Atomic: debit SEMI_FINISHED (guarded) + create the dispatch record together.
    let dispatch;
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const debited = await BrandStock.findOneAndUpdate(
        {
          brandName,
          itemName: new RegExp(`^${escapeRegex(subRecipeName)}$`, "i"),
          location: "SEMI_FINISHED",
          branchCode: fromBranchCode,
          status: "Pending",
          qtyRemaining: { $gte: qty },
        },
        {
          $inc: { qtyRemaining: -qty },
          $push: {
            history: {
              type: "TRANSFER_OUT",
              qty,
              uom: uom || sub.yieldUnit || "",
              at: new Date(),
              referenceKind: "TRANSFER",
              toBrandName: brandName,
              actorRole: "RECIPE_MANAGER",
              note: `Sub-recipe dispatch to ${toBranchCode}`,
            },
          },
        },
        { new: true, session }
      );
      if (!debited) throw new Error("Insufficient base-kitchen stock for this dispatch — refresh and retry");

      const now = new Date();
      const created = await SubrecipeDispatch.create(
        [
          {
            brandName,
            subRecipeName,
            qty,
            uom: uom || debited.uom || "",
            fromBranchCode,
            toBranchCode,
            status: "DISPATCHED",
            dispatchedBy: req.user?._id || req.user?.adminId || null,
            dispatchedAt: now,
          },
        ],
        { session }
      );
      dispatch = created[0];

      // If this dispatch fulfils a Local-Kitchen REQUESTED row, close that request.
      if (fulfillRequestId && /^[0-9a-fA-F]{24}$/.test(String(fulfillRequestId))) {
        await SubrecipeDispatch.findOneAndUpdate(
          { _id: fulfillRequestId, status: "REQUESTED" },
          { $set: { status: "DISPATCHED", dispatchedBy: req.user?._id || req.user?.adminId || null, dispatchedAt: now, qty, uom: uom || debited.uom || "" } },
          { session }
        );
      }

      await session.commitTransaction();
    } catch (txErr) {
      try { await session.abortTransaction(); } catch (_) { /* already closed */ }
      console.error("[HeadChef] postDispatch tx error:", txErr?.message || txErr);
      return res.status(409).json({ message: txErr?.message || "Failed to dispatch" });
    } finally {
      session.endSession();
    }

    await emitProcurementLog({
      eventType: "SUBRECIPE_DISPATCHED",
      req,
      brandName,
      itemName: subRecipeName,
      qty,
      uom: dispatch.uom,
      refId: dispatch._id,
      refCollection: "subrecipe_dispatches",
      metadata: { fromBranchCode, toBranchCode },
    });

    return res.status(201).json({ success: true, data: dispatch });
  } catch (err) {
    console.error("[HeadChef] postDispatch error:", err?.message || err);
    return res.status(500).json({ message: "Failed to dispatch sub-recipe" });
  }
}

export async function listDispatches(req, res) {
  try {
    const { brandName, status, from, to } = req.query || {};
    const q = {};
    if (brandName && String(brandName).trim()) q.brandName = brandExact(brandName);
    if (status && String(status).trim()) q.status = String(status).trim().toUpperCase();
    if (from || to) {
      q.createdAt = {};
      const f = normalizeAuditDate(from);
      const t = normalizeAuditDate(to);
      if (f) q.createdAt.$gte = f;
      if (t) q.createdAt.$lte = new Date(t.getTime() + DAY_MS - 1);
      if (Object.keys(q.createdAt).length === 0) delete q.createdAt;
    }
    const list = await SubrecipeDispatch.find(q).sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[HeadChef] listDispatches error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load dispatches" });
  }
}

export async function listDispatchDiscrepancies(req, res) {
  try {
    const list = await SubrecipeDispatch.find({ status: "DISCREPANCY" }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[HeadChef] listDispatchDiscrepancies error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load discrepancies" });
  }
}

export async function listDispatchRequests(req, res) {
  try {
    const { brandName } = req.query || {};
    const q = { status: "REQUESTED" };
    if (brandName && String(brandName).trim()) q.brandName = brandExact(brandName);
    const list = await SubrecipeDispatch.find(q).sort({ createdAt: 1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[HeadChef] listDispatchRequests error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load requests" });
  }
}

/* ============================================================
 * 7. Indents (raise to Stock Manager)
 * ========================================================== */
export async function listIndents(req, res) {
  try {
    const { brandName, status } = req.query || {};
    const q = {};
    if (brandName && String(brandName).trim()) q.requestBrandName = brandExact(brandName);
    if (status && String(status).trim()) q.status = String(status).trim();

    const list = await IngredientIndent.find(q).sort({ createdAt: -1 }).limit(500).lean();
    await Promise.all(
      list.map(async (doc) => {
        doc.source = doc.recipeKind === "manual" ? "CUSTOM" : "PROJECTION";
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
    console.error("[HeadChef] listIndents error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load indents" });
  }
}

// Raise a manual/custom indent. Mirrors createIndent's doc shape so the Stock
// Manager's existing verify/issue flow handles it unchanged.
export async function postCustomIndent(req, res) {
  try {
    const brandName = String(req.body?.brandName || "").trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!brandName) return res.status(400).json({ message: "brandName is required" });
    if (items.length === 0) return res.status(400).json({ message: "items[] is required" });

    const client = await resolveBrandUser(brandName);
    const branchCode = String(req.user?.branchCode || BASE_BRANCH).toUpperCase();

    const docs = items
      .map((r) => ({
        requestBrandName: brandName,
        clientBrandId: client?._id || null,
        clientBrandName: brandName,
        recipeId: null,
        recipeKind: "manual",
        recipeName: "Manual Indent",
        branchCode,
        skuCode: String(r.skuCode || ""),
        itemName: String(r.itemName || "").trim(),
        categoryName: String(r.categoryName || ""),
        uom: String(r.uom || ""),
        qty: Number(r.qty || 0),
        ingredientBrand: String(r.ingredientBrand || "").trim(),
        cost: 0,
        status: "INDENT_PENDING",
        isSeenByIngredientAdmin: false,
        isSeenByRecipeAdminGrn: false,
      }))
      .filter((d) => d.itemName && d.ingredientBrand);

    if (docs.length === 0) {
      return res.status(400).json({ message: "Each item needs itemName and ingredientBrand" });
    }

    const created = await IngredientIndent.insertMany(docs, { ordered: false });
    return res.status(201).json({ success: true, count: created.length, data: created });
  } catch (err) {
    console.error("[HeadChef] postCustomIndent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to raise indent" });
  }
}

/* ============================================================
 * 8. QC Failures (read Stock Manager's delivery_qc)
 * ========================================================== */
export async function getQcFailures(req, res) {
  try {
    const { brandName } = req.query || {};
    const q = { qcStatus: { $in: ["SHORT", "REJECTED"] } };
    if (brandName && String(brandName).trim()) q.brandName = brandExact(brandName);
    const list = await DeliveryQc.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[HeadChef] getQcFailures error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load QC failures" });
  }
}

/* ============================================================
 * 9. Vendor Alerts (raise — Stock Manager resolves)
 * ========================================================== */
export async function postVendorAlert(req, res) {
  try {
    const brandName = String(req.body?.brandName || "").trim();
    const ingredientName = String(req.body?.ingredientName || "").trim();
    const note = String(req.body?.note || "").trim();
    if (!ingredientName) return res.status(400).json({ message: "ingredientName is required" });

    const alert = await CreditNoteAlert.create({
      ingredientName,
      note,
      brandName,
      status: "OPEN",
      createdByRole: "RECIPE_MANAGER",
    });

    await emitProcurementLog({
      eventType: "VENDOR_ALERT_RAISED",
      req,
      brandName,
      itemName: ingredientName,
      refId: alert._id,
      refCollection: "credit_note_alerts",
      metadata: { note },
    });

    return res.status(201).json({ success: true, data: alert });
  } catch (err) {
    console.error("[HeadChef] postVendorAlert error:", err?.message || err);
    return res.status(500).json({ message: "Failed to raise vendor alert" });
  }
}

export async function listVendorAlerts(req, res) {
  try {
    const { brandName, status } = req.query || {};
    const q = { createdByRole: "RECIPE_MANAGER" };
    if (brandName && String(brandName).trim()) q.brandName = brandExact(brandName);
    if (status && ["OPEN", "RESOLVED"].includes(String(status).toUpperCase())) q.status = String(status).toUpperCase();
    const list = await CreditNoteAlert.find(q).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[HeadChef] listVendorAlerts error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load vendor alerts" });
  }
}

/* ============================================================
 * 10. Base Kitchen Stock Audit (SEMI_FINISHED @ JP Nagar)
 * ========================================================== */
async function semiFinishedSnapshot(brandName, baseBranch) {
  const rows = await BrandStock.find(
    { brandName: brandExact(brandName), location: "SEMI_FINISHED", branchCode: baseBranch, status: "Pending" },
    { itemName: 1, uom: 1, qtyRemaining: 1 }
  ).lean();
  const snap = rows.map((r) => ({
    itemName: r.itemName,
    uom: r.uom || "",
    expectedQty: Number(r.qtyRemaining || 0),
    actualQty: Number(r.qtyRemaining || 0),
    varianceQty: 0,
  }));
  snap.sort((a, b) => a.itemName.localeCompare(b.itemName));
  return snap;
}

export async function getBaseAudit(req, res) {
  try {
    const { brandName } = req.params;
    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });
    const dateObj = normalizeAuditDate(req.query?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const baseBranch = baseBranchOf(req);
    const records = await ProducerAudit.find({
      brandId: brand._id,
      branchCode: baseBranch,
      scope: "BASE_SEMI_FINISHED",
      date: dateObj,
    })
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
          })),
        },
      });
    }

    const snapshot = await semiFinishedSnapshot(brandName, baseBranch);
    return res.json({ success: true, data: { existing: false, brandName: brand.brandName, date: req.query.date, snapshot } });
  } catch (err) {
    console.error("[HeadChef] getBaseAudit error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load base-kitchen audit" });
  }
}

export async function postBaseAudit(req, res) {
  try {
    const { brandName } = req.params;
    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });
    const dateObj = normalizeAuditDate(req.body?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const built = buildAuditItems(req.body?.items);
    if (!built.ok) return res.status(400).json({ message: built.error });

    const baseBranch = baseBranchOf(req);
    const existing = await ProducerAudit.findOne({
      brandId: brand._id, branchCode: baseBranch, scope: "BASE_SEMI_FINISHED", date: dateObj, correctionSeq: 0,
    }).lean();
    if (existing?.lockedAt) {
      return res.status(409).json({ message: "This day's audit is locked. Use a correction instead." });
    }

    const doc = await ProducerAudit.findOneAndUpdate(
      { brandId: brand._id, branchCode: baseBranch, scope: "BASE_SEMI_FINISHED", date: dateObj, correctionSeq: 0 },
      { $set: { brandName: String(brand.brandName).trim(), variances: built.items } },
      { upsert: true, new: true }
    ).lean();
    return res.json({ success: true, data: { _id: doc._id, locked: false } });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: "Audit for this brand/date already exists" });
    console.error("[HeadChef] postBaseAudit error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save base-kitchen audit" });
  }
}

export async function lockBaseAudit(req, res) {
  try {
    const { brandName } = req.params;
    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });
    const dateObj = normalizeAuditDate(req.body?.date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const isCorrection = req.body?.correction === true;
    const baseBranch = baseBranchOf(req);

    const original = await ProducerAudit.findOne({
      brandId: brand._id, branchCode: baseBranch, scope: "BASE_SEMI_FINISHED", date: dateObj, correctionSeq: 0,
    });

    if (isCorrection) {
      if (!original) return res.status(404).json({ message: "No original audit to correct for this date" });
      if (!original.lockedAt) return res.status(409).json({ message: "Original audit is not locked yet — edit the draft instead" });

      const built = buildAuditItems(req.body?.items);
      if (!built.ok) return res.status(400).json({ message: built.error });

      const last = await ProducerAudit.find({ brandId: brand._id, branchCode: baseBranch, scope: "BASE_SEMI_FINISHED", date: dateObj })
        .sort({ correctionSeq: -1 }).limit(1).select("correctionSeq").lean();
      const nextSeq = (last[0]?.correctionSeq || 0) + 1;

      const doc = await ProducerAudit.create({
        brandId: brand._id, brandName: String(brand.brandName).trim(), branchCode: baseBranch,
        scope: "BASE_SEMI_FINISHED", date: dateObj, correctionSeq: nextSeq, correctionOf: original._id,
        variances: built.items, lockedAt: new Date(), lockedBy: req.user?._id || req.user?.adminId || null,
      });
      await reconcileAuditToLedger({ brandName: String(brand.brandName).trim(), branchCode: baseBranch, location: "SEMI_FINISHED", items: built.items, req });
      await emitAuditLogs(req, brand.brandName, doc, "BASE_KITCHEN_AUDIT_LOCKED", req.body.date, nextSeq);
      return res.status(201).json({ success: true, data: { _id: doc._id, correctionSeq: nextSeq } });
    }

    if (!original) return res.status(404).json({ message: "No draft audit found — save it first" });
    if (original.lockedAt) return res.status(409).json({ message: "Audit already locked" });

    original.lockedAt = new Date();
    original.lockedBy = req.user?._id || req.user?.adminId || null;
    await original.save();
    await reconcileAuditToLedger({ brandName: String(brand.brandName).trim(), branchCode: baseBranch, location: "SEMI_FINISHED", items: original.variances || [], req });
    await emitAuditLogs(req, brand.brandName, original, "BASE_KITCHEN_AUDIT_LOCKED", req.body.date, 0);
    return res.json({ success: true, data: { _id: original._id, lockedAt: original.lockedAt } });
  } catch (err) {
    console.error("[HeadChef] lockBaseAudit error:", err?.message || err);
    return res.status(500).json({ message: "Failed to lock audit" });
  }
}

// Shared: emit one VARIANCE_RECORDED per non-zero row + one audit-locked event.
// Exported so the Local Kitchen controller emits the same way.
export async function emitAuditLogs(req, brandName, doc, lockedEvent, dateStr, correctionSeq) {
  for (const v of doc.variances || []) {
    if (Number(v.varianceQty) !== 0) {
      await emitProcurementLog({
        eventType: "VARIANCE_RECORDED",
        req,
        brandName,
        itemName: v.itemName,
        qty: v.varianceQty,
        uom: v.uom,
        refId: doc._id,
        refCollection: "producer_audits",
        metadata: { expectedQty: v.expectedQty, actualQty: v.actualQty, reason: v.reason, reasonNote: v.reasonNote, date: dateStr, correctionSeq },
      });
    }
  }
  await emitProcurementLog({
    eventType: lockedEvent,
    req,
    brandName,
    refId: doc._id,
    refCollection: "producer_audits",
    metadata: { date: dateStr, correctionSeq, itemCount: (doc.variances || []).length },
  });
}

/* ============================================================
 * 11. Reorder Insights (projection-aware, read-only)
 * ========================================================== */
export async function getReorderInsights(req, res) {
  try {
    const brandName = String(req.query?.brandName || "").trim();
    if (!brandName) return res.status(400).json({ message: "brandName is required" });

    // Current branch-kitchen + warehouse stock per item (what's on hand).
    const stockRows = await BrandStock.find(
      { brandName: brandExact(brandName), status: "Pending" },
      { itemName: 1, qtyRemaining: 1, uom: 1, location: 1 }
    ).lean();
    const onHand = new Map(); // itemLower → { itemName, qty, uom }
    for (const r of stockRows) {
      const key = String(r.itemName || "").trim().toLowerCase();
      if (!key) continue;
      if (!onHand.has(key)) onHand.set(key, { itemName: r.itemName, qty: 0, uom: r.uom || "" });
      onHand.get(key).qty += Number(r.qtyRemaining || 0);
    }

    // Projection-driven required qty for the next day (CHEF_CONFIRMED + PENDING review).
    const tomorrowStart = new Date(Date.now() + DAY_MS);
    tomorrowStart.setUTCHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + DAY_MS - 1);
    const projections = await Projection.find({
      brandName: brandExact(brandName),
      status: { $in: ["PENDING_CHEF_REVIEW", "CHEF_CONFIRMED"] },
      forDate: { $gte: tomorrowStart, $lte: tomorrowEnd },
    }).lean();

    const required = new Map(); // itemLower → { itemName, qty, uom }
    for (const proj of projections) {
      for (const pItem of proj.items || []) {
        const recipe = await MainRecipe.findOne({
          brand: brandExact(brandName),
          recipeName: new RegExp(`^${escapeRegex(String(pItem.recipeName || ""))}$`, "i"),
        }).lean();
        if (!recipe) continue;
        const leaves = await extractIngredientsFromBOM(recipe.items, Number(pItem.targetQty || 0), brandName, new Set());
        for (const lf of aggregateIngredients(leaves).values()) {
          const key = lf.itemName.toLowerCase();
          if (!required.has(key)) required.set(key, { itemName: lf.itemName, qty: 0, uom: lf.uom || "" });
          required.get(key).qty += Number(lf.qty || 0);
        }
      }
    }

    const keys = new Set([...onHand.keys(), ...required.keys()]);
    const data = [];
    for (const key of keys) {
      const oh = onHand.get(key);
      const rq = required.get(key);
      const currentQty = Number((oh?.qty || 0).toFixed(4));
      const requiredQty = Number((rq?.qty || 0).toFixed(4));
      const shortfall = Number(Math.max(0, requiredQty - currentQty).toFixed(4));
      data.push({
        itemName: (oh || rq).itemName,
        currentQty,
        requiredQty,
        shortfall,
        uom: rq?.uom || oh?.uom || "",
        advisory: shortfall > 0 ? "SHORTFALL" : "OK",
      });
    }
    data.sort((a, b) => b.shortfall - a.shortfall || a.itemName.localeCompare(b.itemName));
    return res.json({ success: true, data, projectionsConsidered: projections.length });
  } catch (err) {
    console.error("[HeadChef] getReorderInsights error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load reorder insights" });
  }
}

/* ============================================================
 * 12. Stock (Rista) Reconciliation  — FUTURE-HOOK
 * Rista config readiness is unknown; missing config returns a graceful empty
 * state, never an error.
 * ========================================================== */
export async function getRistaStockComparison(req, res) {
  try {
    const brandName = String(req.query?.brandName || "").trim();
    const branchCode = String(req.query?.branchCode || BASE_BRANCH).trim().toUpperCase();
    if (!brandName) return res.status(400).json({ message: "brandName is required" });

    const ristaCode = RISTA_BRANCH[branchCode];
    if (!ristaCode) {
      return res.json({ success: true, configured: false, message: `Rista is not wired for ${branchCode} yet.`, rows: [] });
    }

    let ristaItems = [];
    try {
      ristaItems = (await ristaClient.getInventory(ristaCode)) || [];
    } catch (ristaErr) {
      console.warn("[HeadChef] Rista getInventory failed (graceful):", ristaErr?.message || ristaErr);
      return res.json({ success: true, configured: false, message: "Rista inventory unavailable right now.", rows: [] });
    }

    // Purchase Register on-hand per item for this brand (warehouse stock).
    const ristaMap = new Map();
    for (const it of ristaItems) {
      const key = String(it.name || "").trim().toLowerCase();
      if (!key) continue;
      ristaMap.set(key, { name: it.name, qty: Number(it.itemQty || 0), uom: it.measuringUnit || "" });
    }

    const rows = [];
    for (const [key, r] of ristaMap.entries()) {
      const prQty = await getWarehouseStockAvailable({ brandName, itemName: r.name, ingredientBrand: "", uom: r.uom });
      const variance = Number((Number(prQty || 0) - r.qty).toFixed(4));
      const variancePercent = r.qty > 0 ? Number(((variance / r.qty) * 100).toFixed(1)) : null;
      rows.push({ itemName: r.name, ristaQty: r.qty, purchaseRegisterQty: Number(prQty || 0), uom: r.uom, variance, variancePercent });
    }
    rows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    return res.json({ success: true, configured: true, branchCode, ristaCode, rows });
  } catch (err) {
    console.error("[HeadChef] getRistaStockComparison error:", err?.message || err);
    return res.status(500).json({ message: "Failed to compare Rista stock" });
  }
}

/* ============================================================
 * 13. FCR Iteration View (reuse) + 14. Menu & Projections (read-only)
 * ========================================================== */
export async function getFcr(req, res) {
  try {
    const { brandName } = req.params;
    if (!String(brandName || "").trim()) return res.status(400).json({ message: "brandName is required" });
    const dishes = await getDishIterations(brandName);
    return res.json({ success: true, data: dishes });
  } catch (err) {
    console.error("[HeadChef] getFcr error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load FCR" });
  }
}

export async function getMenu(req, res) {
  try {
    const brand = await resolveBrandUser(req.params.brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });
    const list = await MenuEntry.find({ clientId: brand._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[HeadChef] getMenu error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load menu" });
  }
}

export async function getProjections(req, res) {
  try {
    const brand = await resolveBrandUser(req.params.brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });
    const list = await Projection.find({ brandId: brand._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("[HeadChef] getProjections error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load projections" });
  }
}

/* ============================================================
 * 15. Recipe Import (bulk onboarding via Excel template) — CLAUDE.md §26
 *
 * Three handlers: serve the template, dry-run preview (no writes), and a
 * transactional commit. The heavy parse + 3-pass validation lives in
 * utils/recipeImport.js and is shared by preview + commit so what is previewed
 * is exactly what is written. Existing recipe-creation controllers and the
 * Main/Sub/ItemMaster schemas are NOT touched — this builds its own write logic
 * using the same field shapes.
 * ========================================================== */

// GET /api/head-chef/recipe-import-template — stream the .xlsx template.
export async function getRecipeImportTemplate(req, res) {
  try {
    const buffer = await buildTemplateWorkbook();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="recipe_import_template.xlsx"');
    return res.send(buffer);
  } catch (err) {
    console.error("[HeadChef] getRecipeImportTemplate error:", err?.message || err);
    return res.status(500).json({ message: "Failed to generate template" });
  }
}

// POST /api/head-chef/recipe-import-preview — parse + validate, no DB writes.
export async function postRecipeImportPreview(req, res) {
  try {
    const brandName = String(req.body?.brandName || "").trim();
    if (!brandName) return res.status(400).json({ message: "brandName is required" });
    if (!req.file?.buffer?.length) return res.status(400).json({ message: "No Excel file uploaded" });

    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });

    let parsed;
    try {
      parsed = await parseWorkbook(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ message: "Could not read the Excel file. Re-download the template and try again." });
    }

    const { plan, warnings, errors } = await validateImport({ brandName: brand.brandName, parsed });
    const confirmationToken = errors.length === 0 ? importToken(brand.brandName, req.file.buffer) : null;

    return res.json({
      success: errors.length === 0,
      brandName: brand.brandName,
      plan,
      warnings,
      errors,
      confirmationToken,
    });
  } catch (err) {
    console.error("[HeadChef] postRecipeImportPreview error:", err?.message || err);
    return res.status(500).json({ message: "Failed to preview import" });
  }
}

// POST /api/head-chef/recipe-import-commit — re-validate, then write in a txn.
export async function postRecipeImportCommit(req, res) {
  try {
    const brandName = String(req.body?.brandName || "").trim();
    const confirmationToken = String(req.body?.confirmationToken || "").trim();
    if (!brandName) return res.status(400).json({ message: "brandName is required" });
    if (!confirmationToken) return res.status(400).json({ message: "confirmationToken is required — run Preview first" });
    if (!req.file?.buffer?.length) return res.status(400).json({ message: "No Excel file uploaded" });

    const brand = await resolveBrandUser(brandName);
    if (!brand) return res.status(404).json({ message: "No client record for this brand" });

    // Guard: the committed file must be the previewed file.
    if (importToken(brand.brandName, req.file.buffer) !== confirmationToken) {
      return res.status(400).json({ message: "The file changed since Preview. Please run Preview again." });
    }

    let parsed;
    try {
      parsed = await parseWorkbook(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ message: "Could not read the Excel file. Re-download the template and try again." });
    }

    const { errors, normalized } = await validateImport({ brandName: brand.brandName, parsed });
    if (errors.length || !normalized) {
      return res.status(400).json({ message: "Import has blocking errors — fix them and preview again.", errors });
    }

    const created = { itemMasters: 0, subRecipes: 0, mainRecipes: 0 };
    const updated = { subRecipes: 0, mainRecipes: 0 };

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Pass 1 — new ItemMasters (existing reused untouched).
        if (normalized.itemMastersToCreate.length) {
          await ItemMaster.create(
            normalized.itemMastersToCreate.map((i) => ({
              itemName: i.itemName,
              uom: i.uom,
              shelfLifeDays: i.shelfLifeDays,
              minStockLevel: i.minStockLevel,
              minStockUom: i.minStockUom,
            })),
            { session, ordered: true }
          );
          created.itemMasters = normalized.itemMastersToCreate.length;
        }

        // Pass 2 — SubRecipes (create or overwrite items[] + batch yield).
        for (const s of normalized.subRecipesToCreate) {
          await SubRecipe.create([{ brand: brand.brandName, recipeName: s.recipeName, yield: s.yield, items: s.items }], { session });
          created.subRecipes += 1;
        }
        for (const s of normalized.subRecipesToUpdate) {
          await SubRecipe.updateOne({ _id: s._id }, { $set: { yield: s.yield, items: s.items } }, { session });
          updated.subRecipes += 1;
        }

        // Pass 3 — MainRecipes (create or overwrite items[]).
        for (const m of normalized.mainRecipesToCreate) {
          await MainRecipe.create([{ brand: brand.brandName, recipeName: m.recipeName, items: m.items }], { session });
          created.mainRecipes += 1;
        }
        for (const m of normalized.mainRecipesToUpdate) {
          await MainRecipe.updateOne({ _id: m._id }, { $set: { items: m.items } }, { session });
          updated.mainRecipes += 1;
        }
      });
    } finally {
      await session.endSession();
    }

    // Best-effort analyst log (post-commit; never blocks the response).
    emitProcurementLog({
      eventType: "RECIPE_IMPORT_RUN",
      req,
      brandName: brand.brandName,
      refId: brand._id,
      refCollection: "main_recipes",
      metadata: { created, updated },
    });

    const log = [
      `ItemMasters created: ${created.itemMasters}`,
      `SubRecipes created: ${created.subRecipes}, updated: ${updated.subRecipes}`,
      `MainRecipes created: ${created.mainRecipes}, updated: ${updated.mainRecipes}`,
    ];
    return res.json({ success: true, brandName: brand.brandName, created, updated, log });
  } catch (err) {
    console.error("[HeadChef] postRecipeImportCommit error:", err?.message || err);
    return res.status(500).json({ message: "Import failed and was rolled back. No changes were saved." });
  }
}
