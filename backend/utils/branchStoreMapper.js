// utils/branchStoreMapper.js

export function resolveStoreCodeFromStock(stores, brandName, branchLabel) {
  if (!Array.isArray(stores)) return null;

  const norm = (s = "") =>
    s.toString().toLowerCase().replace(/\s+/g, " ").trim();

  const nBrand = norm(brandName);
  const nBranch = norm(branchLabel);

  for (const s of stores) {
    const branch = norm(s.branchName || "");
    const accounts = (s.accountNames || []).map(norm);

    const brandMatch = accounts.some(a => a.includes(nBrand));
    const branchMatch = branch.includes(nBranch);

    if (brandMatch && branchMatch) {
      return s.storeCode;
    }
  }

  return null;
}


// UI branch label -> analytics branch code
export function getAnalyticsBranchCode(label) {
  if (!label) return null;

  const map = {
    "jp nagar": "BEN",
    "jayanagar": "JNG",
    "marathahalli": "MAR",
    "koramangala": "KOR",
    "head office": "HO",
  };

  const key = label.toString().toLowerCase().trim();

  return map[key] || null;
}
