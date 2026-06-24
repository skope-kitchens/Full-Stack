import Brand from "../models/brand.js";
import { ristaClient } from "../ristaClient.js";

// Brand-name normalizer (strips "shawarma" + non-alphanumerics) so Rista item
// brandName/accountName can be matched loosely against the Skope brand name.
export const normBrandKey = (s = "") =>
  s.toString().toLowerCase().replace(/shawarma/g, "").replace(/[^a-z0-9]/g, "");

/**
 * Compute one brand's Rista sales summary for a single day.
 *
 * This is the exact logic previously inlined in /api/analytics/sales/summary,
 * extracted verbatim so both that route and the client analytics endpoints
 * share one implementation. Output shape is unchanged.
 *
 * @returns one of:
 *   { noData: true, reason }                  — nothing to show
 *   { noData: false, brand, day, branches, noOfSales, revenue, netAmount,
 *     taxTotal, discountTotal, items, avgSaleAmount, totalItemQty,
 *     avgItemSellingPrice }
 */
export async function computeBrandSalesSummary({ brandName, day, branches: requestedBranches }) {
  if (!brandName) {
    return { noData: true, reason: "brand_not_linked" };
  }

  const brandKey = normBrandKey(brandName);

  const brandDoc = await Brand.findOne({ brandName });
  if (!brandDoc) {
    return { noData: true, reason: "brand_not_found" };
  }

  // Resolve branches: explicit request wins, else the brand's configured rista codes.
  let branches = [];
  if (requestedBranches) {
    branches = Array.isArray(requestedBranches) ? requestedBranches : [requestedBranches];
  } else {
    branches = brandDoc.ristaBranchCodes?.length
      ? brandDoc.ristaBranchCodes
      : [brandDoc.ristaBranchCode];
  }
  branches = [...new Set(branches.filter(Boolean))];

  const allSalesPages = await Promise.all(
    branches.map((branch) =>
      ristaClient.getSalesPage({ branch, day, status: "Closed" })
    )
  );

  const allSales = allSalesPages.flat();
  if (!allSales.length) {
    return { noData: true, reason: "no_sales" };
  }

  let brandItems = [];
  const brandOrderSet = new Set();

  let totalRevenue = 0;
  let totalNet = 0;
  let totalTax = 0;
  let totalDiscount = 0;

  for (const sale of allSales) {
    const { invoiceNumber, billRoundedAmount, netAmount, taxAmount, totalDiscountAmount } = sale;

    const matchedItems = (sale.items || []).filter((it) =>
      normBrandKey(it.brandName || it.accountName || "").includes(brandKey)
    );

    if (!matchedItems.length) continue;

    brandOrderSet.add(invoiceNumber);
    brandItems.push(...matchedItems);

    totalRevenue += Number(billRoundedAmount || 0);
    totalNet += Number(netAmount || 0);
    totalTax += Number(taxAmount || 0);
    totalDiscount += Number(totalDiscountAmount || 0);
  }

  if (!brandItems.length) {
    return { noData: true, reason: "brand_items_not_found" };
  }

  const totalOrders = brandOrderSet.size;
  const totalItemQty = brandItems.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const totalItemNet = brandItems.reduce((s, i) => s + Number(i.netAmount || 0), 0);

  const avgSaleAmount = totalOrders
    ? Number((totalRevenue / totalOrders).toFixed(2))
    : 0;

  return {
    noData: false,
    brand: brandName,
    day,
    branches,
    noOfSales: totalOrders,
    revenue: totalRevenue,
    netAmount: totalNet,
    taxTotal: totalTax,
    discountTotal: totalDiscount,
    items: brandItems,
    avgSaleAmount,
    totalItemQty,
    avgItemSellingPrice: totalItemQty
      ? Number((totalItemNet / totalItemQty).toFixed(2))
      : 0,
  };
}
