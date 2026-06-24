/**
 * producerAudit.js — shared helpers for the Head Chef (#4) and Local Kitchen (#5)
 * closing-stock audits. Mirrors the Stock Manager's proven audit logic
 * (buildAuditItems / reconcileAuditToLedger) but writes to the dedicated
 * producer_audits collection and reconciles into a SPECIFIC brand_stocks
 * location + branchCode (SEMI_FINISHED@JPNAGAR for Head Chef, BRANCH_KITCHEN@
 * <kitchen> for Local Kitchen) rather than the brand-wide ledger.
 *
 * These functions never throw on reconcile (best-effort, same as Stock Manager).
 */
import BrandStock from "../models/brandStock.js";

const VALID_REASONS = ["WASTAGE", "SPOILAGE", "MISCOUNT", "THEFT", "OTHER"];

export function normalizeAuditDate(dateStr) {
  const raw = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Validate + normalize submitted audit rows. Non-zero variance rows REQUIRE a
 * valid reason. Returns { ok, error, items }.
 */
export function buildAuditItems(rawItems) {
  const items = [];
  for (const r of Array.isArray(rawItems) ? rawItems : []) {
    const itemName = String(r?.itemName || "").trim();
    if (!itemName) continue;
    const uom = String(r?.uom || "").trim();
    const expectedQty = Number(r?.expectedQty || 0);
    const actualQty = Number(r?.actualQty || 0);
    if (!Number.isFinite(expectedQty) || !Number.isFinite(actualQty) || actualQty < 0) {
      return { ok: false, error: `Invalid quantities for "${itemName}"` };
    }
    const varianceQty = Number((actualQty - expectedQty).toFixed(4));
    let reason = r?.varianceReason ? String(r.varianceReason).trim().toUpperCase() : null;
    const reasonNote = String(r?.reasonNote || "").trim();

    if (varianceQty !== 0) {
      if (!reason || !VALID_REASONS.includes(reason)) {
        return { ok: false, error: `"${itemName}" has a variance — a valid reason is required` };
      }
    } else {
      reason = null;
    }
    items.push({ itemName, uom, expectedQty, actualQty, varianceQty, reason, reasonNote });
  }
  if (items.length === 0) return { ok: false, error: "At least one valid item is required" };
  return { ok: true, items };
}

/**
 * Reconcile a locked audit's actual counts into brand_stocks for a SPECIFIC
 * location + branchCode. Same best-effort RECONCILIATION pattern the Stock
 * Manager uses (skip if 0 or >1 matching ledger rows). Never throws.
 *
 * @param {object} args
 * @param {string} args.brandName
 * @param {string} args.branchCode  uppercase branch code of the stock rows
 * @param {string|string[]} args.location  brand_stocks location(s) to reconcile
 * @param {Array}  args.items       audit variance rows ({ itemName, actualQty, uom })
 * @param {object} args.req
 */
export async function reconcileAuditToLedger({ brandName, branchCode, location, items, req }) {
  try {
    const locFilter = Array.isArray(location) ? { $in: location } : location;
    for (const item of items) {
      const stockDocs = await BrandStock.find(
        { brandName, itemName: item.itemName, branchCode, location: locFilter },
        { _id: 1, qtyRemaining: 1, uom: 1 }
      ).lean();
      if (stockDocs.length === 0) continue;
      if (stockDocs.length > 1) {
        console.warn(
          `[producerAudit] Multiple brand_stocks for "${brandName}"/"${item.itemName}" @${branchCode} — skipping reconcile`
        );
        continue;
      }
      const stockDoc = stockDocs[0];
      const previousQty = Number(stockDoc.qtyRemaining || 0);
      const newQty = Number(item.actualQty);
      const delta = newQty - previousQty;
      if (!Number.isFinite(delta) || delta === 0) continue;

      await BrandStock.findByIdAndUpdate(stockDoc._id, {
        $inc: { qtyRemaining: delta },
        $push: {
          history: {
            type: "RECONCILIATION",
            qty: Math.abs(delta),
            uom: item.uom || stockDoc.uom || "",
            note: "Producer closing-stock audit reconcile",
            at: new Date(),
            actorRole: req?.user?.role || "",
          },
        },
      });
    }
  } catch (err) {
    console.error("[producerAudit] reconcileAuditToLedger error:", err?.message || err);
  }
}
