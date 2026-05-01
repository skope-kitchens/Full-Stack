import MappedIngredient from "../models/mappedIngredient.js";

export const upsertMappedIngredients = async (req, res) => {
  try {
    const { recipeId, recipeKind, branchCode, items } = req.body || {};

    if (!recipeId || !recipeKind || !branchCode) {
      return res.status(400).json({ message: "recipeId, recipeKind, branchCode are required" });
    }
    if (!["main", "sub", "trial", "training"].includes(recipeKind)) {
      return res.status(400).json({ message: "recipeKind must be main, sub, trial or training" });
    }

    const safeItems = Array.isArray(items)
      ? items.map((r) => ({
          skuCode: String(r.skuCode || ""),
          itemName: String(r.itemName || "").trim(),
          categoryName: String(r.categoryName || ""),
          uom: String(r.uom || ""),
          qty: Number(r.qty || 0),
          cost: 0,
        })).filter((r) => r.itemName)
      : [];

    const doc = await MappedIngredient.findOneAndUpdate(
      { recipeId, recipeKind, branchCode: String(branchCode).trim() },
      { $set: { items: safeItems } },
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("Mapped ingredients upsert error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save mapped ingredients" });
  }
};

export const getMappedIngredients = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const { recipeKind, branchCode } = req.query;

    if (!recipeId) {
      return res.status(400).json({ message: "recipeId is required" });
    }

    const q = { recipeId };
    if (recipeKind) q.recipeKind = recipeKind;
    if (branchCode) q.branchCode = branchCode;

    const docs = await MappedIngredient.find(q).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: docs });
  } catch (err) {
    console.error("Mapped ingredients get error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch mapped ingredients" });
  }
};

