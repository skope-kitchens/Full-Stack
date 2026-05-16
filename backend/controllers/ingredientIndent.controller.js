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

    // Atomic claim: only one concurrent request can transition INDENT_VERIFIED → INDENT_ISSUING.
    // If two requests arrive simultaneously, only one wins this findOneAndUpdate; the other
    // sees null and returns the appropriate error — preventing double brand_stocks credit.
    const doc = await IngredientIndent.findOneAndUpdate(
      { _id: id, status: "INDENT_VERIFIED" },
      { $set: { status: "INDENT_ISSUING" } },
      { new: true }
    );

    if (!doc) {
      // Distinguish between "not found" and "wrong status" for accurate error messaging.
      const existing = await IngredientIndent.findById(id).select("status").lean();
      if (!existing) return res.status(404).json({ message: "Indent item not found" });
      if (existing.status === "ISSUED") return res.status(400).json({ message: "Already issued" });
      if (existing.status === "INDENT_ISSUING") return res.status(400).json({ message: "Issue already in progress — retry in a moment" });
      return res.status(400).json({ message: "Item must be verified before issuing" });
    }

    try {
      // Credit brand_stocks. If this throws, the catch below resets status to INDENT_VERIFIED
      // so the indent remains retryable. The INDENT_ISSUING claim is released on failure.
      const brandName = String(doc.requestBrandName || "").trim();
      if (brandName) {
        await BrandStock.findOneAndUpdate(
          {
            brandName,
            itemName: doc.itemName,
            ingredientBrand: String(doc.ingredientBrand || "").trim(),
          },
          {
            $setOnInsert: { uom: doc.uom || "", ownedBy: brandName, location: "BRANCH_KITCHEN", branchCode: "JP_NAGAR" },
            $inc: { qtyRemaining: Number(doc.qty || 0) },
            $push: {
              history: {
                type: "ISSUE",
                qty: Number(doc.qty || 0),
                uom: doc.uom || "",
                at: new Date(),
                referenceId: doc._id,
                referenceKind: "INDENT",
                actorRole: "INGREDIENT_MANAGER",
              },
            },
          },
          { upsert: true, new: true }
        );
      }

      // Credit succeeded — now persist ISSUED status.
      await IngredientIndent.findByIdAndUpdate(id, {
        $set: {
          status: "ISSUED",
          issuedAt: new Date(),
          isSeenByRecipeAdminGrn: false,
        },
      });

      return res.json({ success: true });
    } catch (creditErr) {
      // Credit failed — release the INDENT_ISSUING lock so the indent can be retried.
      console.error("Issue indent credit error (resetting to INDENT_VERIFIED):", creditErr?.message || creditErr);
      await IngredientIndent.findByIdAndUpdate(id, { $set: { status: "INDENT_VERIFIED" } });
      return res.status(500).json({ message: "Failed to issue indent item — please retry" });
    }
  } catch (err) {
    console.error("Issue indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to issue indent item" });
  }
};

export const deleteIndentItem = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await IngredientIndent.findById(id);
    if (!doc) {
      return res.status(404).json({ message: "Indent item not found" });
    }
    if (doc.status === "ISSUED") {
      return res.status(409).json({
        message: "Cannot delete an ISSUED indent. It has already credited brand stock. Raise a reversal instead.",
      });
    }
    await doc.deleteOne();
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to delete indent item" });
  }
};

