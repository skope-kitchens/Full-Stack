/**
 * Normalize brand string for comparison.
 * Lowercase, remove "shawarma", collapse spaces, remove non-alphanumeric.
 * e.g. "AL Mashawi Shawarma" -> "almashawi"
 */
function normBrand(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/shawarma/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Check if recipe brand matches logged-in user's brand.
 * Exact match after normalization (no substring matching — substring
 * matching allowed false positives like "Al" matching "Al Mashawi").
 */
export function brandsMatch(userBrandName, recipeBrand) {
  if (!userBrandName || !recipeBrand) return false;
  const a = normBrand(userBrandName);
  const b = normBrand(recipeBrand);
  if (!a || !b) return false;
  return a === b;
}
