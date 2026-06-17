import ProductionOrder from "../models/productionOrder.js";
import User from "../models/user.js";
import BrandStock from "../models/brandStock.js";
import SubRecipe from "../models/subrecipe.models.js";
import Projection from "../models/projection.js";
import { escapeRegex, extractIngredientsFromBOM, aggregateIngredients } from "../utils/bomExpander.js";

/**
 * PATCH /api/production-orders/:id/request-payment
 * WALLET_MANAGER only.
 * Advances a production order from PENDING_INDENT_APPROVAL → AWAITING_BRAND_PAYMENT.
 */
export const reviewAndAdvanceToPayment = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Production order not found" });
    }
    if (order.status !== "PENDING_INDENT_APPROVAL") {
      return res.status(409).json({
        message: `Cannot advance: order is already "${order.status}"`,
        currentStatus: order.status,
      });
    }

    order.status = "AWAITING_BRAND_PAYMENT";
    await order.save();

    console.log(
      `[ReviewAndAdvanceToPayment] ProductionOrder ${id} → AWAITING_BRAND_PAYMENT ` +
      `(brand: "${order.brandName}", cost: ₹${order.financials?.totalIngredientCost})`
    );

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("reviewAndAdvanceToPayment error:", err?.message || err);
    return res.status(500).json({ message: "Failed to advance production order" });
  }
};

/**
 * POST /api/production-orders/:id/pay
 * Client auth only — brandId on the order must match req.user._id.
 *
 * Atomic wallet deduction via findOneAndUpdate with balance threshold guard
 * (ADR-08: prevents TOCTOU race conditions).
 * On success: flips order → READY_FOR_DISPATCH, paymentStatus → PAID.
 */
export const executeBrandProductionPayment = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Only brand clients can pay production invoices" });
    }

    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Production order not found" });
    }

    if (order.brandId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorised to pay this invoice" });
    }

    if (order.status !== "AWAITING_BRAND_PAYMENT") {
      return res.status(409).json({
        message: `Cannot pay: order status is "${order.status}"`,
        currentStatus: order.status,
      });
    }

    const cost = Number(order.financials?.totalIngredientCost || 0);

    // Atomic balance deduction — only succeeds when balance >= cost
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user._id, "wallet.balance": { $gte: cost } },
      {
        $inc: { "wallet.balance": -cost },
        $push: {
          "wallet.transactions": {
            amount: cost,
            type: "debit",
            source: "order",
            reason: `Production invoice #${order._id.toString().slice(-6).toUpperCase()} — ${order.brandName}`,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        message: "Insufficient wallet funds. Please top up your brand balance.",
      });
    }

    order.status = "READY_FOR_DISPATCH";
    order.financials.paymentStatus = "PAID";
    order.financials.paidAt = new Date();
    await order.save();

    console.log(
      `[ExecuteBrandProductionPayment] ProductionOrder ${id} PAID → READY_FOR_DISPATCH ` +
      `(brand: "${order.brandName}", cost: ₹${cost}, newBalance: ₹${updatedUser.wallet.balance})`
    );

    return res.json({
      success: true,
      data: {
        productionOrder: order,
        newBalance: updatedUser.wallet.balance,
      },
    });
  } catch (err) {
    console.error("executeBrandProductionPayment error:", err?.message || err);
    return res.status(500).json({ message: "Failed to process production payment" });
  }
};

/**
 * GET /api/production-orders/ready-for-dispatch
 * INGREDIENT_MANAGER only.
 * Returns all production orders with status READY_FOR_DISPATCH (payment confirmed, cargo not yet sent).
 */
export const getReadyForDispatchOrders = async (req, res) => {
  try {
    const orders = await ProductionOrder.find({ status: "READY_FOR_DISPATCH" })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error("getReadyForDispatchOrders error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch dispatch queue" });
  }
};

/**
 * PATCH /api/production-orders/:id/dispatch
 * INGREDIENT_MANAGER only.
 *
 * For each item in warehouseIngredientsToDispatch:
 *   - Deducts qtyRemaining from SKOPE_WAREHOUSE brand_stocks (best-effort — does not block transition).
 *   - Appends TRANSFER_OUT history entry.
 * Advances order status → IN_PREPARATION.
 */
