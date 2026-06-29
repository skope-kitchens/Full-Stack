import DeliveryQc from "../models/deliveryQc.js";
import User from "../models/user.js";

/**
 * grnVisibility — recompute when a GRN (group of delivery_qc rows) becomes
 * visible to the client.
 *
 * A GRN becomes client-visible ONLY when:
 *   (a) every linked procurement invoice (parent + supplementaries) is PAID, AND
 *   (b) the Store Manager has entered the final received qty (receivedQtyEntered).
 *
 * RACE-SAFE BY DESIGN (per build adjustment #2): two paths can trigger this at
 * the same instant — the client paying the last invoice (verify-payment) and the
 * Store Manager entering received qty (update-received). Both call the SAME
 * recompute, which checks the full condition and sets clientVisibleAt via an
 * atomic updateMany guarded on { clientVisibleAt: null }. So whichever fires
 * second is a harmless no-op — never "first wins, second errors", and the time
 * stamp is set exactly once.
 */
export async function recomputeGrnVisibilityByGroup(grnGroupId) {
  if (!grnGroupId) return false;
  try {
    const rows = await DeliveryQc.find({ grnGroupId })
      .select("linkedInvoiceIds receivedQtyEntered clientVisibleAt")
      .lean();
    if (!rows.length) return false;

    // Already visible? nothing to do.
    if (rows.every((r) => r.clientVisibleAt)) return true;

    const linked = rows[0].linkedInvoiceIds || [];
    if (!linked.length) return false;

    // Condition (b): every row's received qty must be entered.
    const receivedEntered = rows.every((r) => r.receivedQtyEntered === true);
    if (!receivedEntered) return false;

    // Condition (a): load the client owning these invoices and check all PAID.
    const client = await User.findOne({ "invoices._id": { $in: linked } })
      .select("invoices._id invoices.status")
      .lean();
    if (!client) return false;

    const statusById = new Map(
      (client.invoices || []).map((inv) => [String(inv._id), inv.status])
    );
    const allPaid = linked.every((id) => statusById.get(String(id)) === "PAID");
    if (!allPaid) return false;

    // Idempotent, ordering-independent set — only rows still null get stamped.
    await DeliveryQc.updateMany(
      { grnGroupId, clientVisibleAt: null },
      { $set: { clientVisibleAt: new Date() } }
    );
    return true;
  } catch (err) {
    console.error("[grnVisibility] recomputeByGroup error:", err?.message || err);
    return false;
  }
}

/**
 * Recompute visibility for every GRN group linked to a freshly-paid invoice.
 * Called from the client's verify-payment path.
 */
export async function recomputeGrnVisibilityForInvoice(invoiceId) {
  if (!invoiceId) return;
  try {
    const rows = await DeliveryQc.find({
      linkedInvoiceIds: invoiceId,
      clientVisibleAt: null,
    })
      .select("grnGroupId")
      .lean();
    const groups = [
      ...new Set(rows.map((r) => String(r.grnGroupId)).filter(Boolean)),
    ];
    for (const g of groups) {
      await recomputeGrnVisibilityByGroup(g);
    }
  } catch (err) {
    console.error("[grnVisibility] recomputeForInvoice error:", err?.message || err);
  }
}
