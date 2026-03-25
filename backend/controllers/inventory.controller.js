import { ristaClient } from "../ristaClient.js";
import KitchenInventory from "../models/kitchenInventory.js";
import ItemMaster from "../models/itemMaster.js";

export const getInventoryItems = async (req, res) => {
  try {
    const { branchCode } = req.query;

    if (!branchCode) {
      return res.status(400).json({
        message: "branchCode is required",
      });
    }
 
    // IMPORTANT:
    // Rista expects `x-api-token` to be a JWT signed with `RISTA_SECRET_KEY`.
    // Use the shared ristaClient so we don't accidentally send the wrong token.
    const items = await ristaClient.getInventory(branchCode);

    const filteredItems = (items || []).map((item) => ({
      skuCode: item.skuCode,
      branchCode: item.branchCode,
      name: item.name,
      categoryName: item.categoryName,
      measuringUnit: item.measuringUnit,
      itemQty: item.itemQty,
      averageCost: item.averageCost,
    }));

    res.json({ data: filteredItems });

  } catch (error) {
    console.error("Rista inventory error:", {
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data,
    });

    res.status(error?.response?.status || 500).json({
      message: "Failed to fetch inventory items",
      error: error?.response?.data || error.message,
    });
  }
};

export const getClientInventory = async (req, res) => {
  try {
    const { clientId } = req.params;
    const authedId = req.user?._id?.toString();

    if (!authedId || authedId !== clientId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // get client inventory
    const inventoryRows = await KitchenInventory.find({ clientId }).lean();

    const inventoryMap = {};
    inventoryRows.forEach(row => {
      inventoryMap[row.ingredientId.toString()] = Number(row.availableQty || 0);
    });

    // get all ingredients from itemmaster
    const items = await ItemMaster.find(
      {},
      "itemName uom minPackQty minPackCost netPrice"
    ).lean();

    const result = items.map(item => ({
      ingredientId: item._id,
      itemName: item.itemName,
      uom: item.uom,
      availableQty: inventoryMap[item._id.toString()] || 0,
      minPackQty: item.minPackQty ?? 1,
      minPackCost: item.minPackCost ?? 0,
      netPrice: item.netPrice ?? 0
    }));

    res.json({ items: result });

  } catch (error) {
    console.error("Client inventory error:", error);

    res.status(500).json({
      message: "Failed to fetch client inventory",
      error: error.message,
    });
  }
};