export const dispatchWarehouseIngredients = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Production order not found" });
    }
    if (!["AWAITING_BRAND_PAYMENT", "READY_FOR_DISPATCH"].includes(order.status)) {
      return res.status(400).json({
        message: `Cannot dispatch: order status is "${order.status}"`,
        currentStatus: order.status,
      });
    }

    // Deduct each ingredient from SKOPE_WAREHOUSE brand_stocks (best-effort)
    for (const item of order.warehouseIngredientsToDispatch) {
      await BrandStock.findOneAndUpdate(
        {
          brandName: "SKOPE_WAREHOUSE",
          itemName: new RegExp(`^${escapeRegex(item.itemName)}$`, "i"),
          location: { $in: ["WAREHOUSE_DRY", "WAREHOUSE_CHILLER", "WAREHOUSE_FREEZER"] },
          status: "Pending",
        },
        {
          $inc: { qtyRemaining: -item.requiredQty },
          $push: {
            history: {
              type: "TRANSFER_OUT",
              qty: item.requiredQty,
              uom: item.uom,
              at: new Date(),
              note: "Cargo physically dispatched to kitchen station for production run",
            },
          },
        }
      );
    }

    order.status = "IN_PREPARATION";
    await order.save();

    console.log(
      `[DispatchWarehouseIngredients] ProductionOrder ${id} → IN_PREPARATION ` +
      `(brand: "${order.brandName}", items: ${order.warehouseIngredientsToDispatch.length})`
    );

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("dispatchWarehouseIngredients error:", err?.message || err);
    return res.status(500).json({ message: "Failed to dispatch warehouse ingredients" });
  }
};

/**
 * GET /api/production-orders/:id/status
 * Auth only (client or recipe manager).
 * Lightweight polling endpoint — returns current status of a single order.
 */
export const getProductionOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await ProductionOrder.findById(id)
      .select("status brandId brandName financials")
      .lean();
    if (!order) {
      return res.status(404).json({ message: "Production order not found" });
    }
    return res.json({ success: true, status: order.status, data: order });
  } catch (err) {
    console.error("getProductionOrderStatus error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch order status" });
  }
};

/**
 * PATCH /api/production-orders/:id/complete
 * RECIPE_MANAGER only.
 *
 * Final milestone in the production pipeline. For each sub-recipe prepared:
 *  - Upserts a SEMI_FINISHED brand_stocks record for the brand's kitchen (ADR-09).
 *  - $inc qtyRemaining by (batchesToPrepare × subRecipe.yield).
 *  - $push RECEIVED history entry.
 * Advances order → COMPLETED and linked projection → COMPLETED.
 */
