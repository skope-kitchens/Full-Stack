/**
 * recipeImport.js — Recipe Import engine (Head Chef dashboard, CLAUDE.md §26).
 *
 * Parses a standardised .xlsx workbook (MainRecipes / SubRecipes / ItemMasters)
 * and runs a 3-pass, dependency-ordered validation (ItemMasters → SubRecipes →
 * MainRecipes) WITHOUT writing to the DB. The same validateImport() result is
 * reused by both the dry-run preview and the transactional commit, so what the
 * user previews is exactly what gets written.
 *
 * SCHEMA-DRIVEN CONSTRAINTS (the schemas are frozen — see HARD RULES):
 *   - Allowed units are GM / KG / PC only. ItemMaster.uom and SubRecipe item.uom
 *     enums do NOT include ML/L, so ML/L would fail validation on save. We reject
 *     them up-front with a clear error instead of letting a transaction roll back.
 *   - Item identity in a recipe is its `refId` (see bomExpander.js): for an
 *     INGREDIENT item, refId is the ingredient NAME (matched against
 *     brand_stocks.itemName by the cascade); for a SUBRECIPE item, refId is the
 *     sub-recipe's recipeName. We write refId accordingly.
 *   - SubRecipe items REQUIRE refId, quantity, uom AND netPrice. netPrice is
 *     seeded to 0 — pricing is owned by the POC FCR flow (§17/§18), not import.
 *   - SubRecipe batch-yield (the prepared output quantity the cascade scales by)
 *     is NOT derivable from the cooking Yield%, so the SubRecipes sheet carries a
 *     dedicated "Batch Yield Qty" column → stored on SubRecipe.yield.
 *
 * NO schema changes. NO modification of the existing recipe-creation controllers.
 */
import crypto from "crypto";
import ExcelJS from "exceljs";

import ItemMaster from "../models/itemMaster.js";
import SubRecipe from "../models/subrecipe.models.js";
import MainRecipe from "../models/mainrecipe.models.js";
import { escapeRegex } from "./bomExpander.js";

/* ============================================================
 * Constants — the documented template shape
 * ========================================================== */
export const ALLOWED_UNITS = ["GM", "KG", "PC"];
const ALLOWED_SET = new Set(ALLOWED_UNITS);

const SHEET = {
  MAIN: "MainRecipes",
  SUB: "SubRecipes",
  ITEM: "ItemMasters",
};

// Column order (1-indexed) per the documented template.
const MAIN_COLS = ["Recipe Name", "Item Name", "Unit", "Quantity"];
const SUB_COLS = ["SubRecipe Name", "Item Name", "Unit", "Quantity", "Yield Percent", "Batch Yield Qty"];
const ITEM_COLS = ["Item Name", "Unit", "Shelf Life Days", "Min Stock Level", "Min Stock Uom"];

/* ============================================================
 * Cell / string helpers
 * ========================================================== */

// Coerce any ExcelJS cell value (string, number, richText, formula, hyperlink,
// date, null) to a trimmed plain string.
function cellStr(cell) {
  if (!cell) return "";
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v).trim();
  if (typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text || "").join("").trim();
    if (v.result != null) return String(v.result).trim(); // formula
    if (v.text != null) return String(v.text).trim(); // hyperlink
    if (v.formula != null) return ""; // formula with no cached result
  }
  return String(v).trim();
}

// Normalised key for case/whitespace-insensitive matching.
export const normName = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

// Sub-recipe reference detection — exactly the "SR:" prefix (space optional).
const SR_PREFIX = /^SR:\s*/i;
const isSubRef = (name) => SR_PREFIX.test(String(name || "").trim());
const stripSubRef = (name) => String(name || "").trim().replace(SR_PREFIX, "").trim();

const brandExactRegex = (brandName) =>
  new RegExp(`^${escapeRegex(String(brandName || "").trim())}$`, "i");

