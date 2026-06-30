import MenuEntry from "../models/menuEntry.js";
import User from "../models/user.js";
import MainRecipe from "../models/mainrecipe.models.js";
import { escapeRegex } from "../utils/bomExpander.js";
import { stripDeletedMenuItems } from "../utils/menuVisibility.js";

// Anchored, case-insensitive exact match — same brand-scoping pattern used across
// the codebase (localKitchen/headChef controllers). escapeRegex is imported, not
// modified — bomExpander.js is a protected file and stays untouched.
const brandExact = (v) => new RegExp(`^${escapeRegex(String(v || "").trim())}$`, "i");

// The only fields the client may edit on a menu item (BUG-001 scope).
const EDITABLE_FIELDS = ["recipeName", "qty", "uom", "cost"];

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

/**
 * PUT /api/menu-items/:entryId/items/:itemId — client edits one menu item.
 * Accepts ONLY recipeName, qty, uom, cost. Any other field → 400.
 * Brand ownership: the entry must belong to the requesting client (clientId) → 403.
 * If recipeName changes, it must exist as a MainRecipe for the client's brand → 400.
 */
export const editMenuItem = async (req, res) => {
  try {
    if (req.user?.role !== "client") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { entryId, itemId } = req.params;
    const body = req.body || {};

    // Reject any field outside the allowed four (strict scope).
    const unknown = Object.keys(body).filter((k) => !EDITABLE_FIELDS.includes(k));
    if (unknown.length > 0) {
      return res.status(400).json({ message: `Unsupported field(s): ${unknown.join(", ")}` });
    }

    // Brand ownership: reuse the read-path scoping (clientId === requester).
    const entry = await MenuEntry.findById(entryId);
    if (!entry) return res.status(404).json({ message: "Menu entry not found" });
    if (String(entry.clientId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const item = entry.items.id(itemId);
    if (!item || item.isDeleted) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    // Validate + apply only provided allowed fields.
    if (body.recipeName !== undefined) {
      const recipeName = String(body.recipeName).trim();
      if (!recipeName) return res.status(400).json({ message: "recipeName cannot be empty" });

      // Recipe-edit check: the new recipe must belong to the client's own brand.
      if (recipeName.toLowerCase() !== String(item.recipeName || "").trim().toLowerCase()) {
        const client = await User.findById(req.user._id).select("brandName").lean();
        const brandName = client?.brandName || entry.brandName || "";
        const exists = await MainRecipe.exists({
          brand: brandExact(brandName),
          recipeName: brandExact(recipeName),
        });
        if (!exists) {
          return res.status(400).json({ message: "Recipe does not belong to your brand" });
        }
      }
      item.recipeName = recipeName;
    }

    if (body.qty !== undefined) {
      const qty = Number(body.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: "qty must be a positive number" });
      }
      item.qty = qty;
    }

    if (body.uom !== undefined) {
      const uom = String(body.uom).trim();
      if (!uom) return res.status(400).json({ message: "uom cannot be empty" });
      item.uom = uom;
    }

    if (body.cost !== undefined) {
      const cost = Number(body.cost);
      if (!Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ message: "cost must be zero or a positive number" });
      }
      item.cost = cost;
    }

    await entry.save();
    return res.json({ success: true, data: item });
  } catch (err) {
    console.error("Edit menu item error:", err?.message || err);
    return res.status(500).json({ message: "Failed to edit menu item" });
  }
};

/**
 * DELETE /api/menu-items/:entryId/items/:itemId — client SOFT-deletes one menu item.
 * Sets isDeleted = true (subdocument retained). Brand ownership enforced → 403.
 * Idempotent: deleting an already-deleted item still returns 200.
 */
export const softDeleteMenuItem = async (req, res) => {
  try {
    if (req.user?.role !== "client") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { entryId, itemId } = req.params;

    const entry = await MenuEntry.findById(entryId);
    if (!entry) return res.status(404).json({ message: "Menu entry not found" });
    if (String(entry.clientId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const item = entry.items.id(itemId);
    if (!item) return res.status(404).json({ message: "Menu item not found" });

    if (!item.isDeleted) {
      item.isDeleted = true;
      await entry.save();
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Soft-delete menu item error:", err?.message || err);
    return res.status(500).json({ message: "Failed to delete menu item" });
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

    // Hide soft-deleted menu items from the recipe-admin incoming queue.
    return res.json({ success: true, data: stripDeletedMenuItems(list) });
  } catch (err) {
    console.error("List menu entries error:", err?.message || err);
    return res.status(500).json({ message: "Failed to list menu entries" });
  }
};

