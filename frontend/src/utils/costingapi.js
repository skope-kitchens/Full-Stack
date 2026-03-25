import api from "./api";

/**
 * @param {string} recipeName - Dish/recipe name
 * @param {number} [wastagePercent=5] - Wastage percentage
 * @param {string} [brandName] - Optional; when provided (e.g. admin viewing a brand's order), sent to backend for brand-scoped recipe lookup
 */
export const fetchFoodCost = async (recipeName, wastagePercent, brandName) => {
  const body = { recipeName, wastagePercent };
  if (brandName) body.brandName = brandName;
  const res = await api.post("/api/costing/calculate", body);
  return res.data;
};
