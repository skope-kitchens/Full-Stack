/**
 * iterationFcr.js — Per-iteration FCR engine.
 *
 * Builds a per-dish timeline of FCR across every recipe iteration that exists
 * for a brand (T1, T2, T3, TR1, TR2, TR3, Final), reusing the existing cost
 * traversal in costing.controller.js (expandItem/resolveSubRecipe) unchanged.
 *
 * Brand-wide (not branch-scoped) — TrialRecipe/TrainingRecipe/MainRecipe carry
 * no branch field in their schemas, matching the existing brand-wide
 * /api/client/fcr precedent.
 */
import MainRecipe from "../models/mainrecipe.models.js";
import TrialRecipe from "../models/trialRecipe.models.js";
import TrainingRecipe from "../models/trainingRecipe.models.js";
import {
  calculateRecipeFromItems,
  calculateCost,
  resolveSubRecipe,
  sumSubRecipeCost,
} from "../controllers/costing.controller.js";
import { escapeRegex } from "./bomExpander.js";

// Anchored, case-insensitive EXACT brand match — never cross-brand.
export const brandExact = (brandName) => new RegExp(`^${escapeRegex(String(brandName || ""))}$`, "i");

const ITERATION_ORDER = ["T1", "T2", "T3", "TR1", "TR2", "TR3", "FINAL"];

function iterationSortKey(it) {
  const idx = ITERATION_ORDER.indexOf(it.code || "FINAL");
  return idx === -1 ? ITERATION_ORDER.length : idx;
}

function buildIngredientRow(it) {
  const yieldPercent = Number(it.yield) > 0 ? Number(it.yield) : 100;
  const netPrice = Number(it.netPrice || 0);
  return {
    type: "INGREDIENT",
    itemName: it.refId || "",
    category: it.category || "Food",
    specification: it.specification || it.itemBrand || "",
    uom: it.uom || "",
    quantity: Number(it.quantity || 0),
    yieldPercent,
    netPrice,
    unitPrice: Number((netPrice * (yieldPercent / 100)).toFixed(4)),
  };
}

// Builds a SUBRECIPE row: the sub-recipe's own name/qty/yield/total-cost, plus
// its constituent ingredients (recursively, in case a sub-recipe nests another
// sub-recipe) so the UI can expand it the same way expandItem() traverses it.
// Reuses resolveSubRecipe/calculateCost/sumSubRecipeCost unchanged from
// costing.controller.js — same brand-matching and cost math as the real FCR
// total, just surfaced for display.
async function buildSubRecipeRow(it, brandName, subRecipeCache, visitedSubRecipes) {
  const cycleKey = String(it.refId || "").trim().toLowerCase();
  const yieldPercent = Number(it.yield) > 0 ? Number(it.yield) : 100;
  // explicitCost only applies if this SUBRECIPE entry was given its own
  // netPrice elsewhere (e.g. an outsourced/bought-in batch entered directly
  // on the recipe by the Head Chef) — same precedence expandItem() uses.
  // The default/expected path is computedCost: the sum of the sub-recipe's
  // own ingredients, via the SAME resolveSubRecipe/sumSubRecipeCost used by
  // the real cost engine — never a manually-entered placeholder.
  const explicitCost = calculateCost(it);

  let ingredients = [];
  let computedCost = 0;
  if (!visitedSubRecipes.has(cycleKey)) {
    const sub = await resolveSubRecipe({ recipeName: it.refId, brandName, cache: subRecipeCache });
    if (sub) {
      visitedSubRecipes.add(cycleKey);
      computedCost = await sumSubRecipeCost({
        items: sub.items,
        brandName,
        multiplier: 1,
        subRecipeCache,
        visitedSubRecipes,
      });
      ingredients = await buildItemRows(sub.items, brandName, subRecipeCache, visitedSubRecipes);
      visitedSubRecipes.delete(cycleKey);
    }
  }

  const totalCost = explicitCost > 0 ? explicitCost : computedCost;
  return {
    type: "SUBRECIPE",
    itemName: it.refId || "",
    category: it.category || "Food",
    uom: it.uom || "",
    quantity: Number(it.quantity || 0),
    yieldPercent,
    totalCost: Number(totalCost.toFixed(2)),
    ingredients,
  };
}

async function buildItemRows(items, brandName, subRecipeCache, visitedSubRecipes) {
  const rows = [];
  for (const it of items || []) {
    if (it.type === "SUBRECIPE") {
      rows.push(await buildSubRecipeRow(it, brandName, subRecipeCache, visitedSubRecipes));
    } else {
      rows.push(buildIngredientRow(it));
    }
  }
  return rows;
}

