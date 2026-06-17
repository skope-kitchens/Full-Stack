import mongoose from "mongoose";
import BrandStock from "../models/brandStock.js";

export const listBrandStock = async (req, res) => {
  try {
    const { brandName } = req.query || {};
    const q = {};
    if (brandName) q.brandName = String(brandName).trim();

    // RECIPE_MANAGER's Inventory screen is for branch-wise kitchen raw ingredients only —
    // exclude the fridge (SEMI_FINISHED), which now has its own dedicated Fridge Audit page.
    if (req.user?.role === "RECIPE_MANAGER") {
      q.location = "BRANCH_KITCHEN";
      if (req.user?.branchCode) q.branchCode = req.user.branchCode;
      q.status = { $ne: "Archived" };
    }

    const list = await BrandStock.find(q).sort({ itemName: 1 }).lean();
    const normalized = (list || []).map((d) => ({
      ...d,
      status: d.status || "Pending",
    }));
    return res.json({ success: true, data: normalized });
  } catch (err) {
    console.error("List brand stock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to list brand stock" });
  }
};

export const listAllBrandStock = async (req, res) => {
  try {
    const list = await BrandStock.find({})
      .sort({ brandName: 1, itemName: 1, ingredientBrand: 1 })
      .lean();

    const normalized = (list || []).map((d) => ({
      ...d,
      status: d.status || "Pending",
    }));

    return res.json({ success: true, data: normalized });
  } catch (err) {
    console.error("List all brand stock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to list brand stock" });
  }
};

export const transferBrandStock = async (req, res) => {
  try {
  const { fromBrandName, toBrandName, itemName, ingredientBrand, qty, uom } = req.body || {};
  const from = String(fromBrandName || "").trim();
  const to = String(toBrandName || "").trim();
  const item = String(itemName || "").trim();
  const ingBrand = String(ingredientBrand || "").trim();
  const quantity = Number(qty);
  const unit = String(uom || "").trim();

  if (!from || !to || !item) {
    return res.status(400).json({ message: "fromBrandName, toBrandName, itemName, qty are required" });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "Quantity must be greater than 0" });
  }
  if (from === to) {
    return res.status(400).json({ message: "fromBrandName and toBrandName must be different" });
  }

  // ingredientBrand is optional — when omitted, match any value for that field.
  // A query for ingredientBrand:"" does NOT match documents where the field is absent,
  // so the filter is only applied when an explicit value was provided by the caller.
  const stockFilter = { brandName: from, itemName: item };
  if (ingBrand) stockFilter.ingredientBrand = ingBrand;

  // Pre-flight read outside session — produces a clear error before acquiring the session lock.
  const preCheck = await BrandStock.findOne(stockFilter, { status: 1, qtyRemaining: 1 }).lean();

  if (!preCheck) {
    return res.status(400).json({ message: "Insufficient stock to transfer" });
  }
  if (String(preCheck.status || "Pending") !== "Pending") {
    return res.status(400).json({ message: "This ingredient is marked Used and cannot be transferred" });
  }
  if (Number(preCheck.qtyRemaining || 0) < quantity) {
    return res.status(400).json({ message: "Insufficient stock to transfer" });
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Atomic check-and-decrement inside the transaction.
    // The balance filter re-checks qty within the session to guard against concurrent transfers.
    const fromDoc = await BrandStock.findOneAndUpdate(
      {
        ...stockFilter,
        status: "Pending",
        qtyRemaining: { $gte: quantity },
      },
      {
        $inc: { qtyRemaining: -quantity },
        $push: {
          history: {
            type: "TRANSFER_OUT",
            qty: quantity,
            uom: unit,
            at: new Date(),
            fromBrandName: from,
            toBrandName: to,
          },
        },
      },
      { new: true, session }
    );

    if (!fromDoc) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Insufficient stock to transfer" });
    }

    // Destination credit — atomic with source debit inside the same transaction.
    // If this throws, the transaction aborts and the source debit is rolled back.
    const destFilter = {
      brandName: to,
      itemName: item,
      location: fromDoc.location || "BRANCH_KITCHEN",
      branchCode: String(fromDoc.branchCode || "JPNAGAR").trim().toUpperCase(),
    };
    if (ingBrand) destFilter.ingredientBrand = ingBrand;

    const toDoc = await BrandStock.findOneAndUpdate(
      destFilter,
      {
        $setOnInsert: {
          uom: unit || fromDoc.uom,
          status: "Pending",
          ownedBy: to,
        },
        $inc: { qtyRemaining: quantity },
        $push: {
          history: {
            type: "TRANSFER_IN",
            qty: quantity,
            uom: unit || fromDoc.uom,
            at: new Date(),
            fromBrandName: from,
            toBrandName: to,
          },
        },
      },
      { upsert: true, new: true, session }
    ).lean();

    await session.commitTransaction();
    return res.json({ success: true, data: { from: fromDoc, to: toDoc } });
  } catch (err) {
    try { await session.abortTransaction(); } catch (_) { /* session already closed or expired */ }
    console.error("Transfer brand stock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to transfer stock" });
  } finally {
    session.endSession();
  }
  } catch (err) {
    // Outer catch — covers pre-flight read and startSession() failures (MongoDB unavailable etc.)
    console.error("Transfer brand stock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to transfer stock" });
  }
};

