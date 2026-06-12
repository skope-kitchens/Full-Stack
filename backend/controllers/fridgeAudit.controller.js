import BrandStock from "../models/brandStock.js";
import FridgeAudit from "../models/fridgeAudit.js";

const SPOILAGE_REASONS = new Set(["SPOILED_EXPIRED", "WASTAGE", "QUALITY_REJECTION", "OTHER"]);

function normalizeDateOnly(dateStr) {
  const raw = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * GET /api/fridge-stock
 * RECIPE_MANAGER only. Scoped to the chef's own branchCode (from JWT).
 * Returns all SEMI_FINISHED stock currently sitting in this kitchen's fridge.
 */
export const getFridgeStock = async (req, res) => {
  try {
    const branchCode = req.user?.branchCode;
    if (!branchCode) {
      return res.status(400).json({ message: "No branch assigned to this account" });
    }

    const list = await BrandStock.find({
      location: "SEMI_FINISHED",
      branchCode,
      status: "Pending",
      qtyRemaining: { $gt: 0 },
    })
      .sort({ itemName: 1 })
      .lean();

    const data = (list || []).map((doc) => {
      // Every RECEIVED entry is one batch added to the fridge — most recent first.
      const receivedBatches = (doc.history || [])
        .filter((h) => h.type === "RECEIVED")
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .map((h) => ({ qty: h.qty, uom: h.uom, at: h.at }));

      return {
        _id: doc._id,
        brandName: doc.brandName,
        itemName: doc.itemName,
        ingredientBrand: doc.ingredientBrand || "",
        uom: doc.uom || "",
        qtyRemaining: Number(doc.qtyRemaining || 0),
        lastProducedAt: receivedBatches[0]?.at || null,
        receivedBatches,
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error("getFridgeStock error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch fridge stock" });
  }
};

/**
 * POST /api/fridge-audit
 * RECIPE_MANAGER only. Scoped to the chef's own branchCode (from JWT).
 *
 * Body: { date: "YYYY-MM-DD", items: [{ stockId, countedQty, spoiledQty, spoilageReason, note }] }
 *
 * For each item:
 *  - delta = previousQty - countedQty (total amount removed since last audit)
 *  - up to spoiledQty of that delta is recorded as SPOILAGE (with reason)
 *  - any remaining delta (or a negative delta, i.e. an increase) is recorded as RECONCILIATION
 *  - qtyRemaining is set to countedQty
 *
 * Saves a FridgeAudit record (one per branch per day) for the audit trail.
 */
export const submitFridgeAudit = async (req, res) => {
  try {
    const branchCode = req.user?.branchCode;
    if (!branchCode) {
      return res.status(400).json({ message: "No branch assigned to this account" });
    }

    const actorRole = req.user?.role || "";
    const { date, items } = req.body || {};

    const dateObj = normalizeDateOnly(date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const rows = Array.isArray(items) ? items : [];
    if (rows.length === 0) {
      return res.status(400).json({ message: "At least one item is required" });
    }

    const auditItems = [];

    for (const row of rows) {
      const stockId = String(row?.stockId || "").trim();
      const countedQty = Number(row?.countedQty);
      const spoiledQty = Number(row?.spoiledQty || 0);
      const spoilageReason = SPOILAGE_REASONS.has(row?.spoilageReason) ? row.spoilageReason : null;
      const note = String(row?.note || "").trim();

      if (!stockId || !Number.isFinite(countedQty) || countedQty < 0) {
        return res.status(400).json({ message: "Each item requires stockId and a valid countedQty" });
      }
      if (!Number.isFinite(spoiledQty) || spoiledQty < 0) {
        return res.status(400).json({ message: "spoiledQty must be 0 or greater" });
      }
      if (spoiledQty > 0 && !spoilageReason) {
        return res.status(400).json({ message: "spoilageReason is required when spoiledQty > 0" });
      }
      if (spoiledQty > countedQty) {
        return res.status(400).json({ message: "spoiledQty cannot be greater than countedQty" });
      }

      const stock = await BrandStock.findOne({
        _id: stockId,
        location: "SEMI_FINISHED",
        branchCode,
        status: "Pending",
      });
      if (!stock) {
        return res.status(404).json({ message: `Fridge stock item not found: ${stockId}` });
      }

      const previousQty = Number(stock.qtyRemaining || 0);
      // finalQty = what remains in the fridge after this audit, once the spoiled
      // portion (always taken out of the counted quantity) is removed.
      const finalQty = countedQty - spoiledQty;
      const history = [];

      // Step 1 — physical count adjustment: previousQty -> countedQty.
      // Recorded whenever the counted quantity differs from what the system expected,
      // independent of any spoilage flagged in this same audit.
      if (countedQty !== previousQty) {
        history.push({
          type: "RECONCILIATION",
          qty: Math.abs(previousQty - countedQty),
          uom: stock.uom || "",
          at: new Date(),
          previousQty,
          newQty: countedQty,
          actorRole,
          note:
            countedQty < previousQty
              ? "Fridge audit — physical count adjustment"
              : "Fridge audit — physical count adjustment (increase)",
        });
      }

      // Step 2 — spoilage: countedQty -> finalQty.
      // Recorded whenever spoiled/wasted stock is flagged, even if the counted
      // quantity itself matches what the system expected.
      if (spoiledQty > 0) {
        history.push({
          type: "SPOILAGE",
          qty: spoiledQty,
          uom: stock.uom || "",
          at: new Date(),
          previousQty: countedQty,
          newQty: finalQty,
          spoilageReason,
          actorRole,
          note: note || "Fridge audit — spoiled/wasted cooked food removed",
        });
      }

      if (history.length > 0) {
        stock.qtyRemaining = finalQty;
        stock.history.push(...history);
        await stock.save();
      }

      auditItems.push({
        itemName: stock.itemName,
        ingredientBrand: stock.ingredientBrand || "",
        uom: stock.uom || "",
        previousQty,
        countedQty,
        spoiledQty,
        finalQty,
        spoilageReason: spoiledQty > 0 ? spoilageReason : null,
        note,
      });
    }

    const audit = await FridgeAudit.findOneAndUpdate(
      { branchCode, date: dateObj },
      {
        $set: {
          items: auditItems,
          actorRole,
          actorId: req.user?._id || null,
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, data: audit });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Fridge audit for this branch/date already exists" });
    }
    console.error("submitFridgeAudit error:", err?.message || err);
    return res.status(500).json({ message: "Failed to submit fridge audit" });
  }
};

/**
 * GET /api/fridge-audit
 * RECIPE_MANAGER only. Lists past audits for the chef's branch, most recent first.
 */
export const listFridgeAudits = async (req, res) => {
  try {
    const branchCode = req.user?.branchCode;
    if (!branchCode) {
      return res.status(400).json({ message: "No branch assigned to this account" });
    }

    const list = await FridgeAudit.find({ branchCode })
      .sort({ date: -1 })
      .lean();

    const data = (list || []).map((d) => ({
      _id: d._id,
      branchCode: d.branchCode,
      date: new Date(d.date).toISOString().slice(0, 10),
      items: d.items || [],
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("listFridgeAudits error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch fridge audits" });
  }
};