// Flat, editable ingredient list for price entry: direct ingredients on the
// iteration itself, PLUS ingredients nested inside any sub-recipe it uses —
// flattened recursively (handles a sub-recipe nesting another sub-recipe).
// No row is ever produced for a SUBRECIPE entry itself: the POC only ever
// prices individual ingredients, and sub-recipe cost rolls up automatically
// from those via the existing resolveSubRecipe/sumSubRecipeCost traversal —
// mirrors the real BOM, never a manual sub-recipe override.
// `source: "ITERATION"` rows are written back onto the iteration document
// itself (TrialRecipe/TrainingRecipe/MainRecipe); `source: "SUBRECIPE"` rows
// live on the (brand-wide, shared-across-iterations) SubRecipe document
// identified by `subRecipeName`/`subRecipeBrand` — pricing one of these
// updates every dish/iteration that uses that sub-recipe, exactly like the
// rest of the app's BOM already works.
async function buildEditableIngredients(items, brandName, subRecipeCache, visitedSubRecipes, source = "ITERATION", subRecipeName = null, subRecipeBrand = null) {
  const rows = [];
  for (const it of items || []) {
    if (it.type === "SUBRECIPE") {
      const cycleKey = String(it.refId || "").trim().toLowerCase();
      if (visitedSubRecipes.has(cycleKey)) continue;
      const sub = await resolveSubRecipe({ recipeName: it.refId, brandName, cache: subRecipeCache });
      if (!sub) continue;
      visitedSubRecipes.add(cycleKey);
      const nested = await buildEditableIngredients(
        sub.items,
        brandName,
        subRecipeCache,
        visitedSubRecipes,
        "SUBRECIPE",
        sub.recipeName,
        sub.brand
      );
      visitedSubRecipes.delete(cycleKey);
      rows.push(...nested);
    } else {
      const row = buildIngredientRow(it);
      row.source = source;
      row.subRecipeName = subRecipeName;
      row.subRecipeBrand = subRecipeBrand;
      rows.push(row);
    }
  }
  return rows;
}

// Returns: [{ recipeName, iterations: [{ phase, code, totalCost, foodCost,
//   packagingCost, productionVariance, suggestedSellingPrice, items }] }]
// Only includes iterations that actually exist — no fabricated empty slots.
export async function getDishIterations(brandName) {
  if (!brandName) return [];

  const brandRe = brandExact(brandName);
  const [trials, trainings, mains] = await Promise.all([
    TrialRecipe.find({ brand: brandRe, recipeType: "MAIN" }).lean(),
    TrainingRecipe.find({ brand: brandRe, recipeType: "MAIN" }).lean(),
    MainRecipe.find({ brand: brandRe }).lean(),
  ]);

  const dishMap = new Map(); // key = trimmed lowercase recipeName

  const seenNameCasing = new Map();
  const groupKey = (recipeName) => {
    const trimmed = String(recipeName || "").trim();
    const key = trimmed.toLowerCase();
    if (!seenNameCasing.has(key)) seenNameCasing.set(key, trimmed);
    return key;
  };

  const ingest = (docs, phase, codeField) => {
    for (const doc of docs) {
      const key = groupKey(doc.recipeName);
      if (!dishMap.has(key)) dishMap.set(key, []);
      dishMap.get(key).push({
        phase,
        code: codeField ? doc[codeField] : null,
        doc,
      });
    }
  };

  ingest(trials, "TRIAL", "trialCode");
  ingest(trainings, "TRAINING", "trainingCode");
  ingest(mains, "FINAL", null);

  const dishes = [];
  for (const [key, entries] of dishMap.entries()) {
    const recipeName = seenNameCasing.get(key);
    const iterations = [];
    for (const entry of entries) {
      const result = await calculateRecipeFromItems(entry.doc.items, entry.doc.brand);
      const items = await buildItemRows(entry.doc.items, entry.doc.brand, new Map(), new Set());
      const editableIngredients = await buildEditableIngredients(
        entry.doc.items,
        entry.doc.brand,
        new Map(),
        new Set()
      );
      iterations.push({
        phase: entry.phase,
        code: entry.code || null,
        foodCost: result.foodCost,
        packagingCost: result.packagingCost,
        productionVariance: result.productionVariance,
        totalCost: result.total,
        suggestedSellingPrice: result.suggestedSellingPrice,
        items,
        editableIngredients,
      });
    }
    iterations.sort((a, b) => iterationSortKey(a) - iterationSortKey(b));
    dishes.push({ recipeName, iterations });
  }

  dishes.sort((a, b) => a.recipeName.localeCompare(b.recipeName));
  return dishes;
}