export const deleteBrandStockItem = async (req, res) => {
  try {
    const { id } = req.params;
    const actorRole = req.user?.role || "";

    const current = await BrandStock.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Stock item not found" });

    const updated = await BrandStock.findByIdAndUpdate(
      id,
      {
        $set: { status: "Archived" },
        $push: {
          history: {
            type: "MARK_ARCHIVED",
            qty: Number(current.qtyRemaining || 0),
            uom: current.uom || "",
            previousQty: Number(current.qtyRemaining || 0),
            at: new Date(),
            actorRole,
            note: "Item archived",
          },
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Stock item not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete brand stock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to delete stock item" });
  }
};

export const markBrandStockUsed = async (req, res) => {
  try {
    const { id } = req.params;
    const actorRole = req.user?.role || "";
    const isRecipeManager = actorRole === "RECIPE_MANAGER";

    // Read current state before mutating — needed for previousQty in history entry
    // and for the state guard (only Pending items can be marked Used).
    const current = await BrandStock.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Stock item not found" });

    // RECIPE_MANAGER may only act on their own branch's kitchen raw stock.
    if (isRecipeManager) {
      if (current.location !== "BRANCH_KITCHEN" || current.branchCode !== req.user?.branchCode) {
        return res.status(403).json({ message: "You can only manage your branch's kitchen stock" });
      }
    }

    if (current.status !== "Pending") {
      return res.status(409).json({
        message: `Cannot mark as Used: item is currently "${current.status}". Only Pending items can be marked Used.`,
      });
    }

    if (Number(current.qtyRemaining || 0) > 0) {
      // Warn but do not block — ops may intentionally mark an item Used with remaining stock
      // (e.g., expired, recalled). The history entry documents the remaining quantity.
      console.warn(`[BrandStock] markBrandStockUsed: item ${id} has qtyRemaining=${current.qtyRemaining}. Marking Used with non-zero quantity.`);
    }

    const previousQty = Number(current.qtyRemaining || 0);

    // RECIPE_MANAGER's "Mark Used" means the kitchen consumed the rest of this item —
    // zero it out and record the consumption as a TRANSFER_OUT. INGREDIENT_MANAGER's
    // existing MARK_USED behavior (qty untouched) is preserved for all other locations.
    const update = isRecipeManager
      ? {
          $set: { status: "Used", qtyRemaining: 0 },
          $push: {
            history: {
              type: "TRANSFER_OUT",
              qty: previousQty,
              uom: current.uom || "",
              previousQty,
              newQty: 0,
              at: new Date(),
              actorRole,
              note: "Marked as used by chef",
            },
          },
        }
      : {
          $set: { status: "Used" },
          $push: {
            history: {
              type: "MARK_USED",
              qty: previousQty,
              uom: current.uom || "",
              previousQty,
              newQty: previousQty,
              at: new Date(),
              actorRole,
              note: "Item marked as Used",
            },
          },
        };

    const updated = await BrandStock.findByIdAndUpdate(id, update, { new: true }).lean();

    if (!updated) return res.status(404).json({ message: "Stock item not found" });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Mark brand stock used error:", err?.message || err);
    return res.status(500).json({ message: "Failed to mark used" });
  }
};

export const archiveBrandStockItem = async (req, res) => {
  try {
    const { id } = req.params;
    const actorRole = req.user?.role || "";
    const isRecipeManager = actorRole === "RECIPE_MANAGER";

    const current = await BrandStock.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Stock item not found" });

    if (isRecipeManager) {
      if (current.location !== "BRANCH_KITCHEN" || current.branchCode !== req.user?.branchCode) {
        return res.status(403).json({ message: "You can only manage your branch's kitchen stock" });
      }
      if (Number(current.qtyRemaining || 0) !== 0) {
        return res.status(400).json({ message: "Cannot archive item with remaining stock. Reconcile to 0 first." });
      }
    }

    const updated = await BrandStock.findByIdAndUpdate(
      id,
      {
        $set: { status: "Archived" },
        $push: {
          history: {
            type: "MARK_ARCHIVED",
            qty: Number(current.qtyRemaining || 0),
            uom: current.uom || "",
            previousQty: Number(current.qtyRemaining || 0),
            at: new Date(),
            actorRole,
            note: "Item archived",
          },
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Stock item not found" });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Archive brand stock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to archive stock item" });
  }
};

export const reconcileStock = async (req, res) => {
  try {
    const { id } = req.params;
    const newQty = Number(req.body?.qtyRemaining);
    const note = String(req.body?.note || "").trim() || "Daily reconciliation";
    const actorRole = req.user?.role || "";

    if (!Number.isFinite(newQty) || newQty < 0) {
      return res.status(400).json({ message: "qtyRemaining must be a non-negative number" });
    }

    const current = await BrandStock.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Stock item not found" });

    // RECIPE_MANAGER may only reconcile their own branch's kitchen raw stock.
    if (actorRole === "RECIPE_MANAGER") {
      if (current.location !== "BRANCH_KITCHEN" || current.branchCode !== req.user?.branchCode) {
        return res.status(403).json({ message: "You can only manage your branch's kitchen stock" });
      }
    }

    const previousQty = Number(current.qtyRemaining || 0);

    if (previousQty === newQty) {
      return res.json({ success: true, unchanged: true, data: current });
    }

    const updated = await BrandStock.findByIdAndUpdate(
      id,
      {
        $set: { qtyRemaining: newQty },
        $push: {
          history: {
            type: "RECONCILIATION",
            previousQty,
            newQty,
            uom: current.uom || "",
            note,
            at: new Date(),
            actorRole,
          },
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Stock item not found" });
    return res.json({ success: true, data: updated });

  } catch (err) {
    console.error("reconcileStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to reconcile stock" });
  }
};

