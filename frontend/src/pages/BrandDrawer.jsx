import { useEffect, useState } from "react";
import api from "../utils/api";
import { OrderRecipeBreakdown } from "./OrderDish";
import { fetchFoodCost } from "../utils/costingapi";
import { useNavigate } from "react-router-dom";
import toast from "../utils/toast";

import WalletPanel from "./WalletPanel";
import ServiceChecklist from "./ServiceChecklist";

const BrandDrawer = ({ brand, adminRole, onClose }) => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [menus, setMenus] = useState([]);
  const [loadingMenus, setLoadingMenus] = useState(false);
  const [dueAmount, setDueAmount] = useState("");
  const [dueReason, setDueReason] = useState("");
  const [showRecipesOrderId, setShowRecipesOrderId] = useState(null);
  const [recipeBreakdowns, setRecipeBreakdowns] = useState({});

  // Ingredient Manager — per-brand dispatch orders
  const [dispatchOrders, setDispatchOrders] = useState([]);
  const [loadingDispatch, setLoadingDispatch] = useState(false);
  const [dispatchingId, setDispatchingId] = useState(null);

  // Recipe Manager — per-brand active kitchen production orders
  const [kitchenOrders, setKitchenOrders] = useState([]);
  const [loadingKitchen, setLoadingKitchen] = useState(false);
  const [kitchenActionId, setKitchenActionId] = useState(null);

  const isWalletManager = adminRole === "WALLET_MANAGER";
  const isRecipeAdmin = adminRole === "RECIPE_MANAGER";
  const isIngredientManager = adminRole === "INGREDIENT_MANAGER";
  /* ================= FETCH ORDERS (ORDER MANAGER ONLY) ================= */
  useEffect(() => {
    if (!brand?._id || !isRecipeAdmin) return;

    const fetchOrders = async () => {
      setLoadingOrders(true);
      try {
        const res = await api.get(`/api/admin/orders/${brand._id}`);
        setOrders(res.data || []);
      } catch (err) {
        console.error("Failed to fetch orders", err);
      } finally {
        setLoadingOrders(false);
      }
    };

    const fetchMenus = async () => {
      setLoadingMenus(true);
      try {
        const res = await api.get(`/api/admin/menu-entries/${brand._id}`);
        setMenus(res.data?.data || []);
      } catch (err) {
        console.error("Failed to fetch menus", err);
        setMenus([]);
      } finally {
        setLoadingMenus(false);
      }
    };

    fetchOrders();
    fetchMenus();

    const interval = setInterval(() => {
      fetchOrders();
      fetchMenus();
    }, 5000);
    return () => clearInterval(interval);
  }, [brand, isRecipeAdmin]);

  useEffect(() => {
    // reset modal state when switching brands
    setShowRecipesOrderId(null);
    setRecipeBreakdowns({});
  }, [brand?._id]);

  /* ================= FETCH DISPATCH ORDERS (INGREDIENT MANAGER ONLY) ================= */
  useEffect(() => {
    if (!brand?._id || !isIngredientManager) return;
    let cancelled = false;

    const fetchDispatchOrders = async () => {
      setLoadingDispatch(true);
      try {
        const res = await api.get("/api/production-orders/ready-for-dispatch");
        if (!cancelled) {
          const all = res.data?.data || [];
          setDispatchOrders(all.filter((o) => o.brandId?.toString() === brand._id.toString()));
        }
      } catch (err) {
        console.error("Failed to fetch dispatch orders", err);
      } finally {
        if (!cancelled) setLoadingDispatch(false);
      }
    };

    fetchDispatchOrders();
    const interval = setInterval(fetchDispatchOrders, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [brand?._id, isIngredientManager]);

  const fetchBreakdownFor = async (key, dishName) => {
    setRecipeBreakdowns((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: { loading: true, data: null } };
    });
    try {
      const result = await fetchFoodCost(dishName, 5, brand?.brandName);
      setRecipeBreakdowns((prev) => ({
        ...prev,
        [key]: { loading: false, data: result },
      }));
    } catch (err) {
      console.error("Failed to load recipe breakdown", err);
      setRecipeBreakdowns((prev) => ({
        ...prev,
        [key]: { loading: false, data: null },
      }));
    }
  };

  useEffect(() => {
    if (!showRecipesOrderId) return;
    const order = orders.find((o) => o._id === showRecipesOrderId);
    if (!order) return;
    order.items.forEach((item, idx) => {
      const key = `${order._id}:${idx}`;
      fetchBreakdownFor(key, item.dish);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecipesOrderId]);

  /* ================= UPDATE ORDER STATUS ================= */
  const updateOrderStatus = async (orderId, status) => {
    try {
      await api.patch(`/api/admin/orders/${orderId}`, { status });

      setOrders((prev) =>
        prev.map((o) =>
          o._id === orderId ? { ...o, status } : o
        )
      );
    } catch (err) {
      toast.error("Failed to update order status");
    }
  };

  /* ================= FETCH KITCHEN ORDERS (RECIPE MANAGER ONLY) ================= */
  useEffect(() => {
    if (!brand?._id || !isRecipeAdmin) return;
    let cancelled = false;

    const fetchKitchenOrders = async () => {
      setLoadingKitchen(true);
      try {
        const res = await api.get("/api/production-orders/active");
        if (!cancelled) {
          const all = res.data?.data || [];
          setKitchenOrders(all.filter((o) => o.brandId?.toString() === brand._id.toString()));
        }
      } catch (err) {
        console.error("Failed to fetch kitchen orders", err);
      } finally {
        if (!cancelled) setLoadingKitchen(false);
      }
    };

    fetchKitchenOrders();
    const interval = setInterval(fetchKitchenOrders, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [brand?._id, isRecipeAdmin]);

  /* ================= DISPATCH CARGO (INGREDIENT MANAGER ONLY) ================= */
  const handleDispatch = async (orderId) => {
    try {
      setDispatchingId(orderId);
      await api.patch(`/api/production-orders/${orderId}/dispatch`);
      setDispatchOrders((prev) => prev.filter((o) => o._id !== orderId));
      toast.success("Cargo dispatched — production order is now IN_PREPARATION.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Dispatch failed. Please try again.");
    } finally {
      setDispatchingId(null);
    }
  };

  /* ================= KITCHEN ACTIONS (RECIPE MANAGER ONLY) ================= */
  const handleMarkStarted = async (orderId) => {
    try {
      setKitchenActionId(orderId);
      await api.patch(`/api/production-orders/${orderId}/mark-started`);
      toast.success("Preparation started — warehouse stock deducted.");
      setKitchenOrders((prev) =>
        prev.map((o) => o._id === orderId ? { ...o, status: "IN_PREPARATION" } : o)
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to mark preparation as started.");
    } finally {
      setKitchenActionId(null);
    }
  };

  const handleMarkComplete = async (orderId) => {
    try {
      setKitchenActionId(orderId);
      await api.patch(`/api/production-orders/${orderId}/complete`);
      toast.success("Batch complete — kitchen fridge stock updated.");
      setKitchenOrders((prev) => prev.filter((o) => o._id !== orderId));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to complete batch preparation.");
    } finally {
      setKitchenActionId(null);
    }
  };

  /* ================= DELETE ORDER ================= */
  const deleteOrder = async (orderId) => {
    if (!window.confirm("Delete this order? This cannot be undone.")) return;
    try {
      await api.delete(`/api/admin/orders/${orderId}`);
      setOrders((prev) => prev.filter((o) => o._id !== orderId));
      if (showRecipesOrderId === orderId) setShowRecipesOrderId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete order");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative bg-white w-full max-w-xl h-full shadow-xl overflow-y-auto p-6">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            {brand.brandName}
          </h2>

          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black"
          >
            ✕
          </button>
        </div>

        {/* ================= WALLET + DUE (WALLET MANAGER ONLY) ================= */}
        {isWalletManager && (
          <>
            <WalletPanel
              brandId={brand._id}
              balance={brand.wallet?.balance ?? 0}
            />

            <div className="mt-4 border rounded-lg p-4">
              <h4 className="font-semibold mb-2">Add Due Amount</h4>

              <input
                type="number"
                placeholder="Amount"
                className="w-full border rounded px-3 py-2 mb-2"
                value={dueAmount}
                onChange={(e) => setDueAmount(e.target.value)}
              />

              <input
                type="text"
                placeholder="Reason (optional)"
                className="w-full border rounded px-3 py-2 mb-2"
                value={dueReason}
                onChange={(e) => setDueReason(e.target.value)}
              />

              <button
                onClick={async () => {
                  try {
                    await api.post("/api/wallet/admin/wallet/due", {
                      userId: brand._id,
                      amount: dueAmount,
                      reason: dueReason
                    });
                    toast.success("Due amount added");
                    setDueAmount("");
                    setDueReason("");
                  } catch (err) {
                    toast.error(err.response?.data?.message || "Failed to add due");
                  }
                }}
                className="bg-red-600 text-white px-4 py-2 rounded"
              >
                Add Due
              </button>
            </div>
          </>
        )}

        {/* ================= SERVICES (WALLET MANAGER ONLY) ================= */}
        {isWalletManager && (
          <div className="mt-8">
            <ServiceChecklist
              brandId={brand._id}
              editable
            />
          </div>
        )}

        {/* ================= CARGO DISPATCH (INGREDIENT MANAGER ONLY) ================= */}
        {isIngredientManager && (
          <div className="mt-6">
            <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
              Warehouse Dispatch
              {dispatchOrders.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {dispatchOrders.length} ready
                </span>
              )}
            </h3>

            {loadingDispatch ? (
              <p className="text-sm text-gray-400">Loading dispatch orders...</p>
            ) : dispatchOrders.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                <p className="text-sm font-medium text-gray-500">No orders awaiting dispatch</p>
                <p className="text-xs text-gray-400 mt-1">
                  Orders appear here once the brand confirms payment.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {dispatchOrders.map((order) => (
                  <div
                    key={order._id}
                    className="border-2 border-red-200 bg-red-50 rounded-xl p-4"
                  >
                    {/* Order meta */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                          Cargo Crate Ready
                        </span>
                        <span className="text-xs text-gray-500">
                          #{order._id.toString().slice(-6).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-green-700">
                        Payment confirmed &mdash; ₹
                        {Number(order.financials?.totalIngredientCost || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    {/* Cargo crate items table */}
                    <div className="border rounded-lg overflow-hidden mb-4 bg-white">
                      <div className="bg-gray-50 border-b px-3 py-1.5">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Cargo Crate — Items to Dispatch
                        </span>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Ingredient</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-700">Qty</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">UOM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(order.warehouseIngredientsToDispatch || []).length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-3 py-3 text-center text-xs text-gray-400">
                                No ingredients listed.
                              </td>
                            </tr>
                          ) : (
                            order.warehouseIngredientsToDispatch.map((item, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                <td className="px-3 py-2 font-medium">{item.itemName}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {Number(item.requiredQty || 0).toFixed(3)}
                                </td>
                                <td className="px-3 py-2 text-gray-500 uppercase text-xs">
                                  {item.uom || "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Dispatch button */}
                    <button
                      type="button"
                      onClick={() => handleDispatch(order._id)}
                      disabled={dispatchingId === order._id}
                      className="w-full bg-black text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {dispatchingId === order._id
                        ? "Dispatching..."
                        : "Confirm & Dispatch Cargo Crate"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= PROJECTION ALERT (RECIPE MANAGER ONLY) ================= */}
        {isRecipeAdmin && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                onClose?.();
                navigate(`/admin/projection/${brand._id}`);
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-colors ${
                brand.hasPendingProjection
                  ? "border-red-400 bg-red-50 hover:bg-red-100"
                  : "border-gray-200 bg-gray-50 hover:bg-gray-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">📋</span>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${brand.hasPendingProjection ? "text-red-700" : "text-gray-700"}`}>
                    Production Projection
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {brand.hasPendingProjection
                      ? "Action required — projection pending review"
                      : "View or process projections for this brand"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {brand.hasPendingProjection && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Pending
                  </span>
                )}
                <span className="text-gray-400 text-sm">›</span>
              </div>
            </button>
          </div>
        )}

        {/* ================= ACTIVE KITCHEN LINE (RECIPE MANAGER ONLY) ================= */}
        {isRecipeAdmin && (
          <div className="mt-6">
            <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
              Active Kitchen Line
              {kitchenOrders.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  {kitchenOrders.length} active
                </span>
              )}
            </h3>

            {loadingKitchen ? (
              <p className="text-sm text-gray-400">Loading kitchen orders...</p>
            ) : kitchenOrders.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center">
                <p className="text-sm font-medium text-gray-500">No active kitchen orders</p>
                <p className="text-xs text-gray-400 mt-1">
                  Orders dispatched from the warehouse will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {kitchenOrders.map((order) => {
                  const isReady = order.status === "READY_FOR_DISPATCH";
                  const isInPrep = order.status === "IN_PREPARATION";
                  return (
                    <div
                      key={order._id}
                      className={`border-2 rounded-xl p-4 ${
                        isInPrep
                          ? "border-orange-200 bg-orange-50"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      {/* Order meta */}
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isInPrep ? "text-orange-700" : "text-amber-700"
                          }`}
                        >
                          {isInPrep ? "In Preparation" : "Cargo Arrived — Ready to Start"}
                        </span>
                        <span className="text-xs text-gray-400">
                          #{order._id.toString().slice(-6).toUpperCase()}
                        </span>
                      </div>

                      {/* Sub-recipes to prepare */}
                      {(order.subRecipesToPrepare || []).length > 0 && (
                        <div className="border rounded-lg overflow-hidden mb-3 bg-white">
                          <div className="bg-gray-50 border-b px-3 py-1.5">
                            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              Sub-Recipes to Prepare
                            </span>
                          </div>
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">Sub-Recipe</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-700">Batches</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">UOM</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.subRecipesToPrepare.map((item, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                  <td className="px-3 py-2 font-medium">{item.subRecipeName}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{item.batchesToPrepare}</td>
                                  <td className="px-3 py-2 text-gray-500 uppercase text-xs">{item.uom || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Warehouse ingredients */}
                      {(order.warehouseIngredientsToDispatch || []).length > 0 && (
                        <div className="border rounded-lg overflow-hidden mb-4 bg-white">
                          <div className="bg-gray-50 border-b px-3 py-1.5">
                            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              Warehouse Ingredients
                            </span>
                          </div>
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">Ingredient</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-700">Qty</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">UOM</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.warehouseIngredientsToDispatch.map((item, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                  <td className="px-3 py-2 font-medium">{item.itemName}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {Number(item.requiredQty || 0).toFixed(3)}
                                  </td>
                                  <td className="px-3 py-2 text-gray-500 uppercase text-xs">{item.uom || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Action button */}
                      {isReady && (
                        <button
                          type="button"
                          onClick={() => handleMarkStarted(order._id)}
                          disabled={kitchenActionId === order._id}
                          className="w-full bg-black text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition disabled:opacity-50"
                        >
                          {kitchenActionId === order._id ? "Starting..." : "Mark Preparation Started"}
                        </button>
                      )}
                      {isInPrep && (
                        <button
                          type="button"
                          onClick={() => handleMarkComplete(order._id)}
                          disabled={kitchenActionId === order._id}
                          className="w-full bg-green-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-green-700 transition disabled:opacity-50"
                        >
                          {kitchenActionId === order._id ? "Completing..." : "Mark Preparation Complete"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= ORDERS (ORDER MANAGER ONLY) ================= */}
        {(adminRole === "RECIPE_MANAGER") && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">
              Orders
            </h3>

            {loadingOrders ? (
              <p className="text-gray-500 text-sm">
                Loading orders…
              </p>
            ) : orders.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No orders placed yet
              </p>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order._id}
                    className="border rounded-lg p-4"
                  >
                    {/* ORDER HEADER */}
                    <div className="flex justify-between items-center mb-1">
                      <div>
                        <span className="font-semibold">₹{order.amount}</span>
                        {order.isReceived && (
                          <span className="ml-2 text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                            ✓ Received
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          order.status === "PLACED"
                            ? "bg-yellow-100 text-yellow-800"
                            : order.status === "PREPARING"
                            ? "bg-blue-100 text-blue-800"
                            : order.status === "CANCELLED"
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

                    {order.createdAt && (
                      <p className="text-xs text-gray-400 mb-2">
                        {new Date(order.createdAt).toLocaleString("en-IN", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    )}

                    {/* ITEMS */}
                    <ul className="text-sm text-gray-600 mb-3">
                      {order.items.map((item, idx) => (
                        <li key={idx}>
                          {item.qty} × {item.dish}
                        </li>
                      ))}
                    </ul>

                    {/* RECEIVED INFO */}
                    {order.isReceived && order.receivedAt && (
                      <p className="text-xs text-blue-600 mb-2">
                        Received: {new Date(order.receivedAt).toLocaleString()}
                      </p>
                    )}

                    {/* ACTIONS */}
                    <div className="flex flex-wrap gap-3 items-center">
                      <button
                        type="button"
                        onClick={() => setShowRecipesOrderId(order._id)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View recipes
                      </button>

                      {order.status === "PLACED" && (
                        <button
                          onClick={() => updateOrderStatus(order._id, "PREPARING")}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Mark Preparing
                        </button>
                      )}

                      {order.status === "PREPARING" && (
                        <button
                          onClick={() => updateOrderStatus(order._id, "COMPLETED")}
                          className="text-sm text-green-600 hover:underline"
                        >
                          Mark Completed
                        </button>
                      )}

                      {(order.status === "PLACED" || order.status === "PREPARING") && (
                        <button
                          onClick={() => {
                            if (window.confirm("Cancel this order? This cannot be undone.")) {
                              updateOrderStatus(order._id, "CANCELLED");
                            }
                          }}
                          className="text-sm text-red-500 hover:underline"
                        >
                          Cancel
                        </button>
                      )}

                      {order.status === "COMPLETED" && !order.isReceived && (
                        <p className="text-xs text-gray-500 italic">
                          Waiting for client to mark as received
                        </p>
                      )}

                      {order.status === "COMPLETED" && (
                        <button
                          type="button"
                          onClick={() => deleteOrder(order._id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Delete order
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  Menu
                  {menus.some((m) => m.isSeenByRecipeAdmin === false) && (
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-200" />
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    // deep-link open indent request modal
                    onClose?.();
                    navigate("/add-trial-recipe");
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Add Trial Recipe
                </button>
              </div>
              {loadingMenus ? (
                <p className="text-gray-500 text-sm">Loading menu…</p>
              ) : menus.length === 0 ? (
                <p className="text-gray-500 text-sm">No menu entries yet</p>
              ) : (
                <div className="space-y-4">
                  {menus.map((m) => (
                    <div key={m._id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-sm text-gray-600">
                          {m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}
                        </div>
                      </div>
                      <ul className="text-sm text-gray-700">
                        {(m.items || []).map((it, idx) => (
                          <li key={idx}>
                            {it.qty} {it.uom || ""} × {it.recipeName} — ₹{Number(it.cost || 0).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RECIPES MODAL (same as client Calculate / order breakdown) */}
      {isRecipeAdmin && showRecipesOrderId && (() => {
        const order = orders.find((o) => o._id === showRecipesOrderId);
        if (!order) return null;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-[90vw] max-w-4xl max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  Recipe breakdown — Order #{order._id.slice(-6).toUpperCase()}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRecipesOrderId(null)}
                  className="text-gray-500 hover:text-black text-xl"
                >
                  ✕
                </button>
              </div>
              <ul className="space-y-6">
                {order.items.map((item, idx) => {
                  const key = `${order._id}:${idx}`;
                  const state = recipeBreakdowns[key];

                  const stored = Array.isArray(item.breakdown) ? item.breakdown : [];
                  const storedData = stored.length
                    ? {
                        breakdown: stored,
                        foodCost: stored
                          .filter((b) => b.category === "Food")
                          .reduce((s, b) => s + (Number(b.cost) || 0), 0),
                        packagingCost: stored
                          .filter((b) => b.category === "Packaging")
                          .reduce((s, b) => s + (Number(b.cost) || 0), 0),
                        total: stored
                          .reduce((s, b) => s + (Number(b.cost) || 0), 0),
                      }
                    : null;

                  const data = state?.data || storedData;
                  return (
                    <li key={idx} className="border rounded-lg p-4">
                      <p className="font-medium text-gray-800 mb-2">
                        {item.qty} × {item.dish}
                      </p>
                      <OrderRecipeBreakdown
                        data={data}
                        loading={Boolean(state?.loading)}
                        multiplier={item.qty || 1}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default BrandDrawer;
