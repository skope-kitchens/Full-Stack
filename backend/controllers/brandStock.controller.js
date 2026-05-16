import mongoose from "mongoose";
import BrandStock from "../models/brandStock.js";

export const listBrandStock = async (req, res) => {
  try {
    const { brandName } = req.query || {};
    const q = {};
    if (brandName) q.brandName = String(brandName).trim();
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

  if (!from || !to || !item || !Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "fromBrandName, toBrandName, itemName, qty are required" });
  }
  if (from === to) {
    return res.status(400).json({ message: "fromBrandName and toBrandName must be different" });
  }

  // Pre-flight read outside session — produces a clear error before acquiring the session lock.
  const preCheck = await BrandStock.findOne(
    { brandName: from, itemName: item, ingredientBrand: ingBrand },
    { status: 1, qtyRemaining: 1 }
  ).lean();

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
        brandName: from,
        itemName: item,
        ingredientBrand: ingBrand,
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
    const toDoc = await BrandStock.findOneAndUpdate(
      { brandName: to, itemName: item, ingredientBrand: ingBrand },
      {
        $setOnInsert: {
          uom: unit || fromDoc.uom,
          status: "Pending",
          ownedBy: to,
          location: fromDoc.location || "BRANCH_KITCHEN",
          branchCode: fromDoc.branchCode || "JP_NAGAR",
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
    await session.abortTransaction();
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

    // Read current state before mutating — needed for previousQty in history entry
    // and for the state guard (only Pending items can be marked Used).
    const current = await BrandStock.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Stock item not found" });

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

    const updated = await BrandStock.findByIdAndUpdate(
      id,
      {
        $set: { status: "Used" },
        $push: {
          history: {
            type: "MARK_USED",
            qty: Number(current.qtyRemaining || 0),
            uom: current.uom || "",
            previousQty: Number(current.qtyRemaining || 0),
            newQty: Number(current.qtyRemaining || 0),
            at: new Date(),
            actorRole,
            note: "Item marked as Used",
          },
        },
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Stock item not found" });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Mark brand stock used error:", err?.message || err);
    return res.status(500).json({ message: "Failed to mark used" });
  }
};

export const reconcileStock = async (req, res) => {
  try {
    const { id } = req.params;
    const newQty = Number(req.body?.qtyRemaining);
    const note = String(req.body?.note || "").trim() || "Daily reconciliation";

    if (!Number.isFinite(newQty) || newQty < 0) {
      return res.status(400).json({ message: "qtyRemaining must be a non-negative number" });
    }

    const current = await BrandStock.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Stock item not found" });

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

