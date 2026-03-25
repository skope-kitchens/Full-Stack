import MainRecipe from "../models/mainrecipe.models.js";
import SubRecipe from "../models/subrecipe.models.js";

const toNumber = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

export const listAllIngredients = async (req, res) => {
  try {
    const mains = await MainRecipe.find({})
      .select("brand recipeName items")
      .lean();
    const subs = await SubRecipe.find({})
      .select("brand recipeName items")
      .lean();

    const map = new Map();

    const addItems = (source, recipes) => {
      for (const r of recipes) {
        for (const item of r.items || []) {
          if (item.type !== "INGREDIENT") continue;
          const key = `${item.refId || ""}||${item.uom || ""}`;
          const price = toNumber(item.netPrice);

          if (!map.has(key)) {
            map.set(key, {
              id: key,
              refId: item.refId,
              uom: item.uom || null,
              currentPrice: price,
              minPrice: price,
              maxPrice: price,
              pricesVary: false,
              examples: [],
            });
          }
          const entry = map.get(key);
          entry.examples.push({
            source,
            recipeId: r._id,
            recipeName: r.recipeName,
            brand: r.brand,
            netPrice: price,
          });
          if (price < entry.minPrice) entry.minPrice = price;
          if (price > entry.maxPrice) entry.maxPrice = price;
          entry.currentPrice = entry.maxPrice;
          entry.pricesVary = entry.minPrice !== entry.maxPrice;
        }
      }
    };

    addItems("main", mains);
    addItems("sub", subs);

    const ingredients = Array.from(map.values()).sort((a, b) =>
      (a.refId || "").localeCompare(b.refId || "")
    );

    res.json({ ingredients });
  } catch (err) {
    console.error("Admin listAllIngredients error:", err);
    res.status(500).json({ message: "Failed to fetch ingredients" });
  }
};

export const bulkUpdateIngredientPrices = async (req, res) => {
  try {
    const { updates } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }

    for (const u of updates) {
      const refId = typeof u.refId === "string" ? u.refId.trim() : "";
      const uom = typeof u.uom === "string" ? u.uom.trim() : "";
      const newPrice = toNumber(u.newPrice);

      if (!refId || !Number.isFinite(newPrice) || newPrice < 0) continue;

      const baseFilter = {
        "items.type": "INGREDIENT",
        "items.refId": refId,
      };
      if (uom) {
        baseFilter["items.uom"] = uom;
      }

      const arrayFilters = [
        {
          "elem.type": "INGREDIENT",
          "elem.refId": refId,
          ...(uom ? { "elem.uom": uom } : {}),
        },
      ];

      await MainRecipe.updateMany(
        baseFilter,
        { $set: { "items.$[elem].netPrice": newPrice } },
        { arrayFilters }
      );
      await SubRecipe.updateMany(
        baseFilter,
        { $set: { "items.$[elem].netPrice": newPrice } },
        { arrayFilters }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Admin bulkUpdateIngredientPrices error:", err);
    res.status(500).json({ message: "Failed to update ingredients" });
  }
};

