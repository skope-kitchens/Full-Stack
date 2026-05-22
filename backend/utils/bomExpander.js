/**
 * bomExpander.js — Shared BOM traversal utility.
 *
 * Used by:
 *   1. admin.brand.routes.js  — stock deduction on Mark Preparing
 *   2. projection.controller  — Net Production Engine (gross BOM vs fridge stock)
 *
 * UOM NORMALIZATION RULES (critical — live DB stores "kg" lowercase):
 *   All UOM values are folded to uppercase before any comparison or arithmetic.
 *   GM → KG conversion: when recipe specifies GM and the caller needs KG-normalised
 *   quantities, use normalizeQtyToKg(qty, uom).
 *
 *   Supported recipe UOMs: GM, KG, PC (from subrecipe.models.js enum).
 *   Supported stock UOMs in DB: "kg", "KG", "GM", "gm", "PC", "pc", "NOS" etc.
 */

import SubRecipe from "../models/subrecipe.models.js";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

/** Normalize a UOM string to uppercase, trim whitespace. */
export const normalizeUom = (uom) => String(uom || "").trim().toUpperCase();

/**
 * Convert a quantity to KG regardless of its source UOM.
 * Returns null when conversion is not meaningful (e.g., "PC").
 *
 * @param {number} qty   - raw quantity from the recipe BOM
 * @param {string} uom   - UOM from the recipe BOM (any case)
 * @returns {number|null}
 */
export const normalizeQtyToKg = (qty, uom) => {
  const u = normalizeUom(uom);
  if (u === "KG") return qty;
  if (u === "GM") return qty / 1000;
  return null; // non-weight unit — caller decides how to handle
};

/**
 * Escape a string for safe use inside a MongoDB RegExp.
 * Used when doing case-insensitive name matching against stock records.
 */
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ─── core traversal ──────────────────────────────────────────────────────── */

/**
 * Recursively expand a recipe's BOM and collect every leaf INGREDIENT node.
 *
 * @param {object[]} items       - recipe.items array (MainRecipe or SubRecipe)
 * @param {number}   multiplier  - scaling factor (dishQty for top level; yield-adjusted for sub-recipes)
 * @param {string}   brandName   - brand scope for sub-recipe lookup
 * @param {Set}      visited     - cycle guard (pass `new Set()` at each call-site root)
 *
 * @returns {Promise<Array<{ itemName: string, qty: number, uom: string }>>}
 *   Each entry is one leaf ingredient with its aggregated raw quantity
 *   (pre-UOM-normalisation — callers that need KG should call normalizeQtyToKg).
 */
export async function extractIngredientsFromBOM(items, multiplier, brandName, visited) {
  const result = [];

  for (const item of (items || [])) {
    if (!item) continue;

    const type = normalizeUom(item.type); // type field is uppercase by schema, but be safe

    if (type === "INGREDIENT") {
      const qty = Number(item.quantity || 0) * multiplier;
      const name = String(item.refId || "").trim();
      if (qty > 0 && name) {
        result.push({ itemName: name, qty, uom: normalizeUom(item.uom) });
      }
      continue;
    }

    if (type === "SUBRECIPE") {
      const cycleKey = String(item.refId || "").trim().toLowerCase();
      if (!cycleKey || visited.has(cycleKey)) continue;

      // Brand-scoped lookup first; fall back to any brand to handle shared sub-recipes.
      const sub = await SubRecipe.findOne({ recipeName: item.refId, brand: brandName }).lean()
        || await SubRecipe.findOne({ recipeName: item.refId }).lean();

      if (!sub) continue;

      // sub.yield is the batch output size (e.g. 5 kg per batch of Garlic Mayo).
      // item.quantity is how much of this sub-recipe the parent recipe needs.
      // multiplier scales everything up for the ordered qty.
      const subYield = Math.max(Number(sub.yield || 1), 0.0001);
      const subMultiplier = (Number(item.quantity || 0) / subYield) * multiplier;

      visited.add(cycleKey);
      const children = await extractIngredientsFromBOM(
        sub.items,
        subMultiplier,
        brandName || sub.brand,
        visited
      );
      visited.delete(cycleKey);

      result.push(...children);
    }
  }

  return result;
}

/**
 * Aggregate a flat ingredients array by itemName (case-insensitive).
 * Quantities for the same ingredient from different BOM branches are summed.
 *
 * @param {Array<{ itemName, qty, uom }>} ingredients
 * @returns {Map<string, { itemName, qty, uom }>}  key = lowercased itemName
 */
export function aggregateIngredients(ingredients) {
  const map = new Map();
  for (const d of ingredients) {
    const key = d.itemName.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.qty += d.qty;
    } else {
      map.set(key, { ...d });
    }
  }
  return map;
}
