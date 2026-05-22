import ProductionOrder from "../models/productionOrder.js";
import User from "../models/user.js";
import BrandStock from "../models/brandStock.js";
import SubRecipe from "../models/subrecipe.models.js";
import Projection from "../models/projection.js";
import { escapeRegex } from "../utils/bomExpander.js";

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
    if (order.status !== "IN_PREPARATION") {
      return res.status(400).json({
        message: `Cannot complete: order status is "${order.status}"`,
        currentStatus: order.status,
      });
    }

    // Upsert kitchen fridge stock for each prepared sub-recipe
    for (const item of order.subRecipesToPrepare) {
      if (!item.batchesToPrepare || item.batchesToPrepare <= 0) continue;

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
        },
        {
          $inc: { qtyRemaining: qtyProduced },
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
            branchCode: "JP_NAGAR",
            inventoryManaged: true,
          },
        },
        { upsert: true }
      );
    }

    // Advance both documents to COMPLETED
    order.status = "COMPLETED";
    await order.save();

    await Projection.findByIdAndUpdate(order.projectionId, { status: "COMPLETED" });

    console.log(
      `[CompleteBatchPreparation] ProductionOrder ${id} → COMPLETED ` +
      `(brand: "${order.brandName}", subRecipes: ${order.subRecipesToPrepare.length})`
    );

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("completeBatchPreparation error:", err?.message || err);
    return res.status(500).json({ message: "Failed to complete batch preparation" });
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
