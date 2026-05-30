import Projection from "../models/projection.js";
import ProductionOrder from "../models/productionOrder.js";
import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import BrandStock from "../models/brandStock.js";
import {
  extractIngredientsFromBOM,
  escapeRegex,
  normalizeUom,
} from "../utils/bomExpander.js";

/**
 * POST /api/projections
 * Client submits a sales projection for a future production date.
 * No wallet deduction occurs here — cost is calculated later at the Chef confirmation step.
 */
export const createProjection = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Only brand clients can submit projections" });
    }

    const { type, forDate, items } = req.body || {};

    if (!type || !["DAILY", "WEEKLY"].includes(type)) {
      return res.status(400).json({ message: "type must be DAILY or WEEKLY" });
    }

    if (!forDate) {
      return res.status(400).json({ message: "forDate is required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items must be a non-empty array" });
    }

    const cleaned = items
      .map((i) => ({
        recipeName: String(i.recipeName || "").trim(),
        targetQty: Number(i.targetQty || 0),
        uom: String(i.uom || "PC").trim(),
      }))
      .filter((i) => i.recipeName && i.targetQty > 0);

    if (cleaned.length === 0) {
      return res.status(400).json({
        message: "Each item must have a recipeName and a targetQty greater than 0",
      });
    }

    const projection = await Projection.create({
      brandId: req.user._id,
      brandName: req.user.brandName,
      type,
      forDate: new Date(forDate),
      items: cleaned,
      status: "PENDING_CHEF_REVIEW",
    });

    return res.status(201).json({ success: true, data: projection });
  } catch (err) {
    console.error("createProjection error:", err?.message || err);
    return res.status(500).json({ message: "Failed to create projection" });
  }
};

/**
 * GET /api/projections/my
 * Brand client views their own projection history.
 */
export const getMyProjections = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await Projection.find({ brandId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("getMyProjections error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch projections" });
  }
};

/**
 * GET /api/projections/pending
 * RECIPE_MANAGER views all projections awaiting chef review.
 * Only returns PENDING_CHEF_REVIEW status — not completed or cancelled ones.
 */
export const getPendingProjections = async (req, res) => {
  try {
    const { brandName, brandId } = req.query || {};
    const q = { status: "PENDING_CHEF_REVIEW" };
    if (brandName) q.brandName = String(brandName).trim();
    if (brandId) q.brandId = brandId;

    const list = await Projection.find(q)
      .sort({ forDate: 1, createdAt: 1 })
      .lean();

    return res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    console.error("getPendingProjections error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch pending projections" });
  }
};

/**
 * GET /api/projections/:id/net-requirements
 * Smart Net Production Engine.
 * RECIPE_MANAGER only.
 *
 * For each recipe item in the projection:
 *  1. Expands the main recipe BOM (sub-recipe level — not deep-leaf).
 *  2. Compares sub-recipe gross requirements against brand's kitchen fridge stock.
 *  3. Returns net new batches needed and warehouse raw ingredients needed.
 *
 * Response shape:
 * {
 *   projection: { ... },
 *   requirements: [{
 *     projectionItem: { recipeName, targetQty, uom },
 *     sopLink: string,
 *     subRecipes: [{
 *       subRecipeName, qtyPerPortion, grossQty, grossUom,
 *       fridgeQty, netQty, batchYield, batchesNeeded,
 *       warehouseIngredients: [{
 *         itemName, requiredQtyPerBatch, requiredQty, requiredUom,
 *         warehouseQty, warehouseUom, sufficient
 *       }]
 *     }],
 *     directIngredients: [{
 *       itemName, qtyPerPortion, grossQty, grossUom,
 *       warehouseQty, warehouseUom, sufficient
 *     }]
 *   }]
 * }
 */
