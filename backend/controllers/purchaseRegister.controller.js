import PurchaseRegister from "../models/purchaseRegister.js";
import { escapeRegex } from "../utils/bomExpander.js";
import { convertQty } from "../utils/uomConvert.js";

const EXPIRY_WARNING_DAYS = 5;

/**
 * POST /api/purchase-register
 * Ingredient Admin records a new purchase batch bought from a vendor.
 */
export const createPurchaseEntry = async (req, res) => {
  try {
    const {
      brandName,
      itemName,
      ingredientBrand,
      uom,
      qty,
      pricePerUnit,
      expiryDate,
      vendorName,
      purchaseDate,
    } = req.body || {};

    const cleanBrandName = String(brandName || "").trim();
    const cleanItemName = String(itemName || "").trim();
    const cleanIngredientBrand = String(ingredientBrand || "").trim();
    const cleanUom = String(uom || "").trim();
    const qtyNum = Number(qty);
    const priceNum = Number(pricePerUnit);

    if (!cleanBrandName) return res.status(400).json({ message: "brandName is required" });
    if (!cleanItemName) return res.status(400).json({ message: "itemName is required" });
    if (!cleanIngredientBrand) return res.status(400).json({ message: "ingredientBrand is required" });
    if (!cleanUom) return res.status(400).json({ message: "uom is required" });
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ message: "qty must be greater than 0" });
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return res.status(400).json({ message: "pricePerUnit must be a valid non-negative number" });
    }
    if (!expiryDate) return res.status(400).json({ message: "expiryDate is required" });

    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) {
      return res.status(400).json({ message: "expiryDate is invalid" });
    }

    const entry = await PurchaseRegister.create({
      brandName: cleanBrandName,
      itemName: cleanItemName,
      ingredientBrand: cleanIngredientBrand,
      uom: cleanUom,
      qtyPurchased: qtyNum,
      qtyRemaining: qtyNum,
      pricePerUnit: priceNum,
      expiryDate: expiry,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      vendorName: String(vendorName || "").trim(),
      status: "ACTIVE",
      history: [
        {
          type: "PURCHASE_IN",
          qty: qtyNum,
          uom: cleanUom,
          at: new Date(),
          referenceKind: "MANUAL",
          newQty: qtyNum,
          note: "Initial purchase entry",
        },
      ],
    });

    return res.status(201).json({ success: true, data: entry });
  } catch (err) {
    console.error("createPurchaseEntry error:", err?.message || err);
    return res.status(500).json({ message: "Failed to create purchase entry" });
  }
};

/**
 * GET /api/purchase-register/:brandName
 * Stock view for a brand — FEFO ordered (oldest expiry first), with an
 * `expiringSoon` flag for batches expiring within EXPIRY_WARNING_DAYS days.
 */
export const listPurchaseRegisterByBrand = async (req, res) => {
  try {
    const { brandName } = req.params;
    const cleanBrandName = String(brandName || "").trim();
    if (!cleanBrandName) return res.status(400).json({ message: "brandName is required" });

    const list = await PurchaseRegister.find({
      brandName: new RegExp(`^${escapeRegex(cleanBrandName)}$`, "i"),
      status: { $in: ["ACTIVE", "DEPLETED", "EXPIRED"] },
    })
      .sort({ expiryDate: 1 })
      .lean();

    const now = Date.now();
    const warningWindowMs = EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;

    const data = list.map((doc) => ({
      ...doc,
      expiringSoon:
        doc.status !== "CANCELLED" &&
        new Date(doc.expiryDate).getTime() - now <= warningWindowMs,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("listPurchaseRegisterByBrand error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch purchase register" });
  }
};

/**
 * PATCH /api/purchase-register/:id/correct
 * Audit-safe correction — adjusts qtyRemaining and logs the change.
 * Does not allow editing price/expiry/qtyPurchased; only qtyRemaining.
 */
export const correctPurchaseEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { newQtyRemaining, reason } = req.body || {};

    const newQty = Number(newQtyRemaining);
    if (!Number.isFinite(newQty) || newQty < 0) {
      return res.status(400).json({ message: "newQtyRemaining must be a non-negative number" });
    }

    const doc = await PurchaseRegister.findById(id);
    if (!doc) return res.status(404).json({ message: "Purchase entry not found" });

    if (doc.status === "CANCELLED") {
      return res.status(409).json({ message: "Cannot correct a cancelled entry" });
    }

    if (newQty > doc.qtyPurchased) {
      return res.status(400).json({
        message: `newQtyRemaining cannot exceed the originally purchased quantity (${doc.qtyPurchased})`,
      });
    }

    const previousQty = doc.qtyRemaining;
    doc.qtyRemaining = newQty;
    doc.status = newQty === 0 ? "DEPLETED" : "ACTIVE";
    doc.history.push({
      type: "CORRECTION",
      qty: newQty - previousQty,
      uom: doc.uom,
      at: new Date(),
      referenceKind: "CORRECTION",
      previousQty,
      newQty,
      note: String(reason || "").trim(),
    });

    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("correctPurchaseEntry error:", err?.message || err);
    return res.status(500).json({ message: "Failed to correct purchase entry" });
  }
};

