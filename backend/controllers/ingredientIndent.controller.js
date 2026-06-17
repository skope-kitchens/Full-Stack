import mongoose from "mongoose";
import IngredientIndent from "../models/ingredientIndent.js";
import BrandStock from "../models/brandStock.js";
import ProductionOrder from "../models/productionOrder.js";
import { deductFromPurchaseRegister, getWarehouseStockAvailable } from "./purchaseRegister.controller.js";

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

    if (!recipeKind || !branchCode || !Array.isArray(items)) {
      return res.status(400).json({ message: "recipeKind, branchCode, items[] are required" });
    }
    const clientName = String(clientBrandName || "").trim();
    if (!clientName) {
      return res.status(400).json({ message: "clientBrandName is required" });
    }
    if (!["main", "sub", "trial", "training", "manual"].includes(recipeKind)) {
      return res.status(400).json({ message: "recipeKind must be main, sub, trial, training or manual" });
    }
    if (recipeKind !== "manual" && !recipeId) {
      return res.status(400).json({ message: "recipeId is required" });
    }

    const docs = items
      .map((r) => ({
        // request brand is the selected client brand
        requestBrandName: clientName,
        clientBrandId: clientBrandId || null,
        clientBrandName: clientName,
        recipeId: recipeKind === "manual" ? null : recipeId,
        recipeKind,
        recipeName: recipeKind === "manual" ? "Manual Indent" : String(recipeName || ""),
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

    // Scope the Ingredient Admin's queue to the kitchen branches their warehouse supplies.
    if (req.user?.role === "INGREDIENT_MANAGER" && req.user.branchCodes?.length) {
      q.branchCode = { $in: req.user.branchCodes };
    }

    const list = await IngredientIndent.find(q).sort({ createdAt: -1 }).lean();

    // For not-yet-issued PROCUREMENT indents, attach how much of this item the
    // brand already has sitting in Warehouse Stock (Purchase Register) — purely
    // informational, lets the Ingredient Admin avoid re-procuring stock that's
    // already paid for and on hand.
    await Promise.all(
      list.map(async (doc) => {
        if (doc.status === "ISSUED") return;
        if (doc.indentType && doc.indentType !== "PROCUREMENT") return;
        doc.warehouseStockAvailable = await getWarehouseStockAvailable({
          brandName: doc.requestBrandName,
          itemName: doc.itemName,
          ingredientBrand: doc.ingredientBrand,
          uom: doc.uom,
        });
      })
    );

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
    if (doc.status === "INDENT_ISSUING") {
      return res.status(409).json({ message: "Issue already in progress for this item — wait for it to finish or reset it first." });
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
    const fulfillFromWarehouse = req.body?.fulfillFromWarehouse === true;

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

    // Stock gate: a normal (PROCUREMENT) indent can only be issued if the brand's
    // Warehouse Stock (Purchase Register) actually has enough of this item. This
    // stops the Ingredient Admin from crediting Branch Kitchen / GRN with stock
    // that doesn't physically exist. WAREHOUSE_TRANSFER / INVENTORY_TRANSFER
    // indents are exempt — they move stock that's already accounted for.
    if (!doc.indentType || doc.indentType === "PROCUREMENT") {
      const available = await getWarehouseStockAvailable({
        brandName: doc.requestBrandName,
        itemName: doc.itemName,
        ingredientBrand: doc.ingredientBrand,
        uom: doc.uom,
      });
      if (available < Number(doc.qty || 0)) {
        await IngredientIndent.findByIdAndUpdate(id, { $set: { status: "INDENT_VERIFIED" } });
        return res.status(409).json({
          message: `Out of stock — only ${available} ${doc.uom || ""} of "${doc.itemName}" available in Warehouse Stock (Purchase Register). Add stock there before issuing.`,
        });
      }
    }

    try {
      const brandName = String(doc.requestBrandName || "").trim();
      const qty = Number(doc.qty || 0);
      const branchCode = String(doc.branchCode || "JPNAGAR").trim().toUpperCase();
      const ingBrand = String(doc.ingredientBrand || "").trim();

      if (doc.indentType === "WAREHOUSE_TRANSFER") {
        // Stock already exists in the warehouse — relocate it to Branch Kitchen
        // atomically (debit warehouse, credit branch kitchen). No new stock enters
        // the system, so the Purchase Register is untouched.
        const sourceBranchCode = String(doc.sourceBranchCode || "").trim().toUpperCase();
        if (!brandName || !sourceBranchCode || qty <= 0) {
          throw new Error("Invalid warehouse transfer indent — missing brand, source branch, or quantity");
        }

        // Mirrors applyStockCascade's lookup — central warehouse stock is currently
        // stored as BRANCH_KITCHEN at the warehouse's own branchCode (no UI writes
        // the WAREHOUSE_DRY/CHILLER/FREEZER locations yet).
        const warehouseFilter = {
          brandName,
          itemName: doc.itemName,
          location: { $in: ["WAREHOUSE_DRY", "WAREHOUSE_CHILLER", "WAREHOUSE_FREEZER", "BRANCH_KITCHEN"] },
          branchCode: sourceBranchCode,
          status: "Pending",
          qtyRemaining: { $gte: qty },
        };
        if (ingBrand) warehouseFilter.ingredientBrand = ingBrand;

        const session = await mongoose.startSession();
        try {
          session.startTransaction();

          const sourceDoc = await BrandStock.findOneAndUpdate(
            warehouseFilter,
            {
              $inc: { qtyRemaining: -qty },
              $push: {
                history: {
                  type: "TRANSFER_OUT",
                  qty,
                  uom: doc.uom || "",
                  at: new Date(),
                  referenceId: doc._id,
                  referenceKind: "INDENT",
                  toBrandName: brandName,
                  actorRole: "INGREDIENT_MANAGER",
                  note: `Warehouse transfer to ${branchCode} Branch Kitchen`,
                },
              },
            },
            { new: true, session }
          );

          if (!sourceDoc) {
            throw new Error("Insufficient warehouse stock for this transfer — verify quantity or refresh");
          }

          const destFilter = {
            brandName,
            itemName: doc.itemName,
            location: "BRANCH_KITCHEN",
            branchCode,
          };
          if (ingBrand) destFilter.ingredientBrand = ingBrand;

          await BrandStock.findOneAndUpdate(
            destFilter,
            {
              $setOnInsert: { uom: doc.uom || sourceDoc.uom || "", ownedBy: brandName },
              $inc: { qtyRemaining: qty },
              $push: {
                history: {
                  type: "TRANSFER_IN",
                  qty,
                  uom: doc.uom || sourceDoc.uom || "",
                  at: new Date(),
                  referenceId: doc._id,
                  referenceKind: "INDENT",
                  fromBrandName: brandName,
                  actorRole: "INGREDIENT_MANAGER",
                  note: `Warehouse transfer from ${sourceBranchCode}`,
                },
              },
            },
            { upsert: true, new: true, session }
          );

          await session.commitTransaction();
        } catch (transferErr) {
          try { await session.abortTransaction(); } catch (_) { /* session already closed or expired */ }
          throw transferErr;
        } finally {
          session.endSession();
        }
      } else if (brandName) {
        // PROCUREMENT — new vendor stock entering Branch Kitchen.
        await BrandStock.findOneAndUpdate(
          {
            brandName,
            itemName: doc.itemName,
            ingredientBrand: ingBrand,
            location: "BRANCH_KITCHEN",
            branchCode,
          },
          {
            $setOnInsert: { uom: doc.uom || "", ownedBy: brandName },
            $inc: { qtyRemaining: qty },
            $push: {
              history: {
                type: "ISSUE",
                qty,
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
      // If the Ingredient Admin chose "Fulfill from Warehouse Stock", this
      // PROCUREMENT indent is being satisfied from stock already paid for and
      // sitting in the Purchase Register — re-tag it as INVENTORY_TRANSFER and
      // zero out the cost so the client isn't charged again.
      const issuedUpdate = {
        status: "ISSUED",
        issuedAt: new Date(),
        isSeenByRecipeAdminGrn: false,
      };
      if (fulfillFromWarehouse && doc.indentType === "PROCUREMENT") {
        issuedUpdate.indentType = "INVENTORY_TRANSFER";
        issuedUpdate.cost = 0;
      }
      await IngredientIndent.findByIdAndUpdate(id, { $set: issuedUpdate });

      // For WAREHOUSE_TRANSFER / INVENTORY_TRANSFER indents, the linked
      // ProductionOrder was created at AWAITING_WAREHOUSE_TRANSFER (chef can't
      // cook until the stock physically lands in Branch Kitchen). Once every
      // such transfer indent raised for this projection has been issued, unlock
      // the kitchen by flipping it to READY_TO_COOK. (WAREHOUSE_TRANSFER is
      // legacy/unused by the projection flow but kept here for old records.)
      const TRANSFER_TYPES = ["WAREHOUSE_TRANSFER", "INVENTORY_TRANSFER"];
      if (TRANSFER_TYPES.includes(doc.indentType) && doc.recipeId) {
        const remainingTransfers = await IngredientIndent.countDocuments({
          recipeId: doc.recipeId,
          indentType: { $in: TRANSFER_TYPES },
          status: { $in: ["INDENT_PENDING", "INDENT_VERIFIED", "INDENT_ISSUING"] },
          _id: { $ne: doc._id },
        });

        if (remainingTransfers === 0) {
          await ProductionOrder.findOneAndUpdate(
            { projectionId: doc.recipeId, status: "AWAITING_WAREHOUSE_TRANSFER" },
            { $set: { status: "READY_TO_COOK" } }
          );
        }
      }

      // Best-effort FEFO deduction from the brand's Purchase Register.
      // Only applies to PROCUREMENT (new stock) — never blocks the indent issue;
      // failures/shortfalls are only logged.
      if (brandName && doc.indentType !== "WAREHOUSE_TRANSFER") {
        await deductFromPurchaseRegister({
          brandName,
          itemName: doc.itemName,
          ingredientBrand: doc.ingredientBrand,
          qty,
          uom: doc.uom || "",
          branchCode: doc.branchCode || "JPNAGAR",
          referenceId: doc._id,
        });
      }

      return res.json({ success: true });
    } catch (creditErr) {
      // Credit failed — release the INDENT_ISSUING lock so the indent can be retried.
      console.error("Issue indent credit error (resetting to INDENT_VERIFIED):", creditErr?.message || creditErr);
      await IngredientIndent.findByIdAndUpdate(id, { $set: { status: "INDENT_VERIFIED" } });
      return res.status(500).json({ message: creditErr?.message || "Failed to issue indent item — please retry" });
    }
  } catch (err) {
    console.error("Issue indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to issue indent item" });
  }
};

export const resetStuckIndent = async (req, res) => {
  try {
    const { id } = req.params;

    // Step 1: Read the stuck document without modifying it.
    // We need its data (requestBrandName, itemName, ingredientBrand) to query brand_stocks.
    const stuck = await IngredientIndent.findOne(
      { _id: id, status: "INDENT_ISSUING" }
    ).lean();

    if (!stuck) {
      const existing = await IngredientIndent.findById(id).select("status").lean();
      if (!existing) return res.status(404).json({ message: "Indent item not found" });
      return res.status(409).json({
        message: `Cannot reset: item is in status "${existing.status}". Only INDENT_ISSUING items can be reset.`,
      });
    }

    // Step 2: Check whether the brand_stocks credit actually landed before the crash.
    // Uses $elemMatch so both conditions must be satisfied by the SAME history entry —
    // prevents false positives from independent array elements matching separately.
    const creditAlreadyLanded = await BrandStock.exists({
      brandName: String(stuck.requestBrandName || "").trim(),
      itemName: stuck.itemName,
      history: {
        $elemMatch: {
          referenceId: stuck._id,
          referenceKind: "INDENT",
        },
      },
    });

    const targetStatus = creditAlreadyLanded ? "ISSUED" : "INDENT_VERIFIED";

    // Step 3: Atomic transition — the status filter ensures only one concurrent reset
    // can write the final status. If two reset requests reach this point simultaneously,
    // only one findOneAndUpdate wins; the second returns null and the caller gets a 409.
    const resolved = await IngredientIndent.findOneAndUpdate(
      { _id: id, status: "INDENT_ISSUING" },
      {
        $set: {
          status: targetStatus,
          ...(creditAlreadyLanded && {
            issuedAt: stuck.issuedAt || new Date(),
            isSeenByRecipeAdminGrn: false,
          }),
        },
      },
      { new: true }
    );

    if (!resolved) {
      // Another concurrent reset won between Step 1 and Step 3 — not an error.
      return res.status(409).json({ message: "Reset was already completed by a concurrent request." });
    }

    return res.json({
      success: true,
      resolvedTo: targetStatus,
      creditAlreadyLanded: !!creditAlreadyLanded,
      message: creditAlreadyLanded
        ? "Stock credit was already applied — indent marked ISSUED."
        : "Stock credit had not yet applied — indent reverted to INDENT_VERIFIED for retry.",
    });
  } catch (err) {
    console.error("Reset stuck indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to reset indent" });
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
    if (doc.status === "INDENT_ISSUING") {
      return res.status(409).json({
        message: "Cannot delete — this item is mid-issue and may have already credited brand stock. Use Reset Stuck Indent first.",
      });
    }
    await doc.deleteOne();
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete indent error:", err?.message || err);
    return res.status(500).json({ message: "Failed to delete indent item" });
  }
};

