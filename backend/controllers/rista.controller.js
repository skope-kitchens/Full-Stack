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

    // Internal-only test branch — not a real Rista outlet. Lets the "Test Brand"
    // chef account (branchCode: TESTBRANCH) be exercised end-to-end without
    // touching real branch/store data.
    result.push({ storeCode: "TESTBRANCH", storeName: "Test Branch (Internal)" });

    return res.json({ stores: result });
  } catch (err) {
    console.error("Rista stores fetch failed", err?.response?.data || err);
    return res.status(500).json({ message: "Failed to fetch stores" });
  }
};

