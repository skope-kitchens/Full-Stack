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
 * Uses bidirectional substring: match if either contains the other.
 * e.g. user "AL Mashawi Shawarma" matches recipe "Al Mashawi"
 * e.g. user "Al Mashawi" matches recipe "AL Mashawi Shawarma"
 */
export function brandsMatch(userBrandName, recipeBrand) {
  if (!userBrandName || !recipeBrand) return false;
  const a = normBrand(userBrandName);
  const b = normBrand(recipeBrand);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
