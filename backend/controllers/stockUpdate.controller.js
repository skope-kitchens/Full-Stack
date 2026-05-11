import StockUpdate from "../models/stockUpdate.js";
import User from "../models/user.js";

function normalizeDateOnly(dateStr) {
  const raw = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function sanitizeItem(row) {
  const itemName = String(row?.itemName || "").trim();
  const uom = String(row?.uom || "").trim();
  const issueQty = Number(row?.issueQty);
  const usedQty = Number(row?.usedQty);
  const wastageQty = Number(row?.wastageQty);
  const remainingQty = Number(row?.remainingQty);

  if (!itemName || !uom) return null;
  const nums = [issueQty, usedQty, wastageQty, remainingQty];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  return { itemName, uom, issueQty, usedQty, wastageQty, remainingQty };
}

export async function upsertStockUpdate(req, res) {
  try {
    const { brandId, date, items } = req.body || {};

    const dateObj = normalizeDateOnly(date);
    if (!dateObj) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const brand = await User.findById(brandId).select("brandName role").lean();
    if (!brand || !brand.brandName) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const rows = Array.isArray(items) ? items : [];
    const cleaned = rows.map(sanitizeItem).filter(Boolean);
    if (cleaned.length === 0) {
      return res.status(400).json({ message: "At least one valid item is required" });
    }

    const doc = await StockUpdate.findOneAndUpdate(
      { brandId: brand._id, date: dateObj },
      {
        $set: {
          brandName: String(brand.brandName).trim(),
          items: cleaned,
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, data: doc });

  } catch (err) {
    const code = err?.code;
    if (code === 11000) {
      return res.status(409).json({ message: "Stock for this brand/date already exists" });
    }
    console.error("upsertStockUpdate error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save stock update" });
  }
}

export async function listAllStockUpdates(req, res) {
  try {
    const list = await StockUpdate.find({})
      .sort({ date: -1, brandName: 1 })
      .lean();

    const data = (list || []).map((d) => ({
      _id: d._id,
      brandId: d.brandId,
      brandName: d.brandName,
      date: new Date(d.date).toISOString().slice(0, 10),
      items: d.items || [],
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("listAllStockUpdates error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch stock updates" });
  }
}

export async function listStockUpdatesByBrand(req, res) {
  try {
    const { brandId } = req.query || {};
    if (!brandId) return res.status(400).json({ message: "brandId is required" });

    const list = await StockUpdate.find({ brandId })
      .sort({ date: -1 })
      .lean();

    const dates = (list || []).map((d) => ({
      _id: d._id,
      brandId: d.brandId,
      brandName: d.brandName,
      date: new Date(d.date).toISOString().slice(0, 10),
      items: d.items || [],
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return res.json({ success: true, data: dates });

  } catch (err) {
    console.error("listStockUpdatesByBrand error:", err?.message || err);
    return res.status(500).json({ message: "Failed to fetch stock updates" });
  }
}
