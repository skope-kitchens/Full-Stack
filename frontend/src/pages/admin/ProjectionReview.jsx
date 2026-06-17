import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/api";
import toast from "../../utils/toast";
import Layout from "../../components/Layout";

/* ─── tiny helpers ────────────────────────────────────────────────────────── */

const fmt = (n, d = 2) => Number(n || 0).toFixed(d);

const formatSubmittedAt = (value) => {
  if (!value) return "";
  const d = new Date(value);
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
};

const SufficiencyBadge = ({ sufficient }) =>
  sufficient ? (
    <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
      ✓ Sufficient
    </span>
  ) : (
    <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
      ⚠ Low stock
    </span>
  );

/**
 * Recalculate one requirement group client-side when the chef
 * adjusts the target quantity. Uses qtyPerPortion / batchYield /
 * requiredQtyPerBatch kept in the API response so we don't need
 * a second round-trip.
 */
function recalculate(req, adjustedQty) {
  const q = Math.max(0, Number(adjustedQty) || 0);

  const subRecipes = req.subRecipes.map((sr) => {
    const grossQty = sr.qtyPerPortion * q;
    const netQty = Math.max(0, grossQty - sr.fridgeQty);
    const batchesNeeded = netQty > 0 ? Math.ceil(netQty / sr.batchYield) : 0;

    const warehouseIngredients = sr.warehouseIngredients.map((wi) => {
      const requiredQty = wi.requiredQtyPerBatch * batchesNeeded;
      const afterBranchKitchen = Math.max(
        0,
        requiredQty - (wi.semiFinishedQty || 0) - (wi.branchKitchenQty || 0)
      );
      const warehouseTransferQty = Math.min(wi.brandStockWarehouseQty || 0, afterBranchKitchen);
      const shortfall = Math.max(0, afterBranchKitchen - warehouseTransferQty);
      return {
        ...wi,
        requiredQty: Number(requiredQty.toFixed(4)),
        warehouseTransferQty: Number(warehouseTransferQty.toFixed(4)),
        shortfall: Number(shortfall.toFixed(4)),
        sufficient: shortfall <= 0,
      };
    });

    return {
      ...sr,
      grossQty: Number(grossQty.toFixed(4)),
      netQty: Number(netQty.toFixed(4)),
      batchesNeeded,
      warehouseIngredients,
    };
  });

  const directIngredients = req.directIngredients.map((di) => {
    const grossQty = di.qtyPerPortion * q;
    const afterBranchKitchen = Math.max(
      0,
      grossQty - (di.semiFinishedQty || 0) - (di.branchKitchenQty || 0)
    );
    const warehouseTransferQty = Math.min(di.brandStockWarehouseQty || 0, afterBranchKitchen);
    const shortfall = Math.max(0, afterBranchKitchen - warehouseTransferQty);
    return {
      ...di,
      grossQty: Number(grossQty.toFixed(4)),
      warehouseTransferQty: Number(warehouseTransferQty.toFixed(4)),
      shortfall: Number(shortfall.toFixed(4)),
      sufficient: shortfall <= 0,
    };
  });

  return { ...req, subRecipes, directIngredients };
}

/* ─── SubRecipe card ──────────────────────────────────────────────────────── */