// Parse a numeric cell; returns null when blank or non-numeric.
function toNumber(str) {
  const s = String(str || "").trim();
  if (s === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/* ============================================================
 * Template generation (served for download)
 * ========================================================== */
export async function buildTemplateWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Skope Kitchens";
  wb.created = new Date();

  const addSheet = (name, headers, sampleRows) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    ws.columns = headers.map((h) => ({ width: Math.max(16, h.length + 4) }));
    (sampleRows || []).forEach((r) => ws.addRow(r));
  };

  addSheet(SHEET.MAIN, MAIN_COLS, [
    ["Chicken Roast", "Chicken", "GM", 250],
    ["Chicken Roast", "SR: Roast Masala", "GM", 40],
    ["Chicken Roast", "Butter Paper", "PC", 1],
  ]);
  addSheet(SHEET.SUB, SUB_COLS, [
    // Batch Yield Qty is entered once per sub-recipe (first row); leave blank on
    // the remaining rows of the same sub-recipe.
    ["Roast Masala", "Red Chilli Powder", "GM", 500, 100, 1000],
    ["Roast Masala", "Salt", "GM", 200, 100, ""],
    ["Roast Masala", "Oil", "GM", 300, 95, ""],
  ]);
  addSheet(SHEET.ITEM, ITEM_COLS, [
    ["Chicken", "GM", 2, 5000, "GM"],
    ["Red Chilli Powder", "GM", 180, 1000, "GM"],
  ]);

  // Add a short instructions sheet so the file is self-documenting.
  const help = wb.addWorksheet("README");
  [
    ["Skope Kitchens — Recipe Import Template"],
    [""],
    ["Units allowed: GM, KG, PC only (ML / L are not supported)."],
    ["Sub-recipe references in MainRecipes MUST be prefixed exactly with 'SR: '."],
    ["SubRecipes contain ONLY raw ingredients — no nested 'SR:' references."],
    ["Batch Yield Qty = the prepared output quantity of one batch of the sub-recipe,"],
    ["   in the same unit the MainRecipe references it by. Enter it once per sub-recipe."],
    ["Yield Percent = cooking yield (1-100), default 100 if blank."],
    ["ItemMasters sheet is optional; if omitted, items are auto-created from the recipes."],
    ["Prices are NOT imported here — FCR pricing is entered later by the POC."],
  ].forEach((r) => help.addRow(r));
  help.getRow(1).font = { bold: true };
  help.getColumn(1).width = 90;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/* ============================================================
 * Parsing
 * ========================================================== */

// Find a worksheet by name, case-insensitively.
function findSheet(wb, name) {
  const target = name.trim().toLowerCase();
  return wb.worksheets.find((ws) => String(ws.name || "").trim().toLowerCase() === target) || null;
}

// Read data rows (row 2+) from a sheet into objects keyed by field, each carrying
// its Excel rowNumber. Rows where every captured field is blank are skipped.
function readRows(ws, fieldNames) {
  const rows = [];
  if (!ws) return rows;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const rec = { rowNum: rowNumber };
    let allBlank = true;
    fieldNames.forEach((field, i) => {
      const val = cellStr(row.getCell(i + 1));
      rec[field] = val;
      if (val !== "") allBlank = false;
    });
    if (!allBlank) rows.push(rec);
  });
  return rows;
}

/**
 * parseWorkbook — load the .xlsx buffer and extract raw rows from each sheet.
 * Throws only when the buffer is not a readable workbook. Missing sheets are
 * reported as structural flags (validateImport turns required-sheet-absence into
 * a blocking error).
 */
export async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const mainWs = findSheet(wb, SHEET.MAIN);
  const subWs = findSheet(wb, SHEET.SUB);
  const itemWs = findSheet(wb, SHEET.ITEM);

  return {
    hasMain: !!mainWs,
    hasSub: !!subWs,
    hasItems: !!itemWs,
    mainRows: readRows(mainWs, ["recipeName", "itemName", "unit", "quantity"]),
    subRows: readRows(subWs, ["subName", "itemName", "unit", "quantity", "yieldPercent", "batchYield"]),
    itemRows: readRows(itemWs, ["itemName", "unit", "shelfLifeDays", "minStockLevel", "minStockUom"]),
  };
}

// Stable token over the brand + the uploaded file bytes. Commit must echo the
// token returned by preview, guaranteeing the committed file is the previewed one.
export function importToken(brandName, buffer) {
  return crypto
    .createHash("sha256")
    .update(String(brandName || "").trim().toLowerCase())
    .update(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer))
    .digest("hex");
}

/* ============================================================
 * Validation — the 3 passes
 * ========================================================== */