export const completeBatchPreparation = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Production order not found" });
    }
    if (!["IN_PREPARATION", "READY_TO_COOK"].includes(order.status)) {
      return res.status(400).json({
        message: `Cannot complete: order status is "${order.status}"`,
        currentStatus: order.status,
      });
    }

    // Branch the cooked food belongs to — taken from the order (set when the chef
    // confirmed the projection), falling back to the completing chef's own branch.
    const branchCode = order.branchCode || req.user?.branchCode || null;

    // Tracks what actually happened to the fridge so the frontend can show an
    // accurate message instead of always claiming "fridge updated".
    const fridgeUpdated = [];
    const fridgeSkipped = [];

    // Tracks Branch Kitchen raw-ingredient deductions caused by this batch's BOM.
    // Only ingredients that are actually part of the prepared sub-recipe(s) are
    // touched — anything else in the kitchen's BRANCH_KITCHEN stock is untouched.
    const ingredientsDeducted = [];
    const ingredientsSkipped = [];

    // Upsert kitchen fridge stock for each prepared sub-recipe
    for (const item of order.subRecipesToPrepare) {
      if (!item.batchesToPrepare || item.batchesToPrepare <= 0) {
        fridgeSkipped.push({ subRecipeName: item.subRecipeName, reason: "No additional batches were required" });
        continue;
      }

      // No branch code could be resolved for this order/chef — most likely the chef's
      // login session predates branch-code assignment. Refuse to write a SEMI_FINISHED
      // record with branchCode: null, since it would be invisible to the Fridge Audit
      // page. Surface this clearly instead of silently "succeeding".
      if (!branchCode) {
        fridgeSkipped.push({
          subRecipeName: item.subRecipeName,
          reason: "No branch code on this account — log out and log back in, then contact admin to re-run this step",
        });
        continue;
      }

      const subRecipe =
        (await SubRecipe.findOne({
          recipeName: item.subRecipeName,
          brand: order.brandName,
        }).lean()) ||
        (await SubRecipe.findOne({ recipeName: item.subRecipeName }).lean());

      if (!subRecipe) {
        console.warn(
          `[CompleteBatch] Sub-recipe not found: "${item.subRecipeName}" — skipping fridge increment`
        );
        fridgeSkipped.push({ subRecipeName: item.subRecipeName, reason: "Sub-recipe not found in recipe database" });
        continue;
      }

      const qtyProduced = item.batchesToPrepare * Number(subRecipe.yield || 1);
      const yieldUom = item.uom || subRecipe.yieldUnit || "KG";

      // Upsert: $inc on existing Pending record, $setOnInsert bootstraps new record.
      // Note: status + location + brandName + itemName come from the filter on insert.
      // history[] is not set in $setOnInsert because $push handles the first entry.
      await BrandStock.findOneAndUpdate(
        {
          brandName: order.brandName,
          itemName: item.subRecipeName,
          location: "SEMI_FINISHED",
          status: "Pending",
          branchCode,
        },
        {
          $inc: { qtyRemaining: qtyProduced },
          $set: { uom: yieldUom },
          $push: {
            history: {
              type: "RECEIVED",
              qty: qtyProduced,
              uom: yieldUom,
              at: new Date(),
              referenceId: order._id,
              referenceKind: "BATCH",
              note: "Fresh sub-recipe batch production completed by kitchen chef",
            },
          },
          $setOnInsert: {
            ownedBy: order.brandName,
            inventoryManaged: true,
          },
        },
        { upsert: true }
      );

      fridgeUpdated.push({ subRecipeName: item.subRecipeName, qty: qtyProduced, uom: yieldUom });

      // Deduct the raw ingredients this sub-recipe's BOM actually consumed from
      // Branch Kitchen stock — anything not part of this BOM is left untouched.
      const rawLeaves = await extractIngredientsFromBOM(
        subRecipe.items,
        item.batchesToPrepare,
        order.brandName,
        new Set()
      );
      const aggregated = aggregateIngredients(rawLeaves);

      for (const ing of aggregated.values()) {
        const stockDoc = await BrandStock.findOne({
          brandName: order.brandName,
          itemName: new RegExp(`^${escapeRegex(ing.itemName)}$`, "i"),
          location: "BRANCH_KITCHEN",
          branchCode,
          status: "Pending",
        });

        if (!stockDoc || Number(stockDoc.qtyRemaining || 0) <= 0) {
          ingredientsSkipped.push({
            itemName: ing.itemName,
            reason: "No Branch Kitchen stock found for this ingredient",
          });
          continue;
        }

        const deductQty = Math.min(Number(ing.qty || 0), Number(stockDoc.qtyRemaining || 0));
        if (deductQty <= 0) continue;

        await BrandStock.updateOne(
          { _id: stockDoc._id },
          {
            $inc: { qtyRemaining: -deductQty },
            $push: {
              history: {
                type: "TRANSFER_OUT",
                qty: deductQty,
                uom: ing.uom || stockDoc.uom,
                at: new Date(),
                referenceId: order._id,
                referenceKind: "BATCH",
                note: `Consumed producing ${item.batchesToPrepare} batch(es) of ${item.subRecipeName}`,
              },
            },
          }
        );

        ingredientsDeducted.push({
          itemName: ing.itemName,
          qty: Number(deductQty.toFixed(4)),
          uom: ing.uom || stockDoc.uom,
        });

        if (deductQty < ing.qty) {
          ingredientsSkipped.push({
            itemName: ing.itemName,
            reason: `Only ${deductQty} of ${ing.qty} ${ing.uom} available — remaining shortfall not deducted`,
          });
        }
      }
    }

    // Advance both documents to COMPLETED
    order.status = "COMPLETED";
    await order.save();

    await Projection.findByIdAndUpdate(order.projectionId, { status: "COMPLETED" });

    console.log(
      `[CompleteBatchPreparation] ProductionOrder ${id} → COMPLETED ` +
      `(brand: "${order.brandName}", subRecipes: ${order.subRecipesToPrepare.length}, ` +
      `fridgeUpdated: ${fridgeUpdated.length}, fridgeSkipped: ${fridgeSkipped.length}, ` +
      `ingredientsDeducted: ${ingredientsDeducted.length}, ingredientsSkipped: ${ingredientsSkipped.length})`
    );

    return res.json({ success: true, data: order, fridgeUpdated, fridgeSkipped, ingredientsDeducted, ingredientsSkipped });
  } catch (err) {
    console.error("completeBatchPreparation error:", err?.message || err);
    return res.status(500).json({ message: "Failed to complete batch preparation" });
  }
};

