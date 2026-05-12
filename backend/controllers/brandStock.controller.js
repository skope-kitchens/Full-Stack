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

    // Atomic check-and-decrement: filter enforces status + sufficient qty in one operation.
    // Prevents double-spend: two concurrent requests both pass the filter only if qtyRemaining
    // can cover both — MongoDB applies the filter and $inc atomically at the document level.
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
      { new: true }
    );

    if (!fromDoc) {
      // Diagnostic read to preserve original specific error messages.
      const existing = await BrandStock.findOne(
        { brandName: from, itemName: item, ingredientBrand: ingBrand },
        { status: 1, qtyRemaining: 1 }
      ).lean();
      if (existing && String(existing.status || "Pending") !== "Pending") {
        return res.status(400).json({ message: "This ingredient is marked Used and cannot be transferred" });
      }
      return res.status(400).json({ message: "Insufficient stock to transfer" });
    }

    const toDoc = await BrandStock.findOneAndUpdate(
      { brandName: to, itemName: item, ingredientBrand: ingBrand },
      {
        $setOnInsert: { uom: unit || fromDoc.uom, status: "Pending" },
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
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, data: { from: fromDoc, to: toDoc } });
  } catch (err) {
    console.error("Transfer brand stock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to transfer stock" });
  }
};

export const deleteBrandStockItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await BrandStock.findByIdAndUpdate(
      id,
      { $set: { status: "Archived" } },
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
    const updated = await BrandStock.findByIdAndUpdate(
      id,
      { $set: { status: "Used" } },
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

