import { useEffect, useState } from "react";
import api from "../utils/api";
import { OrderRecipeBreakdown } from "./OrderDish";
import { fetchFoodCost } from "../utils/costingapi";
import { useNavigate } from "react-router-dom";

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

  const isWalletManager = adminRole === "WALLET_MANAGER";
  const isRecipeAdmin = adminRole === "RECIPE_MANAGER";
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
      alert("Failed to update order");
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
      alert(err.response?.data?.message || "Failed to delete order");
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
                  await api.post("/api/wallet/admin/wallet/due", {
                    userId: brand._id,
                    amount: dueAmount,
                    reason: dueReason
                  });

                  alert("Due added successfully");
                  setDueAmount("");
                  setDueReason("");
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
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <span className="font-semibold">
                          ₹{order.amount}
                        </span>
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
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

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
                          onClick={() =>
                            updateOrderStatus(
                              order._id,
                              "PREPARING"
                            )
                          }
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Mark Preparing
                        </button>
                      )}

                      {order.status === "PREPARING" && (
                        <button
                          onClick={() =>
                            updateOrderStatus(
                              order._id,
                              "COMPLETED"
                            )
                          }
                          className="text-sm text-green-600 hover:underline"
                        >
                          Mark Completed
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
