import { ristaClient } from "../ristaClient.js";

export const listRistaStores = async (req, res) => {
  try {
    const stores = await ristaClient.getStores();
    const list = Array.isArray(stores) ? stores : [];

    // Return small, stable fields for dropdowns
    const result = list.map((s) => ({
      storeCode: s.storeCode || s.branchCode || s.code || "",
      storeName: s.storeName || s.name || "",
    })).filter((s) => s.storeCode);

    return res.json({ stores: result });
  } catch (err) {
    console.error("Rista stores fetch failed", err?.response?.data || err);
    return res.status(500).json({ message: "Failed to fetch stores" });
  }
};

