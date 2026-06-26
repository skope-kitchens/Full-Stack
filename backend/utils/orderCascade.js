/**
 * orderCascade.js — stock cascade for MANUAL Local-Kitchen order entry (CLAUDE.md §25).
 *
 * WHY THIS EXISTS (and why it does NOT import applyStockCascade):
 *   projection.controller.js#applyStockCascade is module-private AND read-only — it
 *   computes a shortfall, it never mutates stock. The order-entry flow needs to
 *   (a) PREVIEW whether an order would push stock negative, and (b) actually DEBIT
 *   the consumed ingredients. Rather than export/modify the frozen cascade
 *   function, this wrapper REPLICATES the two LOCAL cascade levels
 *   (BRANCH_KITCHEN + SEMI_FINISHED at the kitchen's branchCode) using the SAME
 *   shared utilities (extractIngredientsFromBOM, aggregateIngredients, convertQty)
 *   and mirrors the proven, already-shipped deduction pattern from
 *   productionOrder.controller.js (clamped decrement + TRANSFER_OUT history).
 *
 *   applyStockCascade itself, bomExpander, and the brand_stocks schema are UNTOUCHED.
 *
 * Cascade levels (order matters for deduction):
 *   1. BRANCH_KITCHEN raw stock at branchCode   (the kitchen's raw store)
 *   2. SEMI_FINISHED stock at branchCode         (fallback)
 *   Whatever remains after both levels is the shortfall. On a chef override
 *   (allowNegative) the remainder is debited into BRANCH_KITCHEN, going negative,
 *   so the next closing audit surfaces the variance.
 */
import MainRecipe from "../models/mainrecipe.models.js";
import BrandStock from "../models/brandStock.js";
import {
  extractIngredientsFromBOM,
  aggregateIngredients,
  escapeRegex,
  normalizeUom,
} from "./bomExpander.js";
import { convertQty } from "./uomConvert.js";

const EPS = 1e-9;
const LOCAL_LEVELS = ["BRANCH_KITCHEN", "SEMI_FINISHED"];

const nameExact = (itemName) => new RegExp(`^${escapeRegex(itemName)}$`, "i");

/**
 * Expand a MainRecipe's BOM into aggregated raw-leaf ingredients for `qty` dishes.
 * Returns { recipe, ingredients: Map } or { recipe: null } when the recipe is gone.
 */
async function expandOrderBom({ recipeId, qty, brandName }) {
  const recipe = await MainRecipe.findById(recipeId).lean();
  if (!recipe) return { recipe: null, ingredients: new Map() };
  const leaves = await extractIngredientsFromBOM(recipe.items, Number(qty), brandName, new Set());
  return { recipe, ingredients: aggregateIngredients(leaves) };
}

/**
 * previewOrderCascade — PURE READ. Does NOT mutate any stock.
 * Tells you which raw ingredients would go below zero if this order were recorded.
 *
 * @returns {Promise<{ canFulfil: boolean, recipeMissing?: boolean,
 *   insufficientItems: Array<{ itemName, currentQty, requiredQty, shortfall, uom }> }>}
 */
export async function previewOrderCascade({ brandName, branchCode, recipeId, qty }) {
  const { recipe, ingredients } = await expandOrderBom({ recipeId, qty, brandName });
  if (!recipe) return { canFulfil: false, recipeMissing: true, insufficientItems: [] };

  const insufficientItems = [];

  for (const ing of ingredients.values()) {
    const regex = nameExact(ing.itemName);
    let available = 0;

    for (const location of LOCAL_LEVELS) {
      const rows = await BrandStock.find({
        brandName,
        itemName: regex,
        location,
        branchCode,
        status: "Pending",
      }).lean();
      for (const r of rows) {
        const conv = convertQty(Number(r.qtyRemaining || 0), r.uom, ing.uom);
        available += conv == null ? Number(r.qtyRemaining || 0) : conv;
      }
    }

    const shortfall = Number(ing.qty) - available;
    if (shortfall > EPS) {
      insufficientItems.push({
        itemName: ing.itemName,
        currentQty: Number(available.toFixed(4)),
        requiredQty: Number(Number(ing.qty).toFixed(4)),
        shortfall: Number(shortfall.toFixed(4)),
        uom: normalizeUom(ing.uom),
      });
    }
  }

  return { canFulfil: insufficientItems.length === 0, insufficientItems };
}

/**
 * applyOrderCascade — MUTATES stock. Debits the raw ingredients an order consumes
 * from BRANCH_KITCHEN then SEMI_FINISHED at the branch, clamped to availability.
 * On allowNegative (chef override) the leftover is pushed into BRANCH_KITCHEN and
 * allowed to go negative.
 *
 * MUST be called inside a mongoose session (passed in) so the order insert and all
 * debits commit/rollback together.
 *
 * @returns {Promise<{ recipeMissing?: boolean, deductions: Array }>}
 *   deductions: [{ itemName, qty, uom, location, stockId }] — exact reversal record.
 */
