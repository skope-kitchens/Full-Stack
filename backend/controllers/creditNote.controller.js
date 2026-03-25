import CreditNoteAlert from "../models/creditNoteAlert.js";

export const createCreditNoteAlert = async (req, res) => {
  try {
    const { ingredientName, note, brandName } = req.body || {};
    const name = String(ingredientName || "").trim();
    if (!name) {
      return res.status(400).json({ message: "ingredientName is required" });
    }

    const doc = await CreditNoteAlert.create({
      ingredientName: name,
      note: String(note || "").trim(),
      brandName: String(brandName || "").trim(),
      createdByRole: "RECIPE_MANAGER",
      status: "OPEN",
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error("Create credit note alert error:", err?.message || err);
    return res.status(500).json({ message: "Failed to create credit note alert" });
  }
};

export const listCreditNoteAlerts = async (req, res) => {
  try {
    const { status } = req.query || {};
    const q = {};
    if (status) q.status = status;
    const list = await CreditNoteAlert.find(q).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("List credit note alerts error:", err?.message || err);
    return res.status(500).json({ message: "Failed to list credit note alerts" });
  }
};

export const deleteCreditNoteAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await CreditNoteAlert.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ message: "Credit note alert not found" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete credit note alert error:", err?.message || err);
    return res.status(500).json({ message: "Failed to delete credit note alert" });
  }
};