function SubRecipeCard({ sr }) {
  const isAllCovered = sr.netQty === 0;
  const allIngredientsSufficient = sr.warehouseIngredients.every((wi) => wi.sufficient);

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isAllCovered ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-sm">{sr.subRecipeName}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {fmt(sr.qtyPerPortion)} {sr.grossUom} per portion
          </p>
        </div>
        {isAllCovered ? (
          <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
            Fridge covers it
          </span>
        ) : (
          <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">
            {sr.batchesNeeded} batch{sr.batchesNeeded !== 1 ? "es" : ""} needed
          </span>
        )}
      </div>

      {/* Gross / Fridge / Net row */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-gray-50 rounded-lg px-2 py-2">
          <p className="text-gray-400">Gross Required</p>
          <p className="font-bold text-gray-800 mt-0.5">{fmt(sr.grossQty)} {sr.grossUom}</p>
        </div>
        <div className="bg-blue-50 rounded-lg px-2 py-2">
          <p className="text-blue-400">In Fridge</p>
          <p className="font-bold text-blue-700 mt-0.5">{fmt(sr.fridgeQty)} {sr.grossUom}</p>
        </div>
        <div className={`rounded-lg px-2 py-2 ${sr.netQty > 0 ? "bg-red-50" : "bg-green-50"}`}>
          <p className={sr.netQty > 0 ? "text-red-400" : "text-green-400"}>Net Needed</p>
          <p className={`font-bold mt-0.5 ${sr.netQty > 0 ? "text-red-700" : "text-green-700"}`}>
            {fmt(sr.netQty)} {sr.grossUom}
          </p>
        </div>
      </div>

      {/* Chef instruction */}
      {sr.netQty > 0 && (
        <p className="text-xs text-gray-600 italic bg-amber-50 border border-amber-100 rounded px-3 py-1.5">
          {fmt(sr.fridgeQty)} {sr.grossUom} in fridge.
          Prepare <strong>{fmt(sr.netQty)} {sr.grossUom}</strong> fresh
          ({sr.batchesNeeded} batch{sr.batchesNeeded !== 1 ? "es" : ""} × {sr.batchYield} {sr.grossUom}/batch).
        </p>
      )}

      {/* Warehouse ingredients for this sub-recipe */}
      {sr.batchesNeeded > 0 && sr.warehouseIngredients.length > 0 && (
        <div className="mt-1">
          <p className="text-xs font-semibold text-gray-500 mb-1.5">
            Warehouse ingredients for {sr.batchesNeeded} batch{sr.batchesNeeded !== 1 ? "es" : ""}:
          </p>
          <div className="space-y-1">
            {sr.warehouseIngredients.map((wi, i) => (
              <div key={i} className="flex flex-col gap-1 text-xs border rounded-lg px-3 py-1.5 bg-white">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">{wi.itemName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">
                      Need {fmt(wi.requiredQty)} {wi.requiredUom}
                    </span>
                    <SufficiencyBadge sufficient={wi.sufficient} />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-gray-500">
                  <span>Fridge: {fmt(wi.semiFinishedQty)} {wi.warehouseUom}</span>
                  <span className="text-gray-300">|</span>
                  <span>Branch Kitchen: {fmt(wi.branchKitchenQty)} {wi.warehouseUom}</span>
                  <span className="text-gray-300">|</span>
                  <span>Warehouse: {fmt(wi.warehouseQty)} {wi.warehouseUom}</span>
                  <span className="text-gray-300">|</span>
                  <span className={wi.sufficient ? "text-green-600" : "text-red-600 font-medium"}>
                    Shortfall: {fmt(wi.shortfall)} {wi.warehouseUom}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {!allIngredientsSufficient && (
            <p className="text-xs text-red-600 mt-1.5 font-medium">
              ⚠ Some warehouse ingredients are insufficient — indent will be raised automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Direct ingredient row ───────────────────────────────────────────────── */

function DirectIngredientRow({ di }) {
  return (
    <div className="border rounded-lg px-4 py-2.5 text-sm bg-white space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-gray-800">{di.itemName}</span>
          <span className="text-gray-400 ml-2 text-xs">{di.grossUom}</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <p className="text-gray-400">Required</p>
            <p className="font-bold text-gray-700">{fmt(di.grossQty)} {di.grossUom}</p>
          </div>
          <SufficiencyBadge sufficient={di.sufficient} />
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Fridge: {fmt(di.semiFinishedQty)} {di.warehouseUom}</span>
        <span className="text-gray-300">|</span>
        <span>Branch Kitchen: {fmt(di.branchKitchenQty)} {di.warehouseUom}</span>
        <span className="text-gray-300">|</span>
        <span>Warehouse: {fmt(di.warehouseQty)} {di.warehouseUom}</span>
        <span className="text-gray-300">|</span>
        <span className={di.sufficient ? "text-green-600" : "text-red-600 font-medium"}>
          Shortfall: {fmt(di.shortfall)} {di.warehouseUom}
        </span>
      </div>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */

const PO_STATUS_LABELS = {
  PENDING_INDENT_APPROVAL: { label: "Pending approval", cls: "bg-gray-100 text-gray-700" },
  AWAITING_BRAND_PAYMENT: { label: "Awaiting payment", cls: "bg-amber-100 text-amber-700" },
  AWAITING_WAREHOUSE_TRANSFER: { label: "Awaiting warehouse transfer", cls: "bg-purple-100 text-purple-700" },
  READY_FOR_DISPATCH: { label: "Awaiting dispatch", cls: "bg-blue-100 text-blue-700" },
  READY_TO_COOK: { label: "Ready to cook", cls: "bg-green-100 text-green-700" },
  IN_PREPARATION: { label: "In preparation", cls: "bg-green-100 text-green-700" },
  COMPLETED: { label: "Completed", cls: "bg-gray-100 text-gray-500" },
};

function MyActiveOrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get("/api/production-orders/my-active");
        if (!cancelled) setOrders(res.data?.data || []);
      } catch {
        // silent - this is a supplementary widget
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading || orders.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3"
      >
        <p className="text-sm font-semibold text-gray-700">
          Your kitchen's active production orders ({orders.length})
        </p>
        <span className="text-xs text-gray-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t divide-y">
          {orders.map((o) => {
            const cfg = PO_STATUS_LABELS[o.status] || { label: o.status, cls: "bg-gray-100 text-gray-700" };
            return (
              <div key={o._id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{o.brandName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatSubmittedAt(o.createdAt)}
                    {o.scaledTargetQty ? ` - Target qty: ${fmt(o.scaledTargetQty)}` : ""}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${cfg.cls}`}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProjectionReview() {
  const { brandId } = useParams();
  const navigate = useNavigate();

  const [projections, setProjections] = useState([]);  // pending list for this brand
  const [selectedId, setSelectedId] = useState(null);   // which projection is open
  const [rawRequirements, setRawRequirements] = useState(null); // from API (immutable base)
  const [requirements, setRequirements] = useState([]);          // live-recalculated
  const [projection, setProjection] = useState(null);
  const [adjustedQtys, setAdjustedQtys] = useState({});          // recipeName → qty override
  const [loadingList, setLoadingList] = useState(true);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [productionOrderId, setProductionOrderId] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);
  const [fullyCovered, setFullyCovered] = useState(false);
  const [completing, setCompleting] = useState(false);

  /* Load pending projections for this brand */
  useEffect(() => {
    const load = async () => {
      setLoadingList(true);
      try {
        const res = await api.get(`/api/projections/pending?brandId=${brandId}`);
        const list = res.data?.data || [];
        setProjections(list);
        if (list.length === 1) setSelectedId(list[0]._id);
      } catch {
        toast.error("Failed to load projections");
      } finally {
        setLoadingList(false);
      }
    };
    load();
  }, [brandId]);

  /* When a projection is selected, fetch its net requirements */
  useEffect(() => {
    if (!selectedId) return;
    const calc = async () => {
      setLoadingCalc(true);
      setRawRequirements(null);
      setRequirements([]);
      setProjection(null);
      setAdjustedQtys({});
      setProductionOrderId(null);
      setOrderStatus(null);
      setFullyCovered(false);
      try {
        const res = await api.get(`/api/projections/${selectedId}/net-requirements`);
        const { projection: proj, requirements: reqs } = res.data?.data || {};
        setProjection(proj);
        setRawRequirements(reqs);
        // Initialise adjustedQtys from the projection's own targetQty per item
        const initial = {};
        (proj?.items || []).forEach((item) => {
          initial[item.recipeName] = item.targetQty;
        });
        setAdjustedQtys(initial);
        setRequirements(reqs);
      } catch {
        toast.error("Failed to calculate net requirements");
      } finally {
        setLoadingCalc(false);
      }
    };
    calc();
  }, [selectedId]);

  /* Live recalculation when chef adjusts a target qty */
  const handleQtyChange = useCallback((recipeName, newQty) => {
    setAdjustedQtys((prev) => ({ ...prev, [recipeName]: newQty }));
    if (!rawRequirements) return;
    setRequirements(
      rawRequirements.map((req) =>
        req.projectionItem.recipeName === recipeName
          ? recalculate(req, newQty)
          : req
      )
    );
  }, [rawRequirements]);

  /* Poll production order status every 5 s until it reaches a cook-ready state or COMPLETED */
  useEffect(() => {
    if (!productionOrderId) return;
    if (["READY_TO_COOK", "IN_PREPARATION", "COMPLETED"].includes(orderStatus)) return;

    const poll = setInterval(async () => {
      try {
        const res = await api.get(`/api/production-orders/${productionOrderId}/status`);
        const status = res.data?.status;
        if (status && status !== orderStatus) setOrderStatus(status);
      } catch {
        // silent — network hiccups don't kill the poller
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [productionOrderId, orderStatus]);

  /* Complete the batch — called when chef clicks Mark Preparation */
  const handleComplete = async () => {
    if (!productionOrderId) return;
    setCompleting(true);
    try {
      const res = await api.patch(`/api/production-orders/${productionOrderId}/complete`);
      const fridgeUpdated = res.data?.fridgeUpdated || [];
      const fridgeSkipped = res.data?.fridgeSkipped || [];
      const ingredientsDeducted = res.data?.ingredientsDeducted || [];
      const ingredientsSkipped = res.data?.ingredientsSkipped || [];

      if (fridgeUpdated.length > 0) {
        const summary = fridgeUpdated.map((f) => `${f.qty} ${f.uom} ${f.subRecipeName}`).join(", ");
        toast.success(`Production batch completed — fridge updated: ${summary}`);
      } else {
        toast.success("Production batch completed — no semi-finished items needed to be added to the fridge.");
      }

      for (const skip of fridgeSkipped) {
        if (skip.reason !== "No additional batches were required") {
          toast.error(`Fridge NOT updated for "${skip.subRecipeName}": ${skip.reason}`);
        }
      }

      if (ingredientsDeducted.length > 0) {
        const summary = ingredientsDeducted.map((i) => `${i.qty} ${i.uom} ${i.itemName}`).join(", ");
        toast.success(`Branch Kitchen stock used: ${summary}`);
      }

      for (const skip of ingredientsSkipped) {
        toast.error(`Branch Kitchen: "${skip.itemName}" — ${skip.reason}`);
      }

      navigate("/admin-dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to mark preparation complete");
    } finally {
      setCompleting(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedId || !projection) return;
    setConfirming(true);
    try {
      // Build payload from current live-calculated requirements state
      let scaledTargetQty = 0;
      const subRecipesToPrepare = [];
      const warehouseIngredientsToDispatch = [];
      const warehouseTransferRequests = [];

      for (const req of requirements) {
        const adj = Number(adjustedQtys[req.projectionItem.recipeName] ?? req.projectionItem.targetQty);
        scaledTargetQty += adj;

        for (const sr of req.subRecipes) {
          if (sr.batchesNeeded > 0) {
            subRecipesToPrepare.push({
              subRecipeName: sr.subRecipeName,
              batchesToPrepare: sr.batchesNeeded,
              netQtyNeeded: sr.netQty,
              uom: sr.grossUom,
            });
            for (const wi of sr.warehouseIngredients) {
              if (wi.shortfall > 0) {
                warehouseIngredientsToDispatch.push({
                  itemName: wi.itemName,
                  requiredQty: wi.shortfall,
                  uom: wi.requiredUom,
                });
              }
              if (wi.warehouseTransferQty > 0) {
                warehouseTransferRequests.push({
                  itemName: wi.itemName,
                  qty: wi.warehouseTransferQty,
                  uom: wi.requiredUom,
                  ingredientBrand: wi.ingredientBrand || "",
                });
              }
            }
          }
        }

        // Direct raw ingredients on the main BOM — only dispatch/indent the shortfall.
        // If Branch Kitchen + Fridge + Warehouse already cover the requirement, no indent is raised.
        for (const di of req.directIngredients) {
          if (di.shortfall > 0) {
            warehouseIngredientsToDispatch.push({
              itemName: di.itemName,
              requiredQty: di.shortfall,
              uom: di.grossUom,
            });
          }
          if (di.warehouseTransferQty > 0) {
            warehouseTransferRequests.push({
              itemName: di.itemName,
              qty: di.warehouseTransferQty,
              uom: di.grossUom,
              ingredientBrand: di.ingredientBrand || "",
            });
          }
        }
      }

      const res = await api.post(`/api/projections/${selectedId}/convert`, {
        scaledTargetQty,
        subRecipesToPrepare,
        warehouseIngredientsToDispatch,
        warehouseTransferRequests,
      });

      const transfersRaised = res.data?.warehouseTransfersRaised || 0;

      if (res.data?.fullyCovered) {
        setFullyCovered(true);
        toast.success(
          transfersRaised > 0
            ? `Fully covered — ${transfersRaised} warehouse transfer indent(s) raised to top up Branch Kitchen`
            : "Fully covered by existing stock — no production or procurement needed"
        );
        return;
      }

      // Capture the created ProductionOrder ID and its actual initial status
      const po = res.data?.data?.productionOrder;
      if (po?._id) {
        setProductionOrderId(po._id);
        setOrderStatus(po.status || "AWAITING_BRAND_PAYMENT");
      }

      if (res.data?.skipPayment) {
        toast.success(
          transfersRaised > 0
            ? `No client payment needed — ${transfersRaised} warehouse transfer indent(s) raised. Kitchen can start preparing.`
            : "No client payment needed — kitchen can start preparing immediately."
        );
      } else {
        toast.success("Indent confirmed — production invoice sent to brand for payment");
        if (transfersRaised > 0) {
          toast.success(`${transfersRaised} warehouse transfer indent(s) raised to top up Branch Kitchen`);
        }
      }
      // Stay on page — polling will unlock Mark Preparation once ingredients are dispatched
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit indent request");
    } finally {
      setConfirming(false);
    }
  };

  /* ── Loading / empty states ── */
  if (loadingList) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <p className="text-gray-500">Loading projections…</p>
        </div>
      </Layout>
    );
  }

  if (projections.length === 0) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-8">
          <div className="mx-auto max-w-2xl space-y-6">
            <MyActiveOrdersPanel />
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <p className="text-xl font-semibold text-gray-700">No pending projections</p>
              <p className="text-sm text-gray-400">This brand has no projections awaiting chef review.</p>
              <button
                onClick={() => navigate("/admin-dashboard")}
                className="mt-2 border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  /* ── Projection picker (if multiple) ── */
  const projectionPicker = projections.length > 1 && !selectedId ? (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-xl space-y-4">
          <h1 className="text-2xl font-semibold">Select Projection</h1>
          <p className="text-sm text-gray-500">{projections.length} pending projections for this brand.</p>
          {projections.map((p) => (
            <button
              key={p._id}
              onClick={() => setSelectedId(p._id)}
              className="w-full text-left border rounded-xl p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-sm">{p.type} Projection</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    For: {new Date(p.forDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  {p.submittedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Submitted: {formatSubmittedAt(p.submittedAt)}
                    </p>
                  )}
                </div>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">Pending Review</span>
              </div>
              <ul className="mt-2 text-xs text-gray-500 space-y-0.5">
                {p.items.map((it, i) => <li key={i}>{it.recipeName} — {it.targetQty} {it.uom}</li>)}
              </ul>
            </button>
          ))}
        </div>
      </div>
    </Layout>
  ) : null;

  if (projectionPicker) return projectionPicker;

  /* ── Main review layout ── */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate("/admin-dashboard")}
                  className="text-sm text-gray-500 hover:text-black border border-gray-300 px-3 py-1.5 rounded-lg"
                >
                  ← Dashboard
                </button>
                {projections.length > 1 && (
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-sm text-gray-500 hover:text-black border border-gray-300 px-3 py-1.5 rounded-lg"
                  >
                    ← Projections
                  </button>
                )}
              </div>
              <h1 className="text-2xl font-semibold mt-3">Production Projection Review</h1>
              {projection && (
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    projection.type === "WEEKLY" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {projection.type}
                  </span>
                  <span className="text-sm text-gray-500">
                    For {new Date(projection.forDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                  <span className="text-sm font-medium text-gray-700">— {projection.brandName}</span>
                </div>
              )}
              {projection?.submittedAt && (
                <p className="text-xs text-gray-400 mt-1">
                  Submitted: {formatSubmittedAt(projection.submittedAt)}
                </p>
              )}
            </div>
          </div>

          <MyActiveOrdersPanel />

          {/* Loading calculator */}
          {loadingCalc && (
            <div className="bg-white rounded-2xl border p-8 text-center">
              <p className="text-gray-500 text-sm animate-pulse">Running Net Production Engine…</p>
            </div>
          )}

          {/* Requirements accordion */}
          {!loadingCalc && requirements.map((req, ri) => {
            const adj = adjustedQtys[req.projectionItem.recipeName] ?? req.projectionItem.targetQty;
            const hasError = !!req.error;

            return (
              <div key={ri} className="bg-white rounded-2xl border shadow-sm overflow-hidden">

                {/* Recipe header + interactive qty input */}
                <div className="px-5 py-4 border-b flex items-center justify-between gap-4 bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{req.projectionItem.recipeName}</p>
                    {req.sopLink && (
                      <a
                        href={req.sopLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-0.5 inline-block"
                      >
                        View SOP →
                      </a>
                    )}
                  </div>

                  {/* Interactive target qty */}
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs text-gray-500">Target Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={adj}
                      onChange={(e) => handleQtyChange(req.projectionItem.recipeName, e.target.value)}
                      className="w-24 border rounded-lg px-2 py-1.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-black"
                    />
                    <span className="text-xs text-gray-400">{req.projectionItem.uom}</span>
                    {String(adj) !== String(req.projectionItem.targetQty) && (
                      <button
                        type="button"
                        onClick={() => handleQtyChange(req.projectionItem.recipeName, req.projectionItem.targetQty)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                        title="Reset to client's original qty"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {hasError ? (
                  <div className="px-5 py-4 text-sm text-red-600 bg-red-50">{req.error}</div>
                ) : (
                  <div className="p-5 grid md:grid-cols-2 gap-5">

                    {/* LEFT — Sub-recipes (fridge vs need) */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Semi-Finished / Sub-Recipes
                      </h3>
                      {req.subRecipes.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No sub-recipes in this BOM.</p>
                      ) : (
                        req.subRecipes.map((sr, i) => <SubRecipeCard key={i} sr={sr} />)
                      )}
                    </div>

                    {/* RIGHT — Direct warehouse ingredients */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Direct Raw Ingredients (Warehouse)
                      </h3>
                      {req.directIngredients.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No direct ingredients.</p>
                      ) : (
                        req.directIngredients.map((di, i) => <DirectIngredientRow key={i} di={di} />)
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Fully covered — nothing to produce or procure */}
          {fullyCovered && (
            <div className="rounded-xl border p-4 bg-green-50 border-green-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-green-800">Fully covered by existing stock</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    No production or procurement needed — ready to fulfill directly from the fridge and branch kitchen.
                  </p>
                </div>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
              </div>
            </div>
          )}

          {/* Production order status tracker — visible after indent is submitted */}
          {!fullyCovered && productionOrderId && (() => {
            const statusConfig = {
              AWAITING_BRAND_PAYMENT: {
                bg: "bg-amber-50 border-amber-300",
                textColor: "text-amber-800",
                dotColor: "bg-amber-500",
                headline: "Invoice sent — awaiting brand payment",
                sub: "The brand client will see a payment prompt on their dashboard.",
              },
              READY_FOR_DISPATCH: {
                bg: "bg-blue-50 border-blue-200",
                textColor: "text-blue-800",
                dotColor: "bg-blue-500",
                headline: "Payment confirmed — warehouse is preparing the cargo crate",
                sub: "Ingredient Manager will dispatch the crate to the kitchen shortly.",
              },
              AWAITING_WAREHOUSE_TRANSFER: {
                bg: "bg-purple-50 border-purple-200",
                textColor: "text-purple-800",
                dotColor: "bg-purple-500",
                headline: "Waiting for warehouse stock transfer",
                sub: "Ingredient Manager needs to move stock from the central warehouse to Branch Kitchen before cooking can start.",
              },
              READY_TO_COOK: {
                bg: "bg-green-50 border-green-300",
                textColor: "text-green-800",
                dotColor: null,
                headline: "Warehouse transfer complete — kitchen is ready to prepare",
                sub: "Click Mark Preparation below once the batch is cooked.",
              },
              IN_PREPARATION: {
                bg: "bg-green-50 border-green-300",
                textColor: "text-green-800",
                dotColor: null,
                headline: "Ingredients dispatched — kitchen is ready to prepare",
                sub: "Click Mark Preparation below once the batch is cooked.",
              },
            };
            const cfg = statusConfig[orderStatus] || {
              bg: "bg-gray-50 border-gray-200",
              textColor: "text-gray-700",
              dotColor: "bg-gray-400",
              headline: "Tracking production order…",
              sub: `Current status: ${orderStatus?.replace(/_/g, " ")}`,
            };
            return (
              <div className={`rounded-xl border p-4 ${cfg.bg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-semibold text-sm ${cfg.textColor}`}>{cfg.headline}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {cfg.sub}
                      {!["READY_TO_COOK", "IN_PREPARATION"].includes(orderStatus) && " · Polling every 5 s…"}
                    </p>
                  </div>
                  {cfg.dotColor && (
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.dotColor} animate-pulse shrink-0`} />
                  )}
                </div>
              </div>
            );
          })()}

          {/* Bottom action row */}
          {!loadingCalc && requirements.length > 0 && fullyCovered && (
            <div className="bg-white rounded-2xl border shadow-sm px-5 py-4">
              <p className="text-sm text-gray-500">
                This projection is fully covered by fridge and branch kitchen stock — it has been marked complete. No invoice, payment, or dispatch is required.
              </p>
            </div>
          )}

          {!loadingCalc && requirements.length > 0 && !fullyCovered && (
            <div className="bg-white rounded-2xl border shadow-sm px-5 py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-gray-500">
                {!productionOrderId && "Review the requirements above, then confirm to send the production invoice."}
                {productionOrderId && orderStatus === "AWAITING_BRAND_PAYMENT" && "Invoice sent. Mark Preparation unlocks once the brand pays and cargo is dispatched."}
                {productionOrderId && orderStatus === "READY_FOR_DISPATCH" && "Brand paid. Warehouse is dispatching the cargo crate — Mark Preparation unlocks shortly."}
                {productionOrderId && orderStatus === "AWAITING_WAREHOUSE_TRANSFER" && "Waiting for the Ingredient Admin to transfer stock from the warehouse to Branch Kitchen."}
                {productionOrderId && (orderStatus === "READY_TO_COOK" || orderStatus === "IN_PREPARATION") && "Cargo arrived. Click Mark Preparation when the batch is cooked."}
              </p>
              <div className="flex items-center gap-3 shrink-0">

                {/* Mark Preparation — locked until READY_TO_COOK or IN_PREPARATION */}
                <div className="relative group">
                  <button
                    type="button"
                    disabled={!["READY_TO_COOK", "IN_PREPARATION"].includes(orderStatus) || completing}
                    onClick={["READY_TO_COOK", "IN_PREPARATION"].includes(orderStatus) ? handleComplete : undefined}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      ["READY_TO_COOK", "IN_PREPARATION"].includes(orderStatus)
                        ? "bg-black text-white hover:bg-gray-800"
                        : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                    }`}
                  >
                    {completing ? "Completing…" : "Mark Preparation"}
                  </button>
                  {!["READY_TO_COOK", "IN_PREPARATION"].includes(orderStatus) && (
                    <div className="absolute bottom-full right-0 mb-2 w-72 hidden group-hover:block z-10">
                      <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg text-center leading-relaxed">
                        {!productionOrderId && "Confirm the indent first to raise a production invoice"}
                        {productionOrderId && orderStatus === "AWAITING_BRAND_PAYMENT" && "Waiting for brand to pay the invoice"}
                        {productionOrderId && orderStatus === "READY_FOR_DISPATCH" && "Brand paid — waiting for warehouse to dispatch cargo"}
                        {productionOrderId && orderStatus === "AWAITING_WAREHOUSE_TRANSFER" && "Waiting for Ingredient Admin to transfer warehouse stock to Branch Kitchen"}
                        {productionOrderId && !["AWAITING_BRAND_PAYMENT", "READY_FOR_DISPATCH", "AWAITING_WAREHOUSE_TRANSFER", "READY_TO_COOK", "IN_PREPARATION"].includes(orderStatus) && `Status: ${orderStatus?.replace(/_/g, " ")}`}
                        <div className="absolute top-full right-4 border-4 border-transparent border-t-gray-800" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm & Request Indent — hidden once indent is already raised */}
                {!productionOrderId && (
                  <button
                    type="button"
                    disabled={confirming}
                    onClick={handleConfirm}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                  >
                    {confirming ? "Submitting…" : "Confirm & Request Indent"}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
