import MinimumPackage from "../models/minimumPackage.js";

const normalize = (s) => String(s || "").trim().toLowerCase();

export const lookupMinimumPackages = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const names = [
      ...new Set(items.map((i) => normalize(i?.itemName)).filter(Boolean)),
    ];

    if (names.length === 0) {
      return res.json({ items: [] });
    }

    // Case-insensitive exact matches using anchored regex.
    // Keep it simple and predictable; also cap to prevent runaway OR lists.
    const capped = names.slice(0, 300);
    const or = capped.map((n) => ({
      itemName: { $regex: `^${escapeRegex(n)}$`, $options: "i" },
    }));

    const docs = await MinimumPackage.find({ $or: or })
      .select("itemName uom minPackQty minPackCost")
      .lean();

    const result = docs.map((d) => ({
      itemName: d.itemName,
      uom: d.uom || "",
      minPackQty: Number(d.minPackQty || 0),
      minPackCost: Number(d.minPackCost || 0),
    }));

    return res.json({ items: result });
  } catch (err) {
    console.error("Minimum package lookup error:", {
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });
    return res.status(500).json({ message: "Failed to lookup minimum packages" });
  }
};

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