export const getNetRequirements = async (req, res) => {
  try {
    const { id } = req.params;

    const projection = await Projection.findById(id).lean();
    if (!projection) {
      return res.status(404).json({ message: "Projection not found" });
    }

    const requirements = [];

    for (const projItem of projection.items) {
      const { recipeName, targetQty } = projItem;

      // ── 1. Find the main recipe ────────────────────────────────────────────
      const mainRecipe = await MainRecipe.findOne({
        recipeName,
        brand: projection.brandName,
      }).lean() || await MainRecipe.findOne({ recipeName }).lean();

      if (!mainRecipe) {
        requirements.push({
          projectionItem: projItem,
          sopLink: "",
          error: `No recipe found for "${recipeName}"`,
          subRecipes: [],
          directIngredients: [],
        });
        continue;
      }

      // ── 2. Sub-recipe level analysis ───────────────────────────────────────
      const subRecipeResults = [];

      for (const bomItem of mainRecipe.items) {
        if (String(bomItem.type || "").toUpperCase() !== "SUBRECIPE") continue;

        const sub = await SubRecipe.findOne({
          recipeName: bomItem.refId,
          brand: projection.brandName,
        }).lean() || await SubRecipe.findOne({ recipeName: bomItem.refId }).lean();

        if (!sub) continue;

        const qtyPerPortion = Number(bomItem.quantity || 0);
        const grossQty = qtyPerPortion * targetQty;
        const grossUom = normalizeUom(bomItem.uom || "KG");

        // Fridge stock — SEMI_FINISHED or BRANCH_KITCHEN for this brand
        const fridgeStocks = await BrandStock.find({
          brandName: projection.brandName,
          itemName: new RegExp(`^${escapeRegex(bomItem.refId)}$`, "i"),
          location: { $in: ["BRANCH_KITCHEN", "SEMI_FINISHED"] },
          status: "Pending",
        }).lean();
        const fridgeQty = fridgeStocks.reduce(
          (s, r) => s + Number(r.qtyRemaining || 0), 0
        );

        const netQty = Math.max(0, grossQty - fridgeQty);
        const batchYield = Math.max(Number(sub.yield || 1), 0.0001);
        const batchesNeeded = netQty > 0 ? Math.ceil(netQty / batchYield) : 0;

        // Raw ingredients needed for the net new batches.
        // extractIngredientsFromBOM returns leaf nodes; multiply by batchesNeeded batches.
        // Each batch produces batchYield units, and sub.items quantities are per-batch.
        const rawLeaves = batchesNeeded > 0
          ? await extractIngredientsFromBOM(sub.items, batchesNeeded, projection.brandName, new Set())
          : [];

        // Per-batch ingredient quantity for frontend live-recalculation
        const rawPerBatch = await extractIngredientsFromBOM(sub.items, 1, projection.brandName, new Set());

        // Look up warehouse stock for each raw ingredient
        const warehouseIngredients = await Promise.all(
          rawLeaves.map(async (ri, idx) => {
            const whStocks = await BrandStock.find({
              brandName: "SKOPE_WAREHOUSE",
              itemName: new RegExp(`^${escapeRegex(ri.itemName)}$`, "i"),
              status: "Pending",
            }).lean();
            const warehouseQty = whStocks.reduce(
              (s, r) => s + Number(r.qtyRemaining || 0), 0
            );
            const warehouseUom = normalizeUom(whStocks[0]?.uom || ri.uom);
            const requiredQtyPerBatch = Number((rawPerBatch[idx]?.qty || 0).toFixed(4));

            return {
              itemName: ri.itemName,
              requiredQtyPerBatch,
              requiredQty: Number(ri.qty.toFixed(4)),
              requiredUom: ri.uom,
              warehouseQty: Number(warehouseQty.toFixed(4)),
              warehouseUom,
              sufficient: warehouseQty >= ri.qty,
            };
          })
        );

        subRecipeResults.push({
          subRecipeName: bomItem.refId,
          qtyPerPortion,
          grossQty: Number(grossQty.toFixed(4)),
          grossUom,
          fridgeQty: Number(fridgeQty.toFixed(4)),
          netQty: Number(netQty.toFixed(4)),
          batchYield,
          batchesNeeded,
          warehouseIngredients,
        });
      }

      // ── 3. Direct raw INGREDIENT items on the main recipe BOM ─────────────
      const directIngredients = [];

      for (const bomItem of mainRecipe.items) {
        if (String(bomItem.type || "").toUpperCase() !== "INGREDIENT") continue;

        const qtyPerPortion = Number(bomItem.quantity || 0);
        const grossQty = qtyPerPortion * targetQty;
        const grossUom = normalizeUom(bomItem.uom || "KG");

        const whStocks = await BrandStock.find({
          brandName: "SKOPE_WAREHOUSE",
          itemName: new RegExp(`^${escapeRegex(bomItem.refId)}$`, "i"),
          status: "Pending",
        }).lean();
        const warehouseQty = whStocks.reduce(
          (s, r) => s + Number(r.qtyRemaining || 0), 0
        );
        const warehouseUom = normalizeUom(whStocks[0]?.uom || grossUom);

        directIngredients.push({
          itemName: bomItem.refId,
          qtyPerPortion,
          grossQty: Number(grossQty.toFixed(4)),
          grossUom,
          warehouseQty: Number(warehouseQty.toFixed(4)),
          warehouseUom,
          sufficient: warehouseQty >= grossQty,
        });
      }

      requirements.push({
        projectionItem: projItem,
        sopLink: mainRecipe.sopLink || "",
        subRecipes: subRecipeResults,
        directIngredients,
      });
    }

    return res.json({ success: true, data: { projection, requirements } });
  } catch (err) {
    console.error("getNetRequirements error:", err?.message || err);
    return res.status(500).json({ message: "Failed to calculate net requirements" });
  }
};