export async function applyOrderCascade({ brandName, branchCode, recipeId, qty, orderId, allowNegative, session }) {
  const { recipe, ingredients } = await expandOrderBom({ recipeId, qty, brandName });
  if (!recipe) return { recipeMissing: true, deductions: [] };

  const deductions = [];
  const noteBase = `Manual order consumption (${recipe.recipeName})`;

  for (const ing of ingredients.values()) {
    const regex = nameExact(ing.itemName);
    let remaining = Number(ing.qty); // tracked in the BOM uom

    for (const location of LOCAL_LEVELS) {
      if (remaining <= EPS) break;
      const rows = await BrandStock.find({
        brandName,
        itemName: regex,
        location,
        branchCode,
        status: "Pending",
      }).session(session);

      for (const row of rows) {
        if (remaining <= EPS) break;
        const avail = Number(row.qtyRemaining || 0);
        if (avail <= 0) continue;

        const availInBom = convertQty(avail, row.uom, ing.uom);
        const availBom = availInBom == null ? avail : availInBom;
        const deductBom = Math.min(remaining, availBom);
        if (deductBom <= EPS) continue;

        const deductRowConv = convertQty(deductBom, ing.uom, row.uom);
        const deductRow = deductRowConv == null ? deductBom : deductRowConv;

        row.qtyRemaining = avail - deductRow;
        row.history.push({
          type: "TRANSFER_OUT",
          qty: Number(deductRow.toFixed(4)),
          uom: row.uom || ing.uom,
          at: new Date(),
          referenceId: orderId,
          referenceKind: "MANUAL",
          note: noteBase,
        });
        await row.save({ session });

        deductions.push({
          itemName: ing.itemName,
          qty: Number(deductRow.toFixed(4)),
          uom: row.uom || ing.uom,
          location,
          stockId: row._id,
        });
        remaining -= deductBom;
      }
    }

    // Override: push the unmet remainder into BRANCH_KITCHEN, allowing negative.
    if (remaining > EPS && allowNegative) {
      let row = await BrandStock.findOne({
        brandName,
        itemName: regex,
        location: "BRANCH_KITCHEN",
        branchCode,
        status: "Pending",
      }).session(session);

      if (!row) {
        row = new BrandStock({
          brandName,
          itemName: ing.itemName,
          ingredientBrand: "",
          uom: normalizeUom(ing.uom),
          qtyRemaining: 0,
          location: "BRANCH_KITCHEN",
          branchCode,
          status: "Pending",
          history: [],
        });
      }

      const targetUom = row.uom || ing.uom;
      const deductConv = convertQty(remaining, ing.uom, targetUom);
      const deductRow = deductConv == null ? remaining : deductConv;

      row.qtyRemaining = Number(row.qtyRemaining || 0) - deductRow;
      if (!row.uom) row.uom = normalizeUom(ing.uom);
      row.history.push({
        type: "TRANSFER_OUT",
        qty: Number(deductRow.toFixed(4)),
        uom: row.uom,
        at: new Date(),
        referenceId: orderId,
        referenceKind: "MANUAL",
        note: `${noteBase} — OVERRIDE, stock went negative`,
      });
      await row.save({ session });

      deductions.push({
        itemName: ing.itemName,
        qty: Number(deductRow.toFixed(4)),
        uom: row.uom,
        location: "BRANCH_KITCHEN",
        stockId: row._id,
      });
      remaining = 0;
    }
  }

  return { deductions };
}

/**
 * reverseOrderCascade — credits back the exact quantities recorded in an order's
 * cascadeDeductions[] (used by DELETE within the 30-min correction window).
 * MUST run inside a session. Best-effort per row: a missing stock row is skipped.
 *
 * @returns {Promise<{ reversed: Array }>}
 */
export async function reverseOrderCascade({ deductions, orderId, recipeName, session }) {
  const reversed = [];
  for (const d of deductions || []) {
    if (!d?.stockId) continue;
    const row = await BrandStock.findById(d.stockId).session(session);
    if (!row) continue;
    row.qtyRemaining = Number(row.qtyRemaining || 0) + Number(d.qty || 0);
    row.history.push({
      type: "TRANSFER_IN",
      qty: Number(Number(d.qty || 0).toFixed(4)),
      uom: d.uom || row.uom,
      at: new Date(),
      referenceId: orderId,
      referenceKind: "MANUAL",
      note: `Reversal of manual order (${recipeName || ""}) within correction window`,
    });
    await row.save({ session });
    reversed.push({ itemName: d.itemName, qty: d.qty, uom: d.uom, location: d.location });
  }
  return { reversed };
}
