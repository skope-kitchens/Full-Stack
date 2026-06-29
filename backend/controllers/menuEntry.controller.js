import MenuEntry from "../models/menuEntry.js";
import User from "../models/user.js";

export const createMenuEntry = async (req, res) => {
  try {
    if (req.user?.role !== "client") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { items, branchCode } = req.body || {};
    if (!branchCode || !String(branchCode).trim()) {
      return res.status(400).json({ message: "branchCode is required" });
    }
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
      branchCode: String(branchCode).trim(),
      items: safeItems,
      isSeenByRecipeAdmin: false,
    });

    // Lifecycle: the first menu submission moves the client out of AWAITING_MENU
    // into IN_TRIAL. Only flips when currently AWAITING_MENU (idempotent, safe to
    // re-submit). Best-effort — never blocks the menu save.
    try {
      await User.updateOne(
        { _id: req.user._id, lifecycleStage: "AWAITING_MENU" },
        { $set: { lifecycleStage: "IN_TRIAL" } }
      );
    } catch (lifecycleErr) {
      console.error("Lifecycle flip on menu submit failed:", lifecycleErr?.message || lifecycleErr);
    }

    return res.status(201).json({ success: true, data: entry });
  } catch (err) {
    console.error("Create menu entry error:", err?.message || err);
    return res.status(500).json({ message: "Failed to create menu entry" });
  }
};

export const deleteMenuEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const deleted = await MenuEntry.findByIdAndDelete(entryId);
    if (!deleted) {
      return res.status(404).json({ message: "Menu entry not found" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete menu entry error:", err?.message || err);
    return res.status(500).json({ message: "Failed to delete menu entry" });
  }
};

export const listMenuEntriesForBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const brandUser = await User.findById(brandId).select("brandName").lean();
    if (!brandUser) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const q = { clientId: brandId };
    if (req.user.role === "RECIPE_MANAGER") q.branchCode = req.user.branchCode;

    const list = await MenuEntry.find(q)
      .sort({ createdAt: -1 })
      .lean();

    // mark as seen
    const seenFilter = { clientId: brandId, isSeenByRecipeAdmin: false };
    if (req.user.role === "RECIPE_MANAGER") seenFilter.branchCode = req.user.branchCode;
    await MenuEntry.updateMany(
      seenFilter,
      { $set: { isSeenByRecipeAdmin: true } }
    );

    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("List menu entries error:", err?.message || err);
    return res.status(500).json({ message: "Failed to list menu entries" });
  }
};

