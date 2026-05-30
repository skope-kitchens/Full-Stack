import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/api";
import toast from "../../utils/toast";
import Layout from "../../components/Layout";

/* ─── tiny helpers ────────────────────────────────────────────────────────── */

const fmt = (n, d = 2) => Number(n || 0).toFixed(d);

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
      return { ...wi, requiredQty: Number(requiredQty.toFixed(4)), sufficient: wi.warehouseQty >= requiredQty };
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
    return { ...di, grossQty: Number(grossQty.toFixed(4)), sufficient: di.warehouseQty >= grossQty };
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
              <div key={i} className="flex items-center justify-between text-xs border rounded-lg px-3 py-1.5 bg-white">
                <span className="font-medium text-gray-700">{wi.itemName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">
                    Need {fmt(wi.requiredQty)} {wi.requiredUom}
                  </span>
                  <span className="text-gray-400">|</span>
                  <span className={wi.sufficient ? "text-green-600" : "text-red-600"}>
                    Have {fmt(wi.warehouseQty)} {wi.warehouseUom}
                  </span>
                  <SufficiencyBadge sufficient={wi.sufficient} />
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
    <div className="flex items-center justify-between border rounded-lg px-4 py-2.5 text-sm bg-white">
      <div>
        <span className="font-medium text-gray-800">{di.itemName}</span>
        <span className="text-gray-400 ml-2 text-xs">{di.grossUom}</span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div className="text-right">
          <p className="text-gray-400">Required</p>
          <p className="font-bold text-gray-700">{fmt(di.grossQty)} {di.grossUom}</p>
        </div>
        <div className="text-right">
          <p className="text-gray-400">Warehouse</p>
          <p className={`font-bold ${di.sufficient ? "text-green-600" : "text-red-600"}`}>
            {fmt(di.warehouseQty)} {di.warehouseUom}
          </p>
        </div>
        <SufficiencyBadge sufficient={di.sufficient} />
      </div>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */

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

  /* Poll production order status every 5 s until it reaches IN_PREPARATION or COMPLETED */
  useEffect(() => {
    if (!productionOrderId) return;
    if (orderStatus === "IN_PREPARATION" || orderStatus === "COMPLETED") return;

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
      await api.patch(`/api/production-orders/${productionOrderId}/complete`);
      toast.success("Production batch completed — kitchen fridge stock updated");
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
              warehouseIngredientsToDispatch.push({
                itemName: wi.itemName,
                requiredQty: wi.requiredQty,
                uom: wi.requiredUom,
              });
            }
          }
        }

        // Direct raw ingredients on the main BOM
        for (const di of req.directIngredients) {
          warehouseIngredientsToDispatch.push({
            itemName: di.itemName,
            requiredQty: di.grossQty,
            uom: di.grossUom,
          });
        }
      }

      const res = await api.post(`/api/projections/${selectedId}/convert`, {
        scaledTargetQty,
        subRecipesToPrepare,
        warehouseIngredientsToDispatch,
      });

      // Capture the created ProductionOrder ID and its actual initial status
      const po = res.data?.data?.productionOrder;
      if (po?._id) {
        setProductionOrderId(po._id);
        setOrderStatus(po.status || "AWAITING_BRAND_PAYMENT");
      }

      toast.success("Indent confirmed — production invoice sent to brand for payment");
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
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
          <p className="text-xl font-semibold text-gray-700">No pending projections</p>
          <p className="text-sm text-gray-400">This brand has no projections awaiting chef review.</p>
          <button
            onClick={() => navigate("/admin-dashboard")}
            className="mt-2 border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            ← Back to Dashboard
          </button>
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
            </div>
          </div>

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

          {/* Production order status tracker — visible after indent is submitted */}
          {productionOrderId && (() => {
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
                      {orderStatus !== "IN_PREPARATION" && " · Polling every 5 s…"}
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
          {!loadingCalc && requirements.length > 0 && (
            <div className="bg-white rounded-2xl border shadow-sm px-5 py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-gray-500">
                {!productionOrderId && "Review the requirements above, then confirm to send the production invoice."}
                {productionOrderId && orderStatus === "AWAITING_BRAND_PAYMENT" && "Invoice sent. Mark Preparation unlocks once the brand pays and cargo is dispatched."}
                {productionOrderId && orderStatus === "READY_FOR_DISPATCH" && "Brand paid. Warehouse is dispatching the cargo crate — Mark Preparation unlocks shortly."}
                {productionOrderId && orderStatus === "IN_PREPARATION" && "Cargo arrived. Click Mark Preparation when the batch is cooked."}
              </p>
              <div className="flex items-center gap-3 shrink-0">

                {/* Mark Preparation — locked until IN_PREPARATION */}
                <div className="relative group">
                  <button
                    type="button"
                    disabled={orderStatus !== "IN_PREPARATION" || completing}
                    onClick={orderStatus === "IN_PREPARATION" ? handleComplete : undefined}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      orderStatus === "IN_PREPARATION"
                        ? "bg-black text-white hover:bg-gray-800"
                        : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                    }`}
                  >
                    {completing ? "Completing…" : "Mark Preparation"}
                  </button>
                  {orderStatus !== "IN_PREPARATION" && (
                    <div className="absolute bottom-full right-0 mb-2 w-72 hidden group-hover:block z-10">
                      <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg text-center leading-relaxed">
                        {!productionOrderId && "Confirm the indent first to raise a production invoice"}
                        {productionOrderId && orderStatus === "AWAITING_BRAND_PAYMENT" && "Waiting for brand to pay the invoice"}
                        {productionOrderId && orderStatus === "READY_FOR_DISPATCH" && "Brand paid — waiting for warehouse to dispatch cargo"}
                        {productionOrderId && !["AWAITING_BRAND_PAYMENT", "READY_FOR_DISPATCH", "IN_PREPARATION"].includes(orderStatus) && `Status: ${orderStatus?.replace(/_/g, " ")}`}
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
