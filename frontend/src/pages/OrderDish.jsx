import React, { useState, useEffect } from "react";
import { fetchFoodCost } from "../utils/costingapi.js";
import Layout from "../components/Layout";
import api from "../utils/api.js";

export default function OrderDish() {
  const [dish, setDish] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [wastagePercent, setWastagePercent] = useState(5);
  const [dishes, setDishes] = useState([]);

  const [showSummary, setShowSummary] = useState(false);
  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderItems, setOrderItems] = useState([
    { dish: "", qty: 1, price: 0, total: 0 }
  ]);

  useEffect(() => {
  const fetchDishes = async () => {
    try {
      const res = await api.get("/api/mainrecipes/dish-list");
      setDishes(res.data.dishes || []);
    } catch (err) {
      console.error("Failed to load dishes", err);
    }
  };

  fetchDishes();
}, []);



  const calculate = async () => {
    try {
      setLoading(true);
      const result = await fetchFoodCost(dish);
      setData(result);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };
  const toggleExpand = (index) => {
  setExpanded(prev => ({
    ...prev,
    [index]: !prev[index],
  }));
};


  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-7xl space-y-8">

          {/* HEADER */}
          <div className="bg-cover rounded-2xl p-6 shadow bg-[url(./assets/Main-bg.png)]">
            <h1 className="text-2xl font-semibold mb-6">Food Cost Calculator</h1>

            <div className="flex flex-wrap gap-6 items-end">
              <div className="flex items-center gap-12 w-8/12">
                <div>
                  <label className="text-sm text-gray-500">Dish Name</label>
                  <select
                    value={dish}
                    onChange={(e) => setDish(e.target.value)}
                    className="border rounded-lg px-4 py-2 w-80"
                  >
                    <option value="">Select a dish</option>
                    {dishes.map((d, i) => (
                      <option key={i} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={calculate}
                  disabled={!dish || loading}
                  className="bg-black text-white px-6 py-2 rounded-lg "
                >
                  {loading ? "Calculating…" : "Calculate"}
                </button>
              </div>

              <button
                onClick={async () => {
                  setShowSummary(true);
                  setSummaryLoading(true);
                  const res = await api.get(
                    `/api/costing/summary`
                  );

                  setSummaryRows(res.data.summary || []);
                  setSummaryLoading(false);
                }}
                className="border bg-black text-white px-6 py-2 rounded-lg"
              >
                Show Summary
              </button>

              <button
                onClick={() => setShowOrderModal(true)}
                className="bg-black text-white px-6 py-2 rounded-lg"
              >
                Compute Sales Projection
              </button>
            </div>
          </div>

          {/* SINGLE DISH RESULT */}
          {data && (
            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow">
                <h2 className="text-xl font-semibold mb-4">Cost Breakdown</h2>
                <table className="w-full text-sm border">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Qty</th>
                      <th className="p-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakdown.map((row, index) => {
                      const isSub = row.type === "SUBRECIPE";

                      // find nearest parent subrecipe above this row
                      let parentIndex = null;
                      if (row.level > 0) {
                        for (let j = index - 1; j >= 0; j--) {
                          if (data.breakdown[j].type === "SUBRECIPE") {
                            parentIndex = j;
                            break;
                          }
                        }
                        // hide child if parent is collapsed
                        if (parentIndex !== null && !expanded[parentIndex]) {
                          return null;
                        }
                      }

                      return (
                        <tr key={index} className="border-t">
                          {/* ITEM */}
                          <td className="p-2">
                            <div
                              className={`flex items-center gap-2 ${
                                row.level > 0 ? "pl-6 text-gray-600" : ""
                              }`}
                            >
                              {isSub && (
                                <button
                                  onClick={() => toggleExpand(index)}
                                  className="text-xs font-bold w-4"
                                >
                                  {expanded[index] ? "▼" : "▶"}
                                </button>
                              )}
                              {row.item}
                            </div>
                          </td>

                          <td className="p-2 text-center">{row.type}</td>
                          <td className="p-2 text-center">
                            {row.qty} {row.uom}
                          </td>
                          <td className="p-2 text-right">₹{row.cost}</td>
                        </tr>
                      );
                    })}
                  </tbody>


                </table>
              </div>

              <div className="bg-[#111] text-white p-6 rounded-2xl">
                <CostRow label="Food Cost" value={data.foodCost} />
                <CostRow label="Packaging Cost" value={data.packagingCost} />
                <CostRow label="Production Variance (5%)" value={data.productionVariance} />
                <div className="border-t mt-4 pt-4 flex justify-between font-bold">
                  <span>Total</span>
                  <span>₹{data.total}</span>
                </div>
              </div>
            </div>
          )}

          {/* SUMMARY TABLE */}
          {showSummary && (
            <div className="bg-white p-6 rounded-2xl shadow">
              <h2 className="text-xl font-semibold mb-4">All Dishes Summary</h2>
              {summaryLoading ? "Loading…" : (
                <table className="w-full border text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Dish</th>
                      <th className="p-2 text-right">Food</th>
                      <th className="p-2 text-right">Packaging</th>
                      <th className="p-2 text-right">Production Variance</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.dishName}</td>
                        <td className="p-2 text-right">₹{r.foodCost}</td>
                        <td className="p-2 text-right">₹{r.packagingCost}</td>
                        <td className="p-2 text-right">₹{r.productionVariance}</td>
                        <td className="p-2 text-right font-semibold">₹{r.totalCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ORDER MODAL */}
      {showOrderModal && (
        <OrderModal
          dishes={dishes}
          orderItems={orderItems}
          setOrderItems={setOrderItems}
          onClose={() => setShowOrderModal(false)}
          api={api}
          fetchFoodCost={fetchFoodCost}
        />
      )}
    </Layout>
  );
}

/* ---------- HELPERS ---------- */
function CostRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold">₹{value}</span>
    </div>
  );
}

