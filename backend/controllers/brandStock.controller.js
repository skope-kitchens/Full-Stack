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

    const fromDoc = await BrandStock.findOne({ brandName: from, itemName: item, ingredientBrand: ingBrand });
    if (!fromDoc || Number(fromDoc.qtyRemaining || 0) < quantity) {
      return res.status(400).json({ message: "Insufficient stock to transfer" });
    }
    if (String(fromDoc.status || "Pending") !== "Pending") {
      return res.status(400).json({ message: "This ingredient is marked Used and cannot be transferred" });
    }

    fromDoc.qtyRemaining = Number(fromDoc.qtyRemaining || 0) - quantity;
    fromDoc.history.push({
      type: "TRANSFER_OUT",
      qty: quantity,
      uom: unit || fromDoc.uom,
      at: new Date(),
      fromBrandName: from,
      toBrandName: to,
    });
    await fromDoc.save();

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
    const deleted = await BrandStock.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Stock item not found" });
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