/**
 * PATCH /api/purchase-register/:id/cancel
 * Only allowed if nothing has been deducted from this batch yet.
 */
export const cancelPurchaseEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const doc = await PurchaseRegister.findById(id);
    if (!doc) return res.status(404).json({ message: "Purchase entry not found" });

    if (doc.status === "CANCELLED") {
      return res.status(409).json({ message: "Entry is already cancelled" });
    }

    if (doc.qtyRemaining !== doc.qtyPurchased) {
      return res.status(409).json({
        message: "Cannot cancel — stock from this batch has already been used. Use a correction instead.",
      });
    }

    const previousQty = doc.qtyRemaining;
    doc.qtyRemaining = 0;
    doc.status = "CANCELLED";
    doc.history.push({
      type: "CANCELLED",
      qty: -previousQty,
      uom: doc.uom,
      at: new Date(),
      referenceKind: "MANUAL",
      previousQty,
      newQty: 0,
      note: String(reason || "").trim(),
    });

    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("cancelPurchaseEntry error:", err?.message || err);
    return res.status(500).json({ message: "Failed to cancel purchase entry" });
  }
};

/**
 * Internal helper — called from ingredientIndent.controller.js after an
 * indent item is issued to a kitchen. Deducts the issued qty from the
 * brand's purchase register batches using FEFO (oldest expiry first),
 * converting units where necessary.
 *
 * Never throws — deduction failures must not block the indent issue flow.
 * If recorded purchase stock is insufficient, deducts what's available and
 * logs a console warning describing the shortfall.
 */
export const deductFromPurchaseRegister = async ({
  brandName,
  itemName,
  ingredientBrand,
  qty,
  uom,
  branchCode,
  referenceId,
}) => {
  try {
    const cleanBrandName = String(brandName || "").trim();
    const cleanItemName = String(itemName || "").trim();
    const cleanIngredientBrand = String(ingredientBrand || "").trim();
    let remainingToDeduct = Number(qty || 0);

    if (!cleanBrandName || !cleanItemName || remainingToDeduct <= 0) return;

    const batches = await PurchaseRegister.find({
      brandName: new RegExp(`^${escapeRegex(cleanBrandName)}$`, "i"),
      itemName: new RegExp(`^${escapeRegex(cleanItemName)}$`, "i"),
      ingredientBrand: new RegExp(`^${escapeRegex(cleanIngredientBrand)}$`, "i"),
      status: "ACTIVE",
      qtyRemaining: { $gt: 0 },
    }).sort({ expiryDate: 1 });

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;

      // Convert the deduction qty (in indent's uom) into this batch's uom.
      let neededInBatchUom = convertQty(remainingToDeduct, uom, batch.uom);
      if (neededInBatchUom == null) {
        // Units incompatible/unknown — assume same units rather than skip.
        neededInBatchUom = remainingToDeduct;
      }

      const deductFromBatch = Math.min(batch.qtyRemaining, neededInBatchUom);
      if (deductFromBatch <= 0) continue;

      batch.qtyRemaining -= deductFromBatch;
      if (batch.qtyRemaining <= 0) {
        batch.qtyRemaining = 0;
        batch.status = "DEPLETED";
      }

      batch.history.push({
        type: "DEDUCTION",
        qty: deductFromBatch,
        uom: batch.uom,
        at: new Date(),
        branchCode: String(branchCode || "").trim().toUpperCase(),
        referenceId: referenceId || null,
        referenceKind: "INDENT",
        note: "",
      });

      await batch.save();

      // Convert the deducted amount back to the indent's uom to track remaining demand.
      let deductedInRequestUom = convertQty(deductFromBatch, batch.uom, uom);
      if (deductedInRequestUom == null) deductedInRequestUom = deductFromBatch;

      remainingToDeduct -= deductedInRequestUom;
    }

    if (remainingToDeduct > 0.0001) {
      console.warn(
        `[PurchaseRegister] Shortfall: ${cleanBrandName} / ${cleanItemName} (${cleanIngredientBrand}) ` +
        `had insufficient recorded stock — short by ${remainingToDeduct.toFixed(4)} ${uom || ""}.`
      );
    }
  } catch (err) {
    console.error("deductFromPurchaseRegister error:", err?.message || err);
  }
};