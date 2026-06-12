// Lightweight UOM conversion for the Purchase Register's FEFO deduction.
// Only handles weight and volume unit pairs that differ by a factor of 1000.
// Returns null when units are incompatible/unknown — caller should treat the
// quantities as already-matching units in that case.

const NORMALIZE = {
  KG: "KG", KGS: "KG", KILOGRAM: "KG", KILOGRAMS: "KG",
  GM: "GM", G: "GM", GRAM: "GM", GRAMS: "GM",
  L: "L", LTR: "L", LITRE: "L", LITER: "L", LITERS: "L", LITRES: "L",
  ML: "ML", MILLILITRE: "ML", MILLILITER: "ML",
  PC: "PC", PCS: "PC", PIECE: "PC", PIECES: "PC", NOS: "PC",
};

const FACTOR_TO_BASE = {
  // base units: KG (weight), L (volume), PC (count)
  KG: 1,
  GM: 0.001,
  L: 1,
  ML: 0.001,
  PC: 1,
};

const BASE_GROUP = {
  KG: "WEIGHT",
  GM: "WEIGHT",
  L: "VOLUME",
  ML: "VOLUME",
  PC: "COUNT",
};

export const normalizeUomCode = (uom) => {
  const key = String(uom || "").trim().toUpperCase();
  return NORMALIZE[key] || key;
};

/**
 * Converts qty from fromUom to toUom.
 * Returns the converted quantity, or null if the units are not in
 * compatible groups (e.g. weight vs volume) or unrecognized.
 */
export const convertQty = (qty, fromUom, toUom) => {
  const from = normalizeUomCode(fromUom);
  const to = normalizeUomCode(toUom);

  if (from === to) return qty;

  const fromFactor = FACTOR_TO_BASE[from];
  const toFactor = FACTOR_TO_BASE[to];

  if (fromFactor == null || toFactor == null) return null;
  if (BASE_GROUP[from] !== BASE_GROUP[to]) return null;

  return (qty * fromFactor) / toFactor;
};