/**
 * POST /api/projections/:id/convert
 * RECIPE_MANAGER only.
 *
 * Chef confirms a reviewed projection. This:
 *  1. Guards against re-submission (idempotency via status check).
 *  2. Derives ingredient unit costs from sub-recipe BOMs stored in DB.
 *  3. Calculates totalIngredientCost from requiredQty × netPrice per ingredient.
 *  4. Flips projection status → CHEF_CONFIRMED.
 *  5. Creates a ProductionOrder at PENDING_INDENT_APPROVAL.
 *
 * Request body:
 *  {
 *    scaledTargetQty: number,
 *    subRecipesToPrepare: [{ subRecipeName, batchesToPrepare, netQtyNeeded, uom }],
 *    warehouseIngredientsToDispatch: [{ itemName, requiredQty, uom }]
 *  }
 */
export const convertProjectionToProductionOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { scaledTargetQty, subRecipesToPrepare = [], warehouseIngredientsToDispatch = [] } =
      req.body || {};

    // ── 1. Load and validate the projection ───────────────────────────────────
    const projection = await Projection.findById(id);
    if (!projection) {
      return res.status(404).json({ message: "Projection not found" });
    }
    if (projection.status !== "PENDING_CHEF_REVIEW") {
      return res.status(409).json({
        message: `Cannot convert: projection is already "${projection.status}"`,
        currentStatus: projection.status,
      });
    }

    // ── 2. Derive ingredient netPrice from sub-recipe BOMs ────────────────────
    // Build itemName (lowercase) → netPrice map across all referenced sub-recipes.
    const subRecipeNames = subRecipesToPrepare.map((s) => String(s.subRecipeName || "").trim());
    const subDocs = await SubRecipe.find({
      recipeName: { $in: subRecipeNames },
    }).lean();

    const priceMap = new Map();
    for (const sub of subDocs) {
      for (const item of sub.items || []) {
        if (item.refId && item.netPrice != null) {
          const key = String(item.refId).trim().toLowerCase();
          // Use the first price found; sub-recipes for the same brand take priority
          if (!priceMap.has(key)) priceMap.set(key, Number(item.netPrice || 0));
        }
      }
    }

    // ── 3. Enrich warehouse ingredients with cost contribution ─────────────────
    let totalIngredientCost = 0;
    const enrichedWarehouseIngredients = warehouseIngredientsToDispatch.map((wi) => {
      const key = String(wi.itemName || "").trim().toLowerCase();
      const unitPrice = priceMap.get(key) || 0;
      const costContribution = Number(wi.requiredQty || 0) * unitPrice;
      totalIngredientCost += costContribution;
      return {
        itemName: String(wi.itemName || "").trim(),
        requiredQty: Number(wi.requiredQty || 0),
        uom: String(wi.uom || "").trim(),
        costContribution: Number(costContribution.toFixed(2)),
      };
    });

    // ── 4. Flip projection status → CHEF_CONFIRMED ────────────────────────────
    projection.status = "CHEF_CONFIRMED";
    await projection.save();

    // ── 5. Create the production order ────────────────────────────────────────
    // Chef confirmation is the approval — skip PENDING_INDENT_APPROVAL entirely
    // so the brand client can pay their invoice immediately.
    const productionOrder = await ProductionOrder.create({
      projectionId: projection._id,
      brandId: projection.brandId,
      brandName: projection.brandName,
      scaledTargetQty: Number(scaledTargetQty || 0),
      status: "AWAITING_BRAND_PAYMENT",
      financials: {
        totalIngredientCost: Number(totalIngredientCost.toFixed(2)),
        paymentStatus: "UNPAID",
      },
      subRecipesToPrepare: subRecipesToPrepare.map((s) => ({
        subRecipeName: String(s.subRecipeName || "").trim(),
        batchesToPrepare: Number(s.batchesToPrepare || 0),
        netQtyNeeded: Number(s.netQtyNeeded || 0),
        uom: String(s.uom || "").trim(),
      })),
      warehouseIngredientsToDispatch: enrichedWarehouseIngredients,
    });

    console.log(
      `[ConvertProjection] Projection ${id} → ProductionOrder ${productionOrder._id} AWAITING_BRAND_PAYMENT ` +
      `(brand: "${projection.brandName}", cost: ₹${totalIngredientCost.toFixed(2)})`
    );

    return res.status(201).json({
      success: true,
      data: { productionOrder, projection },
    });
  } catch (err) {
    console.error("convertProjectionToProductionOrder error:", err?.message || err);
    return res.status(500).json({ message: "Failed to convert projection to production order" });
  }
};
