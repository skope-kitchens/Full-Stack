import { ristaClient } from "../ristaClient.js";
import { resolveStoreCodeFromStock } from "../utils/branchStoreMapper.js";

export const getStockItems = async (req, res) => {
  try {
    let { brandName, branchLabel } = req.query;

    if (!brandName || !branchLabel) {
      return res.status(400).json({
        message: "brandName and branchLabel are required",
      });
    }

    brandName = brandName.trim();
    branchLabel = branchLabel.trim();

    // 1️⃣ get ALL stores (this has storeCode + branch + brand accountNames)
    const stores = await ristaClient.getStores();

    // 2️⃣ find the correct storeCode for this brand + branch
    const storeCode = resolveStoreCodeFromStock(
      stores,
      brandName,
      branchLabel
    );


    if (!storeCode) {
      return res.status(404).json({
        message: "Store code not found for brand + branch",
        brandName,
        branchLabel,
      });
    }

    // 3️⃣ fetch inventory ONLY for that store
    const inventory = await ristaClient.getInventory(storeCode);

    return res.json({
      success: true,
      storeCode,
      count: inventory?.length || 0,
      items: inventory,
    });
  } catch (err) {
    console.error("Stock fetch failed", err?.response?.data || err);
    return res.status(500).json({
      message: "Stock fetch failed",
      error: err?.message || err,
    });
  }
};