/* ---------- ORDER RECIPE BREAKDOWN (read-only, for calculator page) ---------- */
export function OrderRecipeBreakdown({ data, loading, multiplier = 1 }) {
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (index) => {
    setExpanded((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t">
        <p className="text-sm text-gray-500">Loading recipe...</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mt-3 pt-3 border-t">
        <p className="text-sm text-gray-500">
          Recipe not found or failed to load
        </p>
      </div>
    );
  }
  if (!data.breakdown || data.breakdown.length === 0) {
    return null;
  }

  const m = Number(multiplier) || 1;
  const rows = data.breakdown.map((row) => ({
    ...row,
    qty: typeof row.qty === "number" ? row.qty * m : row.qty,
    cost: typeof row.cost === "number" ? row.cost * m : row.cost,
  }));

  return (
    <div className="mt-3 pt-3 border-t">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        Cost Breakdown
      </h3>
      <div className="bg-white rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-center">Type</th>
              <th className="p-2 text-center">Qty</th>
              <th className="p-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isSub = row.type === "SUBRECIPE";
              let parentIndex = null;
              if (row.level > 0) {
                for (let j = index - 1; j >= 0; j--) {
                  if (rows[j].type === "SUBRECIPE") {
                    parentIndex = j;
                    break;
                  }
                }
                if (parentIndex !== null && !expanded[parentIndex]) {
                  return null;
                }
              }

              return (
                <tr key={index} className="border-t">
                  <td className="p-2">
                    <div
                      className={`flex items-center gap-2 ${
                        row.level > 0 ? "pl-6 text-gray-600" : ""
                      }`}
                    >
                      {isSub && (
                        <button
                          onClick={() => toggleExpand(index)}
                          className="text-xs font-bold w-4"
                        >
                          {expanded[index] ? "▼" : "▶"}
                        </button>
                      )}
                      {row.item}
                    </div>
                  </td>
                  <td className="p-2 text-center">{row.type}</td>
                  <td className="p-2 text-center">
                    {row.qty} {row.uom}
                  </td>
                  <td className="p-2 text-right">₹{row.cost}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-gray-600">
        <span>Food: ₹{Number(data.foodCost || 0) * m}</span>
        <span>Packaging: ₹{Number(data.packagingCost || 0) * m}</span>
        <span>Total: ₹{Number(data.total || 0) * m}</span>
      </div>
    </div>
  );
}

function ProcurementBreakdown({ rows }) {
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (index) => {
    setExpanded(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  if (!rows || !rows.length) return null;

  return (
    <div className="mt-3 pt-3 border-t">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        Procurement Plan
      </h3>
      <div className="bg-white rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-center">Required</th>
              <th className="p-2 text-center">Inventory Used</th>
              <th className="p-2 text-center">Min Pack Qty</th>
              <th className="p-2 text-center">Min Pack Cost</th>
              <th className="p-2 text-center">Procure Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isSub = row.type === "SUBRECIPE";

              let parentIndex = null;

              if (row.level > 0) {
                for (let j = index - 1; j >= 0; j--) {
                  if (rows[j].type === "SUBRECIPE") {
                    parentIndex = j;
                    break;
                  }
                }

                if (parentIndex !== null && !expanded[parentIndex]) {
                  return null;
                }
              }

              return (
                <tr key={index} className="border-t">
                  <td className="p-2">
                    <div
                      className={`flex items-center gap-2 ${
                        row.level > 0 ? "pl-6 text-gray-600" : ""
                      }`}
                    >
                      {isSub && (
                        <button
                          onClick={() => toggleExpand(index)}
                          className="text-xs font-bold w-4"
                        >
                          {expanded[index] ? "▼" : "▶"}
                        </button>
                      )}
                      {row.itemName}
                    </div>
                  </td>

                  <td className="p-2 text-center">
                    {row.requiredQty} {row.uom}
                  </td>

                  <td className="p-2 text-center">
                    {row.inventoryQty} {row.uom}
                  </td>

                  <td className="p-2 text-center">
                    {row.minPackQty ?? "—"} {row.uom}
                  </td>

                  <td className="p-2 text-center">
                    {row.minPackCost != null ? `₹${row.minPackCost}` : "—"}
                  </td>

                  <td className="p-2 text-center">
                    {row.procureQty} {row.uom}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- ORDER MODAL ---------- */
function OrderModal({ dishes, orderItems, setOrderItems, onClose, api, fetchFoodCost }) {
  const [breakdownData, setBreakdownData] = useState({});
  const [loadingBreakdown, setLoadingBreakdown] = useState({});
  const [baseInventory, setBaseInventory] = useState(null);
  const [procurementByItem, setProcurementByItem] = useState({});
  const [minPackageMap, setMinPackageMap] = useState({});
  const subtotal = orderItems.reduce((sum, i) => sum + i.total, 0);

  // Load client inventory once
  useEffect(() => {
    let clientId = null;
    try {
      const stored =
        JSON.parse(sessionStorage.getItem("skope_user")) ||
        JSON.parse(localStorage.getItem("skope_user"));
      clientId = stored?.id || null;
    } catch {
      clientId = null;
    }
    if (!clientId) return;

    const loadInventory = async () => {
      try {
        const res = await api.get(`/api/inventory/${clientId}`);
        const items = res.data?.items || [];
        const map = {};
        items.forEach((it) => {
          const key = String(it.itemName || "").trim().toLowerCase();
          if (!key) return;
          map[key] = {
            availableQty: Number(it.availableQty || 0),
            minPackQty: Number(it.minPackQty || 0),
            minPackCost: Number(it.minPackCost || 0),
            netPrice: Number(it.netPrice || 0),
            uom: it.uom || "",
          };
        });
        setBaseInventory(map);
      } catch (err) {
        console.error("Failed to load client inventory for projection", err);
      }
    };

    loadInventory();
  }, [api]);

  // Lookup min pack qty/cost for ALL ingredients (includes subrecipe children)
  useEffect(() => {
    const names = new Set();
    const normalizeKey = (raw) =>
      String(raw || "")
        .replace("SR:", "")
        .trim();
    Object.values(breakdownData).forEach((d) => {
      (d?.breakdown || []).forEach((r) => {
        if (r?.type === "INGREDIENT") {
          const nm = normalizeKey(r.item);
          if (nm) names.add(nm);
        }
      });
    });

    const items = [...names].map((itemName) => ({ itemName }));
    if (items.length === 0) return;

    const run = async () => {
      try {
        const res = await api.post("/api/minimumpackage/lookup", { items });
        const list = res.data?.items || [];
        const map = {};
        list.forEach((d) => {
          const key = String(d.itemName || "").trim().toLowerCase();
          if (!key) return;
          map[key] = {
            minPackQty: Number(d.minPackQty || 0),
            minPackCost: Number(d.minPackCost || 0),
            uom: d.uom || "",
          };
        });
        setMinPackageMap(map);
      } catch (err) {
        console.error("Failed to lookup minimumpackage", err);
        setMinPackageMap({});
      }
    };

    run();
  }, [breakdownData, api]);

  // Recompute procurement for all dishes whenever inputs change
  useEffect(() => {
  if (!baseInventory) return;

  const newProc = {};
  const newOrderItems = [...orderItems];

  const normalizeKey = (raw) =>
    String(raw || "")
      .replace("SR:", "")
      .trim()
      .toLowerCase();

  orderItems.forEach((item, idx) => {
    const data = breakdownData[idx];

    if (!item?.dish || !data?.breakdown) {
      newProc[idx] = { rows: [], totalCost: 0 };
      newOrderItems[idx].total = 0;
      newOrderItems[idx].price = 0;
      return;
    }

    const qtyMultiplier = Number(item.qty || 1);
    const dishRows = [];
    let dishTotalCost = 0;

    data.breakdown.forEach((r) => {
      // Keep subrecipes for UI
      if (r.type === "SUBRECIPE") {
        dishRows.push({
          itemName: r.item,
          type: r.type,
          level: r.level || 0,
          uom: r.uom,
          requiredQty: null,
          inventoryQty: "-",
          minPackQty: "-",
          minPackCost: "-",
          procureQty: "-",
        });
        return;
      }

      if (r.type !== "INGREDIENT") return;

      const key = normalizeKey(r.item);
      if (!key) return;

      const requiredQty = Number(r.qty || 0) * qtyMultiplier;

      const inv = baseInventory[key] || {};
      const available = Number(inv.availableQty || 0);

      const pkg = minPackageMap[key] || {};
      const minPackQty = Number(pkg.minPackQty || 1);
      const minPackCost = Number(pkg.minPackCost || 0);

      // ✅ CORRECT LOGIC
      const stockUsed = Math.min(requiredQty, available);
      const netRequired = requiredQty - stockUsed;

      const packets =
        netRequired > 0 ? Math.ceil(netRequired / minPackQty) : 0;

      const procureQty = packets * minPackQty;

      const finalInventory =
        available - stockUsed + (procureQty - netRequired);

      // Cost
      const cost = packets * minPackCost;
      dishTotalCost += cost;

      dishRows.push({
        itemName: r.item,
        type: r.type,
        level: r.level || 0,
        uom: pkg.uom || r.uom || "",
        requiredQty,
        inventoryQty: stockUsed,
        minPackQty,
        minPackCost,
        procureQty,
      });
    });

    newProc[idx] = {
      rows: dishRows,
      totalCost: Number(dishTotalCost.toFixed(2)),
    };

    const qty = Number(item.qty || 1);
    const perDish = qty > 0 ? dishTotalCost / qty : dishTotalCost;

    newOrderItems[idx].price = Number(perDish.toFixed(2));
    newOrderItems[idx].total = Number(dishTotalCost.toFixed(2));
  });

  setProcurementByItem(newProc);
  setOrderItems(newOrderItems);
}, [orderItems, breakdownData, baseInventory, minPackageMap, setOrderItems]);

  const updateItem = async (index, field, value) => {
    const updated = [...orderItems];
    updated[index][field] = value;

    if (field === "dish") {
      if (value) {
        setLoadingBreakdown(prev => ({ ...prev, [index]: true }));
        try {
          const res = await fetchFoodCost(value);
          const basePrice = Number(res.total) || 0;
          updated[index].price = basePrice;
          updated[index].total = basePrice * updated[index].qty;
          setBreakdownData(prev => ({ ...prev, [index]: res }));
          // Store base breakdown (multiplier=1). Admin UI scales by item.qty later,
          // while backend inventory aggregation will multiply by line.qty.
          updated[index].breakdown = Array.isArray(res.breakdown) ? res.breakdown : [];
        } catch (err) {
          setBreakdownData(prev => ({ ...prev, [index]: null }));
          updated[index].price = 0;
          updated[index].total = 0;
          updated[index].breakdown = [];
        } finally {
          setLoadingBreakdown(prev => ({ ...prev, [index]: false }));
        }
      } else {
        setBreakdownData(prev => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        updated[index].price = 0;
        updated[index].total = 0;
        updated[index].breakdown = [];
      }
    }

    if (field === "qty") {
      updated[index].total =
        (Number(updated[index].price) || 0) * (Number(value) || 0);
    }

    setOrderItems(updated);
  };

  const addRow = () => {
    setOrderItems([
      ...orderItems,
      { dish: "", qty: 1, price: 0, total: 0, breakdown: [] },
    ]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl w-[90vw] max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-semibold">Create Order</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-black text-2xl">✕</button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            {orderItems.map((item, i) => {
              const data = breakdownData[i];
              const isLoading = loadingBreakdown[i];
              
              return (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-4 gap-4 items-center">
                    <select
                      value={item.dish}
                      onChange={(e) => updateItem(i, "dish", e.target.value)}
                      className="border p-2 rounded"
                    >
                      <option value="">Select dish</option>
                      {dishes.map((d, idx) => (
                        <option key={idx} value={d}>{d}</option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                      className="border p-2 rounded"
                      placeholder="Qty"
                    />

                    <div className="text-right">₹{Number(item.price).toFixed(2)}</div>
                    <div className="text-right font-semibold">₹{Number(item.total).toFixed(2)}</div>
                  </div>

                  {/* PROCUREMENT BREAKDOWN */}
                  {item.dish && procurementByItem[i] && (
                    <ProcurementBreakdown rows={procurementByItem[i].rows} />
                  )}
                </div>
              );
            })}

            <button 
              onClick={addRow} 
              className="text-blue-600 text-sm font-medium hover:underline"
            >
              + Add another dish
            </button>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl">
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>₹{subtotal}</span>
            </div>
            <button
                onClick={async () => {
                    try {
                    const res = await api.post("/api/wallet/pay", {
                        amount: subtotal,
                        items: orderItems.map((i, index) => ({
                          dish: i.dish,
                          qty: Number(i.qty),
                          price: Number(i.price),
                          total: Number(i.total),
                          breakdown: i.breakdown || [],
                          procurement: (procurementByItem[index]?.rows || []).map(r => ({
                            ...r,
                            itemName: String(r.itemName || "")
                              .replace("SR:", "")
                              .trim()
                              .toLowerCase(),
                            type: r.type === "INGREDIENT" ? "INGREDIENT" : r.type
                          }))
                        }))
                    });

                    alert(
                        `Payment successful!\nRemaining Wallet Balance: ₹${res.data.remainingBalance}`
                    );

                    onClose(); // close modal
                    } catch (err) {
                    alert(
                        err.response?.data?.message ||
                        "Wallet payment failed"
                    );
                    }
                }}
                className="w-full bg-black text-white py-2 rounded-lg mt-4"
                >
                Proceed to Payment
                </button>

          </div>
        </div>
      </div>
    </div>
  );
}
