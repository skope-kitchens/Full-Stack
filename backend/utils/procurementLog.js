import ProcurementLog from "../models/procurementLog.js";

/**
 * emitProcurementLog — append exactly one immutable event to procurement_logs.
 *
 * Every write path in the Stock Manager dashboard calls this. It is best-effort
 * and NEVER throws: an analytics-log failure must not roll back or block a real
 * stock/indent/audit write. Failures are logged to the console only.
 *
 * @param {object}  evt
 * @param {string}  evt.eventType   one of the procurementLog enum values
 * @param {object=} evt.req         the Express req (used to derive actor + warehouse)
 * @param {string=} evt.brandName
 * @param {string=} evt.itemName
 * @param {string=} evt.vendorId
 * @param {number=} evt.qty
 * @param {string=} evt.uom
 * @param {string=} evt.refId
 * @param {string=} evt.refCollection
 * @param {object=} evt.metadata
 */
export async function emitProcurementLog({
  eventType,
  req,
  brandName,
  itemName,
  vendorId,
  qty,
  uom,
  refId,
  refCollection,
  metadata,
}) {
  try {
    if (!eventType) return;
    const actorId = req?.user?._id || req?.user?.adminId || null;
    await ProcurementLog.create({
      eventType,
      brandName: brandName ? String(brandName).trim() : "",
      itemName: itemName ? String(itemName).trim() : "",
      vendorId: vendorId || null,
      qty: qty == null ? null : Number(qty),
      uom: uom || "",
      refId: refId || null,
      refCollection: refCollection || "",
      actorId,
      actorRole: req?.user?.role || "",
      warehouseId: req?.user?.warehouseId || "",
      at: new Date(),
      metadata: metadata || {},
    });
  } catch (err) {
    console.error("[procurementLog] emit failed (non-blocking):", err?.message || err);
  }
}
