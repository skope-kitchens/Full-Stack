import Projection from "../models/projection.js";
import ProductionOrder from "../models/productionOrder.js";
import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";
import BrandStock from "../models/brandStock.js";
import IngredientIndent from "../models/ingredientIndent.js";
import PurchaseRegister from "../models/purchaseRegister.js";
import {
  extractIngredientsFromBOM,
  escapeRegex,
  normalizeUom,
} from "../utils/bomExpander.js";
import { convertQty } from "../utils/uomConvert.js";

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

    const { type, forDate, items, branchCode } = req.body || {};

    if (!branchCode || !String(branchCode).trim()) {
      return res.status(400).json({ message: "branchCode is required" });
    }

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
      branchCode: String(branchCode).trim(),
      submittedAt: new Date(),
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
    if (req.user.role === "RECIPE_MANAGER") q.branchCode = req.user.branchCode;

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
 * Branch-scoped stock cascade for a single raw ingredient.
 * Subtracts available stock level-by-level, never going negative at any level:
 *   1. SEMI_FINISHED fridge stock (brandName + branchCode)
 *   2. BRANCH_KITCHEN raw stock (brandName + branchCode)
 *   3. WAREHOUSE_DRY/CHILLER/FREEZER stock (brandName + the Recipe Manager's linked warehouseId)
 * Whatever remains after all three levels is the shortfall needing a vendor indent.
 */
async function applyStockCascade({ brandName, itemName, requiredQty, branchCode, warehouseId, uom }) {
  let remaining = requiredQty;
  const nameRegex = new RegExp(`^${escapeRegex(itemName)}$`, "i");

  const semiFinishedStocks = await BrandStock.find({
    brandName,
    itemName: nameRegex,
    location: "SEMI_FINISHED",
    branchCode,
    status: "Pending",
  }).lean();
  const semiFinishedQty = semiFinishedStocks.reduce((s, r) => s + Number(r.qtyRemaining || 0), 0);
  remaining = Math.max(0, remaining - semiFinishedQty);

  const branchKitchenStocks = await BrandStock.find({
    brandName,
    itemName: nameRegex,
    location: "BRANCH_KITCHEN",
    branchCode,
    status: "Pending",
  }).lean();
  const branchKitchenQty = branchKitchenStocks.reduce((s, r) => s + Number(r.qtyRemaining || 0), 0);
  remaining = Math.max(0, remaining - branchKitchenQty);

  let warehouseUom = uom;
  // Portion of the remaining (post-branch-kitchen) requirement that "Warehouse
  // Stock" can cover — already paid for, just needs to be moved into Branch
  // Kitchen via a single transfer indent (no client cost).
  let warehouseTransferQty = 0;

  // "Warehouse Stock" = whatever this brand has sitting in its Purchase Register
  // for this item, converted into the required uom. This is the single source
  // of truth for warehouse-level stock (everything is added to the system via
  // the Purchase Register), shown to the Recipe Manager as "Warehouse Stock".
  const purchaseRegisterBatches = await PurchaseRegister.find({
    brandName,
    itemName: nameRegex,
    status: "ACTIVE",
    qtyRemaining: { $gt: 0 },
  }).lean();
  let brandStockWarehouseQty = 0;
  for (const batch of purchaseRegisterBatches) {
    const converted = convertQty(Number(batch.qtyRemaining || 0), batch.uom, warehouseUom || uom);
    brandStockWarehouseQty += converted == null ? Number(batch.qtyRemaining || 0) : converted;
  }

  if (remaining > 0) {
    warehouseTransferQty = Math.min(brandStockWarehouseQty, remaining);
    remaining = Math.max(0, remaining - warehouseTransferQty);
  }

  return {
    semiFinishedQty: Number(semiFinishedQty.toFixed(4)),
    branchKitchenQty: Number(branchKitchenQty.toFixed(4)),
    warehouseQty: Number(brandStockWarehouseQty.toFixed(4)),
    warehouseUom: normalizeUom(warehouseUom || uom),
    brandStockWarehouseQty: Number(brandStockWarehouseQty.toFixed(4)),
    warehouseTransferQty: Number(warehouseTransferQty.toFixed(4)),
    shortfall: Number(remaining.toFixed(4)),
  };
}

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
 *         semiFinishedQty, branchKitchenQty, warehouseQty, warehouseUom,
 *         shortfall, sufficient
 *       }]
 *     }],
 *     directIngredients: [{
 *       itemName, qtyPerPortion, grossQty, grossUom,
 *       semiFinishedQty, branchKitchenQty, warehouseQty, warehouseUom,
 *       shortfall, sufficient
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

        // Run the branch-scoped stock cascade for each raw ingredient
        const warehouseIngredients = await Promise.all(
          rawLeaves.map(async (ri, idx) => {
            const requiredQtyPerBatch = Number((rawPerBatch[idx]?.qty || 0).toFixed(4));
            const requiredQty = Number(ri.qty.toFixed(4));

            const cascade = await applyStockCascade({
              brandName: projection.brandName,
              itemName: ri.itemName,
              requiredQty,
              branchCode: projection.branchCode,
              warehouseId: req.user.warehouseId,
              uom: ri.uom,
            });

            return {
              itemName: ri.itemName,
              ingredientBrand: "",
              requiredQtyPerBatch,
              requiredQty,
              requiredUom: ri.uom,
              semiFinishedQty: cascade.semiFinishedQty,
              branchKitchenQty: cascade.branchKitchenQty,
              warehouseQty: cascade.warehouseQty,
              warehouseUom: cascade.warehouseUom,
              brandStockWarehouseQty: cascade.brandStockWarehouseQty,
              warehouseTransferQty: cascade.warehouseTransferQty,
              shortfall: cascade.shortfall,
              sufficient: cascade.shortfall <= 0,
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

        const cascade = await applyStockCascade({
          brandName: projection.brandName,
          itemName: bomItem.refId,
          requiredQty: grossQty,
          branchCode: projection.branchCode,
          warehouseId: req.user.warehouseId,
          uom: grossUom,
        });

        directIngredients.push({
          itemName: bomItem.refId,
          ingredientBrand: String(bomItem.itemBrand || "").trim(),
          qtyPerPortion,
          grossQty: Number(grossQty.toFixed(4)),
          grossUom,
          semiFinishedQty: cascade.semiFinishedQty,
          branchKitchenQty: cascade.branchKitchenQty,
          warehouseQty: cascade.warehouseQty,
          warehouseUom: cascade.warehouseUom,
          brandStockWarehouseQty: cascade.brandStockWarehouseQty,
          warehouseTransferQty: cascade.warehouseTransferQty,
          shortfall: cascade.shortfall,
          sufficient: cascade.shortfall <= 0,
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
 *    warehouseIngredientsToDispatch: [{ itemName, requiredQty, uom }],
 *    warehouseTransferRequests: [{ itemName, qty, uom, ingredientBrand }]
 *  }
 */
export const convertProjectionToProductionOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      scaledTargetQty,
      subRecipesToPrepare = [],
      warehouseIngredientsToDispatch = [],
      warehouseTransferRequests = [],
    } = req.body || {};

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

    // ── 1a. Raise Warehouse Stock → branch kitchen transfer indents ────────────
    // These cover ingredients where Branch Kitchen is short but Warehouse Stock
    // (the brand's Purchase Register) already holds enough — stock already paid
    // for, just needs to be moved into Branch Kitchen. Sent to the Ingredient
    // Admin's indent queue as an INVENTORY_TRANSFER (cost 0, no client payment).
    // Issuing it credits Branch Kitchen and deducts the matching Purchase
    // Register batch (FEFO). Raised regardless of the fully-covered shortcut
    // below, since this is independent admin housekeeping.
    const transferDocs = (warehouseTransferRequests || [])
      .filter((t) => Number(t.qty) > 0 && String(t.itemName || "").trim())
      .map((t) => ({
        requestBrandName: projection.brandName,
        clientBrandId: projection.brandId,
        clientBrandName: projection.brandName,
        recipeId: projection._id,
        recipeKind: "main",
        recipeName: `Projection ${projection._id}`,
        branchCode: String(projection.branchCode || "JPNAGAR").trim().toUpperCase(),
        indentType: "INVENTORY_TRANSFER",
        skuCode: "",
        itemName: String(t.itemName || "").trim(),
        ingredientBrand: String(t.ingredientBrand || "").trim(),
        categoryName: String(t.categoryName || "").trim(),
        uom: String(t.uom || "").trim(),
        qty: Number(t.qty || 0),
        cost: 0,
        status: "INDENT_PENDING",
        isSeenByIngredientAdmin: false,
        isSeenByRecipeAdminGrn: false,
      }));

    if (transferDocs.length > 0) {
      await IngredientIndent.insertMany(transferDocs, { ordered: false });
      console.log(
        `[ConvertProjection] Projection ${id} → raised ${transferDocs.length} ` +
        `INVENTORY_TRANSFER indent(s) (brand: "${projection.brandName}")`
      );
    }

    const warehouseTransfersRaised = transferDocs.length;

    // ── 1b. Fully-covered shortcut ─────────────────────────────────────────
    // If nothing needs fresh batches (no subRecipesToPrepare) and nothing needs
    // procurement (no warehouseIngredientsToDispatch — frontend only sends items
    // with a positive shortfall), the fridge + branch kitchen already cover this
    // projection entirely. Skip the production-order/payment/dispatch pipeline
    // and mark the projection done directly — no new cost was incurred.
    if (subRecipesToPrepare.length === 0 && warehouseIngredientsToDispatch.length === 0) {
      projection.status = "COMPLETED";
      await projection.save();

      console.log(
        `[ConvertProjection] Projection ${id} → COMPLETED directly ` +
        `(brand: "${projection.brandName}") — fully covered by existing stock, no production needed`
      );

      return res.status(200).json({
        success: true,
        fullyCovered: true,
        warehouseTransfersRaised,
        message: warehouseTransfersRaised > 0
          ? "Fully covered by existing stock — a transfer indent was raised to top up Branch Kitchen. No production or procurement needed."
          : "Fully covered by existing stock — no production or procurement needed.",
        data: { projection },
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
    //
    // No-payment shortcut: if there's nothing in warehouseIngredientsToDispatch,
    // no new vendor procurement is needed (everything is covered by fridge,
    // branch kitchen, or a warehouse transfer already raised above) — so there's
    // nothing to invoice the client for. Skip AWAITING_BRAND_PAYMENT and
    // READY_FOR_DISPATCH entirely.
    //
    // If a warehouse transfer indent was raised, the kitchen must wait for the
    // Ingredient Admin to physically move that stock before cooking can start —
    // order starts AWAITING_WAREHOUSE_TRANSFER and is flipped to READY_TO_COOK by
    // issueIndentItem once the transfer is issued. Otherwise nothing is pending
    // and the order can go straight to IN_PREPARATION.
    const skipPayment = enrichedWarehouseIngredients.length === 0;
    const orderStatus = skipPayment
      ? (warehouseTransfersRaised > 0 ? "AWAITING_WAREHOUSE_TRANSFER" : "IN_PREPARATION")
      : "AWAITING_BRAND_PAYMENT";
    const financials = skipPayment
      ? { totalIngredientCost: 0, paymentStatus: "PAID", paidAt: new Date() }
      : { totalIngredientCost: Number(totalIngredientCost.toFixed(2)), paymentStatus: "UNPAID" };

    const productionOrder = await ProductionOrder.create({
      projectionId: projection._id,
      brandId: projection.brandId,
      brandName: projection.brandName,
      // Captures which kitchen is preparing this batch — used later to credit
      // the correct kitchen's fridge (SEMI_FINISHED stock) on completion.
      branchCode: req.user?.branchCode || null,
      scaledTargetQty: Number(scaledTargetQty || 0),
      status: orderStatus,
      financials,
      subRecipesToPrepare: subRecipesToPrepare.map((s) => ({
        subRecipeName: String(s.subRecipeName || "").trim(),
        batchesToPrepare: Number(s.batchesToPrepare || 0),
        netQtyNeeded: Number(s.netQtyNeeded || 0),
        uom: String(s.uom || "").trim(),
      })),
      warehouseIngredientsToDispatch: enrichedWarehouseIngredients,
    });

    console.log(
      `[ConvertProjection] Projection ${id} → ProductionOrder ${productionOrder._id} ${orderStatus} ` +
      `(brand: "${projection.brandName}", cost: ₹${totalIngredientCost.toFixed(2)})`
    );

    return res.status(201).json({
      success: true,
      skipPayment,
      warehouseTransfersRaised,
      data: { productionOrder, projection },
    });
  } catch (err) {
    console.error("convertProjectionToProductionOrder error:", err?.message || err);
    return res.status(500).json({ message: "Failed to convert projection to production order" });
  }
};
