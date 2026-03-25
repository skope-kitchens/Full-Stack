import MenuEntry from "../models/menuEntry.js";
import User from "../models/user.js";

export const createMenuEntry = async (req, res) => {
  try {
    if (req.user?.role !== "client") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const safeItems = items
      .map((i) => ({
        recipeName: String(i.recipeName || "").trim(),
        qty: Number(i.qty || 0),
        uom: String(i.uom || "GM").trim(),
        cost: Number(i.cost || 0),
      }))
      .filter((i) => i.recipeName && i.qty > 0 && i.uom);

    if (safeItems.length === 0) {
      return res.status(400).json({ message: "No valid menu items" });
    }

    const client = await User.findById(req.user._id).select("brandName").lean();

    const entry = await MenuEntry.create({
      clientId: req.user._id,
      brandName: client?.brandName || "",
      items: safeItems,
      isSeenByRecipeAdmin: false,
    });

    return res.status(201).json({ success: true, data: entry });
  } catch (err) {
    console.error("Create menu entry error:", err?.message || err);
    return res.status(500).json({ message: "Failed to create menu entry" });
  }
};

export const listMenuEntriesForBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const brandUser = await User.findById(brandId).select("brandName").lean();
    if (!brandUser) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const list = await MenuEntry.find({ clientId: brandId })
      .sort({ createdAt: -1 })
      .lean();

    // mark as seen
    await MenuEntry.updateMany(
      { clientId: brandId, isSeenByRecipeAdmin: false },
      { $set: { isSeenByRecipeAdmin: true } }
    );

    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("List menu entries error:", err?.message || err);
    return res.status(500).json({ message: "Failed to list menu entries" });
  }
};