/**
 * validateImport — read-only 3-pass validation. Returns the preview plan, the
 * warnings/errors lists, and the fully-normalized write payload (consumed by the
 * commit). No DB writes; only lookups of existing ItemMasters / SubRecipes /
 * MainRecipes.
 */
export async function validateImport({ brandName, parsed }) {
  const errors = [];
  const warnings = [];
  const { hasMain, hasSub, hasItems, mainRows, subRows, itemRows } = parsed;

  // ── Structural ──────────────────────────────────────────────────────────
  if (!hasMain) errors.push("Workbook is missing the required 'MainRecipes' sheet.");
  if (!hasSub) errors.push("Workbook is missing the required 'SubRecipes' sheet.");
  if (errors.length) return { plan: emptyPlan(), warnings, errors, normalized: null };
  if (!mainRows.length) errors.push("MainRecipes sheet has no data rows.");

  // canonical display name per normalized item key (existing DB casing wins)
  const canonicalItem = new Map(); // normName → displayName
  // unit seen per item across the spreadsheet, for the consistency check
  const itemUnit = new Map(); // normName → { unit, firstRef }

  const recordItemUnit = (rawName, rawUnit, sheet, rowNum) => {
    const key = normName(rawName);
    const unit = String(rawUnit || "").trim().toUpperCase();
    if (!canonicalItem.has(key)) canonicalItem.set(key, String(rawName).trim());
    if (!ALLOWED_SET.has(unit)) {
      errors.push(
        `${sheet} row ${rowNum}: '${String(rawName).trim()}' has unit '${rawUnit || "(blank)"}' — only GM, KG, PC are allowed.`
      );
      return;
    }
    const prev = itemUnit.get(key);
    if (prev && prev.unit !== unit) {
      errors.push(
        `Item '${String(rawName).trim()}' has unit '${prev.unit}' in ${prev.firstRef} but '${unit}' in ${sheet} row ${rowNum}. Pick one and update both.`
      );
    } else if (!prev) {
      itemUnit.set(key, { unit, firstRef: `${sheet} row ${rowNum}` });
    }
  };

  /* ── PASS 1 — ItemMasters / units ──────────────────────────────────────── */
  // Collect every raw ingredient name + its unit from all sheets.
  for (const r of mainRows) {
    if (!r.recipeName && !r.itemName) continue;
    if (!r.itemName) {
      errors.push(`MainRecipes row ${r.rowNum} (recipe '${r.recipeName || "?"}'): Item Name is blank.`);
      continue;
    }
    if (isSubRef(r.itemName)) continue; // sub-recipe ref, handled in pass 3
    recordItemUnit(r.itemName, r.unit, SHEET.MAIN, r.rowNum);
  }
  for (const r of subRows) {
    if (!r.itemName) {
      errors.push(`SubRecipes row ${r.rowNum} (sub-recipe '${r.subName || "?"}'): Item Name is blank.`);
      continue;
    }
    if (isSubRef(r.itemName)) {
      errors.push(
        `SubRecipes row ${r.rowNum}: '${r.itemName}' is a sub-recipe reference. Sub-recipes cannot contain other sub-recipes (no nesting).`
      );
      continue;
    }
    recordItemUnit(r.itemName, r.unit, SHEET.SUB, r.rowNum);
  }
  // ItemMasters sheet overrides (optional). Also feeds unit consistency.
  const itemSheetOverrides = new Map(); // normName → {shelfLifeDays,minStockLevel,minStockUom}
  for (const r of itemRows) {
    if (!r.itemName) {
      warnings.push(`ItemMasters row ${r.rowNum}: blank Item Name skipped.`);
      continue;
    }
    recordItemUnit(r.itemName, r.unit, SHEET.ITEM, r.rowNum);
    itemSheetOverrides.set(normName(r.itemName), {
      shelfLifeDays: toNumber(r.shelfLifeDays),
      minStockLevel: toNumber(r.minStockLevel),
      minStockUom: String(r.minStockUom || "").trim() || null,
    });
  }

  // Existing ItemMasters (brand-agnostic catalog).
  const existingItemDocs = await ItemMaster.find({}, { itemName: 1, uom: 1 }).lean();
  const existingItemByName = new Map();
  for (const d of existingItemDocs) existingItemByName.set(normName(d.itemName), d);

  const itemMastersToCreate = [];
  let itemMastersAlreadyExist = 0;
  for (const [key, info] of itemUnit.entries()) {
    const existing = existingItemByName.get(key);
    if (existing) {
      itemMastersAlreadyExist += 1;
      // Reuse existing catalog casing as the canonical refId; do NOT modify it.
      canonicalItem.set(key, existing.itemName);
      continue;
    }
    const ov = itemSheetOverrides.get(key) || {};
    itemMastersToCreate.push({
      itemName: canonicalItem.get(key),
      uom: info.unit,
      shelfLifeDays: ov.shelfLifeDays ?? null,
      minStockLevel: ov.minStockLevel ?? null,
      minStockUom: ov.minStockUom ?? null,
    });
  }
  if (itemMastersToCreate.length) {
    warnings.push(
      `${itemMastersToCreate.length} new ItemMaster(s) will be created. Confirm these aren't typos of existing ingredients before importing.`
    );
  }

  /* ── PASS 2 — SubRecipes ───────────────────────────────────────────────── */
  const existingSubDocs = await SubRecipe.find({ brand: brandExactRegex(brandName) }, { recipeName: 1 }).lean();
  const existingSubByName = new Map();
  for (const d of existingSubDocs) existingSubByName.set(normName(d.recipeName), d);

  // group sub rows
  const subGroups = new Map(); // normName → { displayName, rows: [] }
  for (const r of subRows) {
    if (!r.itemName || isSubRef(r.itemName)) continue; // errors already recorded
    const key = normName(r.subName);
    if (!key) {
      errors.push(`SubRecipes row ${r.rowNum}: SubRecipe Name is blank.`);
      continue;
    }
    if (!subGroups.has(key)) subGroups.set(key, { displayName: String(r.subName).trim(), rows: [] });
    subGroups.get(key).rows.push(r);
  }

  const subRecipesToCreate = [];
  const subRecipesToUpdate = [];
  const plannedSubNames = new Set(); // normName of every sub that will exist after import
  for (const [key, info] of existingSubByName) plannedSubNames.add(key);

  for (const [key, group] of subGroups.entries()) {
    // batch yield — entered once per sub-recipe (any non-blank row of the group)
    let batchYield = null;
    for (const r of group.rows) {
      const b = toNumber(r.batchYield);
      if (b != null) { batchYield = b; break; }
    }
    if (batchYield == null || !(batchYield > 0)) {
      errors.push(
        `SubRecipe '${group.displayName}': Batch Yield Qty is required (a positive number, entered once per sub-recipe).`
      );
    }

    const items = [];
    for (const r of group.rows) {
      const qty = toNumber(r.quantity);
      const unit = String(r.unit || "").trim().toUpperCase();
      if (qty == null || !(qty > 0)) {
        errors.push(`SubRecipes row ${r.rowNum} (sub-recipe '${group.displayName}'): Quantity must be a positive number.`);
        continue;
      }
      // Yield Percent 1-100, default 100
      let yieldPct = toNumber(r.yieldPercent);
      if (yieldPct == null) yieldPct = 100;
      if (!(yieldPct >= 1 && yieldPct <= 100)) {
        errors.push(`SubRecipes row ${r.rowNum} (sub-recipe '${group.displayName}'): Yield Percent ${r.yieldPercent} is out of range (must be 1-100).`);
        continue;
      }
      const ikey = normName(r.itemName);
      const refName = canonicalItem.get(ikey) || String(r.itemName).trim();
      items.push({
        type: "INGREDIENT",
        category: "Food",
        refId: refName,
        quantity: qty,
        uom: ALLOWED_SET.has(unit) ? unit : "GM",
        yield: yieldPct,
        netPrice: 0,
      });
    }

    plannedSubNames.add(key);
    const existing = existingSubByName.get(key);
    const payload = {
      recipeName: existing ? existing.recipeName : group.displayName,
      yield: batchYield != null && batchYield > 0 ? batchYield : 0,
      items,
    };
    if (existing) {
      subRecipesToUpdate.push({ _id: existing._id, ...payload });
      warnings.push(`Sub-recipe '${payload.recipeName}' already exists for this brand. Importing will UPDATE its ingredients.`);
    } else {
      subRecipesToCreate.push(payload);
    }
  }

  /* ── PASS 3 — MainRecipes ──────────────────────────────────────────────── */
  const existingMainDocs = await MainRecipe.find({ brand: brandExactRegex(brandName) }, { recipeName: 1 }).lean();
  const existingMainByName = new Map();
  for (const d of existingMainDocs) existingMainByName.set(normName(d.recipeName), d);

  // canonical sub display name for refId (existing casing wins, else sheet casing)
  const subDisplay = new Map();
  for (const [k, v] of existingSubByName) subDisplay.set(k, v.recipeName);
  for (const [k, g] of subGroups) if (!subDisplay.has(k)) subDisplay.set(k, g.displayName);

  const mainGroups = new Map();
  for (const r of mainRows) {
    if (!r.itemName) continue; // blank already errored
    const key = normName(r.recipeName);
    if (!key) {
      errors.push(`MainRecipes row ${r.rowNum}: Recipe Name is blank.`);
      continue;
    }
    if (!mainGroups.has(key)) mainGroups.set(key, { displayName: String(r.recipeName).trim(), rows: [] });
    mainGroups.get(key).rows.push(r);
  }

  const mainRecipesToCreate = [];
  const mainRecipesToUpdate = [];
  for (const [key, group] of mainGroups.entries()) {
    const items = [];
    for (const r of group.rows) {
      const qty = toNumber(r.quantity);
      const unit = String(r.unit || "").trim().toUpperCase();
      if (qty == null || !(qty > 0)) {
        errors.push(`MainRecipes row ${r.rowNum} (recipe '${group.displayName}'): Quantity must be a positive number.`);
        continue;
      }
      if (isSubRef(r.itemName)) {
        const subName = stripSubRef(r.itemName);
        const skey = normName(subName);
        if (!plannedSubNames.has(skey)) {
          errors.push(
            `MainRecipes row ${r.rowNum} (recipe '${group.displayName}'): SR '${subName}' not found in SubRecipes sheet (or existing sub-recipes). Add it or check spelling.`
          );
          continue;
        }
        items.push({
          type: "SUBRECIPE",
          category: "Food",
          refId: subDisplay.get(skey) || subName,
          quantity: qty,
          uom: ALLOWED_SET.has(unit) ? unit : "GM",
          netPrice: 0,
        });
      } else {
        const ikey = normName(r.itemName);
        if (!itemUnit.has(ikey) && !existingItemByName.has(ikey)) {
          // Should not happen (pass 1 collected it), but guard anyway.
          errors.push(`MainRecipes row ${r.rowNum} (recipe '${group.displayName}'): ingredient '${r.itemName}' could not be resolved.`);
          continue;
        }
        items.push({
          type: "INGREDIENT",
          category: "Food",
          refId: canonicalItem.get(ikey) || String(r.itemName).trim(),
          quantity: qty,
          uom: ALLOWED_SET.has(unit) ? unit : "GM",
          netPrice: 0,
        });
      }
    }

    const existing = existingMainByName.get(key);
    const payload = { recipeName: existing ? existing.recipeName : group.displayName, items };
    if (existing) {
      mainRecipesToUpdate.push({ _id: existing._id, ...payload });
      warnings.push(`Recipe '${payload.recipeName}' already exists for this brand. Importing will UPDATE its items.`);
    } else {
      mainRecipesToCreate.push(payload);
    }
  }

  const plan = {
    itemMastersToCreate: itemMastersToCreate.length,
    itemMastersAlreadyExist,
    subRecipesToCreate: subRecipesToCreate.length,
    subRecipesToUpdate: subRecipesToUpdate.length,
    mainRecipesToCreate: mainRecipesToCreate.length,
    mainRecipesToUpdate: mainRecipesToUpdate.length,
  };

  const normalized =
    errors.length === 0
      ? { itemMastersToCreate, subRecipesToCreate, subRecipesToUpdate, mainRecipesToCreate, mainRecipesToUpdate }
      : null;

  return { plan, warnings, errors, normalized };
}

function emptyPlan() {
  return {
    itemMastersToCreate: 0,
    itemMastersAlreadyExist: 0,
    subRecipesToCreate: 0,
    subRecipesToUpdate: 0,
    mainRecipesToCreate: 0,
    mainRecipesToUpdate: 0,
  };
}