/**
 * GET /api/production-orders/active
 * RECIPE_MANAGER only.
 * Returns all production orders in READY_FOR_DISPATCH or IN_PREPARATION so the chef
 * can see what cargo is incoming and what is actively being cooked.
 */
export const getActiveProductionOrders = async (req, res) => {
  try {
    const orders = await ProductionOrder.find({
      status: { $in: ["READY_FOR_DISPATCH", "IN_PREPARATION"] },
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error("getActiveProductionOrders error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch active production orders" });
  }
};

/**
 * GET /api/production-orders/my-active
 * RECIPE_MANAGER only.
 * Returns this chef's branch's production orders that are not yet COMPLETED —
 * i.e. everything currently moving through the kitchen pipeline, scoped to
 * req.user.branchCode so a chef only sees their own branch's queue.
 */
export const getMyActiveProductionOrders = async (req, res) => {
  try {
    const branchCode = req.user?.branchCode;
    if (!branchCode) {
      return res.status(400).json({ message: "No branch code on this account — contact admin" });
    }

    const orders = await ProductionOrder.find({
      branchCode,
      status: { $ne: "COMPLETED" },
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error("getMyActiveProductionOrders error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch active production orders" });
  }
};

/**
 * PATCH /api/production-orders/:id/mark-started
 * RECIPE_MANAGER only.
 * Chef acknowledges receipt of ingredients and starts cooking.
 * Transitions READY_FOR_DISPATCH → IN_PREPARATION.
 *
 * Also deducts warehouse stock best-effort — mirrors what the INGREDIENT_MANAGER /dispatch
 * endpoint does. Safe because the READY_FOR_DISPATCH status guard means only ONE of
 * /dispatch or /mark-started can ever fire for any given order (no double-deduction risk).
 */
export const markPreparationStarted = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await ProductionOrder.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Production order not found" });
    }
    if (order.status !== "READY_FOR_DISPATCH") {
      return res.status(409).json({
        message: `Cannot mark started: order status is "${order.status}"`,
        currentStatus: order.status,
      });
    }

    // Deduct warehouse stock for each ingredient (best-effort — does not block transition)
    for (const item of order.warehouseIngredientsToDispatch) {
      try {
        await BrandStock.findOneAndUpdate(
          {
            brandName: "SKOPE_WAREHOUSE",
            itemName: new RegExp(`^${escapeRegex(item.itemName)}$`, "i"),
            status: "Pending",
          },
          {
            $inc: { qtyRemaining: -item.requiredQty },
            $push: {
              history: {
                type: "TRANSFER_OUT",
                qty: item.requiredQty,
                uom: item.uom,
                at: new Date(),
                note: "Warehouse deduction recorded by chef on preparation start",
              },
            },
          }
        );
      } catch (stockErr) {
        console.warn(
          `[MarkPreparationStarted] Stock deduction skipped for "${item.itemName}": ${stockErr?.message}`
        );
      }
    }

    order.status = "IN_PREPARATION";
    await order.save();

    console.log(
      `[MarkPreparationStarted] ProductionOrder ${id} → IN_PREPARATION ` +
      `(brand: "${order.brandName}", items deducted: ${order.warehouseIngredientsToDispatch.length})`
    );

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("markPreparationStarted error:", err?.message || err);
    return res.status(500).json({ message: "Failed to mark preparation as started" });
  }
};

/**
 * GET /api/production-orders/my-pending
 * Client auth only.
 * Returns all production orders for this brand that are AWAITING_BRAND_PAYMENT.
 */
export const getMyPendingProductionOrders = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Access denied" });
    }

    const orders = await ProductionOrder.find({
      brandId: req.user._id,
      status: "AWAITING_BRAND_PAYMENT",
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error("getMyPendingProductionOrders error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch pending production orders" });
  }
};
