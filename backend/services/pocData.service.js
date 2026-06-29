/**
 * pocData.service.js — POC read aggregator.
 *
 * During the trial/training phase the POC is the TEMPORARY writer/reader of
 * operational data. Once the producer dashboards exist, the POC's read views
 * should source LIVE data from them instead of from POC-entered records. This
 * service is the single seam where that swap happens: each function returns the
 * current (POC-entered) data today, behind a stable response shape, with a
 * clearly-marked `// FUTURE:` stub showing where the live source plugs in.
 *
 * IMPORTANT: do NOT invent endpoints/collections for dashboards that are not
 * built yet. The future stubs return real current data or an explicit empty
 * shape with `source: "POC_ENTERED"` — never fabricated numbers.
 */
import { getDishIterations } from "../utils/iterationFcr.js";
import FcrConfirmation from "../models/fcrConfirmation.js";

/**
 * Per-dish iteration FCR timeline for a brand (T1→T2→T3→TR1→TR2→TR3→Final),
 * each iteration tagged with its POC confirmation status.
 * NOW: computed independently per iteration document (TrialRecipe/
 * TrainingRecipe/MainRecipe), reflecting the POC's brand+iteration-scoped
 * price entries — never cross-iteration.
 * FUTURE: source from the Head Chef dashboard once recipe/FCR approval lives
 * there — same return shape.
 */
export async function getFcrSummary(brandName) {
  if (!brandName) return { source: "POC_ENTERED", dishes: [] };

  const dishes = await getDishIterations(brandName);
  const confirmations = await FcrConfirmation.find({ brandName }).lean();
  const confMap = new Map(
    confirmations.map((c) => [`${c.recipeName.trim().toLowerCase()}||${c.phase}||${c.code || ""}`, c])
  );

  const data = dishes.map((dish) => ({
    recipeName: dish.recipeName,
    iterations: dish.iterations.map((it) => {
      const conf = confMap.get(`${dish.recipeName.trim().toLowerCase()}||${it.phase}||${it.code || ""}`);
      return {
        ...it,
        confirmed: conf?.confirmed || false,
        confirmedBy: conf?.confirmedBy || null,
        confirmedAt: conf?.confirmedAt || null,
      };
    }),
  }));

  return { source: "POC_ENTERED", dishes: data };
}

/**
 * Centralized sub-recipe production status for a brand.
 * FUTURE: source from the Base Kitchen / Head Chef dashboard (sub-recipe
 * production runs). Not built yet → explicit empty shape, no fabricated data.
 */
export async function getProductionStatus(brandName) {
  // FUTURE: read live production runs from the Head Chef dashboard.
  return { source: "NOT_AVAILABLE_YET", producedBy: "HEAD_CHEF_DASHBOARD", runs: [] };
}

/**
 * Real warehouse / procurement / GRN / Delivery-QC stock for a brand.
 * FUTURE: source from the Stock Manager dashboard. Not built yet.
 */
export async function getWarehouseStock(brandName) {
  // FUTURE: read live warehouse stock + GRN/QC from the Stock Manager dashboard.
  return { source: "NOT_AVAILABLE_YET", producedBy: "STOCK_MANAGER_DASHBOARD", stock: [] };
}

/**
 * Local-kitchen stock + fridge audit for a brand.
 * FUTURE: source from the Local Kitchen dashboard. Not built yet.
 */
export async function getLocalKitchenStock(brandName) {
  // FUTURE: read live local-kitchen stock + fridge audit from the Local Kitchen dashboard.
  return { source: "NOT_AVAILABLE_YET", producedBy: "LOCAL_KITCHEN_DASHBOARD", stock: [] };
}
