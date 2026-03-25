import IngredientIndent from "../models/ingredientIndent.js";
import BrandStock from "../models/brandStock.js";

export const createIndent = async (req, res) => {
  try {
    const {
      recipeId,
      recipeKind,
      recipeName,
      branchCode,
      items,
      clientBrandId,
      clientBrandName,
    } = req.body || {};

    if (!recipeId || !recipeKind || !branchCode || !Array.isArray(items)) {
      return res.status(400).json({ message: "recipeId, recipeKind, branchCode, items[] are required" });
    }
    const clientName = String(clientBrandName || "").trim();
    if (!clientName) {
      return res.status(400).json({ message: "clientBrandName is required" });
    }
    if (!["main", "sub", "trial", "training"].includes(recipeKind)) {
      return res.status(400).json({ message: "recipeKind must be main, sub, trial or training" });
    }

    const docs = items
      .map((r) => ({
        // request brand is the selected client brand
        requestBrandName: clientName,
        clientBrandId: clientBrandId || null,
        clientBrandName: clientName,
        recipeId,
        recipeKind,
        recipeName: String(recipeName || ""),
        branchCode: String(branchCode).trim(),
        skuCode: String(r.skuCode || ""),
        itemName: String(r.itemName || "").trim(),
        categoryName: String(r.categoryName || ""),
        uom: String(r.uom || ""),
        qty: Number(r.qty || 0),
        ingredientBrand: String(r.ingredientBrand || "").trim(),
        // cost captured later during verification
        cost: 0,
        status: "INDENT_PENDING",
        isSeenByIngredientAdmin: false,
        isSeenByRecipeAdminGrn: false,
      }))
      .filter((d) => d.itemName && d.ingredientBrand);

    if (docs.length === 0) {
      return res.status(400).json({ message: "Items must include itemName and ingredientBrand" });
    }

    const created = await IngredientIndent.insertMany(docs, { ordered: false });
    return res.status(201).json({ success: true, count: created.length, data: created });
  } catch (err) {
    console.error("Create indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to create indent" });
  }
};

export const listIndent = async (req, res) => {
  try {
    const { status } = req.query;
    const q = {};
    if (status) q.status = status;

    const list = await IngredientIndent.find(q).sort({ createdAt: -1 }).lean();

    // Mark seen based on viewer role/context
    if (req.user?.role === "INGREDIENT_MANAGER" && (!status || status !== "ISSUED")) {
      await IngredientIndent.updateMany(
        { status: { $in: ["INDENT_PENDING", "INDENT_VERIFIED"] }, isSeenByIngredientAdmin: false },
        { $set: { isSeenByIngredientAdmin: true } }
      );
    }
    if (req.user?.role === "RECIPE_MANAGER" && status === "ISSUED") {
      await IngredientIndent.updateMany(
        { status: "ISSUED", isSeenByRecipeAdminGrn: false },
        { $set: { isSeenByRecipeAdminGrn: true } }
      );
    }
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("List indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch indent list" });
  }
};

export const verifyIndentItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { cost } = req.body || {};
    const doc = await IngredientIndent.findById(id);
    if (!doc) return res.status(404).json({ message: "Indent item not found" });

    if (doc.status === "ISSUED") {
      return res.status(400).json({ message: "Already issued" });
    }

    const c = Number(cost);
    if (!Number.isFinite(c) || c < 0) {
      return res.status(400).json({ message: "Valid cost is required" });
    }

    doc.cost = c;
    doc.status = "INDENT_VERIFIED";
    doc.verifiedAt = new Date();
    await doc.save();

    return res.json({ success: true });
  } catch (err) {
    console.error("Verify indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to verify indent item" });
  }
};

export const issueIndentItem = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await IngredientIndent.findById(id);
    if (!doc) return res.status(404).json({ message: "Indent item not found" });

    if (doc.status !== "INDENT_VERIFIED") {
      return res.status(400).json({ message: "Item must be verified before issuing" });
    }

    doc.status = "ISSUED";
    doc.issuedAt = new Date();
    doc.isSeenByRecipeAdminGrn = false;
    await doc.save();

    // Update Recipe Admin stock ledger (by request brand)
    try {
      const brandName = String(doc.requestBrandName || "").trim();
      if (brandName) {
        await BrandStock.findOneAndUpdate(
          {
            brandName,
            itemName: doc.itemName,
            ingredientBrand: String(doc.ingredientBrand || "").trim(),
          },
          {
            $setOnInsert: { uom: doc.uom || "" },
            $inc: { qtyRemaining: Number(doc.qty || 0) },
            $push: {
              history: {
                type: "ISSUE",
                qty: Number(doc.qty || 0),
                uom: doc.uom || "",
                at: new Date(),
              },
            },
          },
          { upsert: true, new: true }
        );
      }
    } catch (e) {
      console.error("Brand stock update failed:", e?.message || e);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Issue indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to issue indent item" });
  }
};

export const deleteIndentItem = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await IngredientIndent.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Indent item not found" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to delete indent item" });
  }
};

