import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../utils/api";
import { authUtils } from "../utils/auth";
import toast from "../utils/toast";
import Footer from "../components/Footer";
import FcrIterationTimeline from "../components/FcrIterationTimeline";

/* ============================================================
 * Local Kitchen Dashboard (#5 of 6, B2C).
 * One login per kitchen (Marathahalli / Kalyan Nagar / Jayanagar / JP Nagar assembly). Every
 * view is BRANCH-SCOPED to the JWT branchCode. Receives dispatched sub-recipes,
 * does final assembly, audits its own stock, requests replenishment. No money.
 * ========================================================== */

const BRANCH_DISPLAY = {
  JPNAGAR: "JP Nagar", JPNAGAR_KITCHEN: "JP Nagar (Assembly)", MARATHAHALLI: "Marathahalli",
  KALYANNAGAR: "Kalyan Nagar", JAYANAGAR: "Jayanagar", TESTBRANCH: "Test Branch",
};
const loc = (code) =>
  BRANCH_DISPLAY[code] ||
  String(code || "").toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const today = () => new Date().toISOString().slice(0, 10);
const errMsg = (e, fallback) => e?.response?.data?.message || fallback;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");

const WORKSPACE_ITEMS = [
  { key: "dispatches", label: "Incoming Dispatches" },
  { key: "stock", label: "Local Stock" },
  { key: "orders", label: "Order Entry" },
  { key: "audit", label: "Closing Stock Audit" },
  { key: "replenish", label: "Request Replenishment" },
  { key: "recipes", label: "Recipes" },
  { key: "menu", label: "Menu & Projections" },
  { key: "fcr", label: "FCR" },
];

function Card({ title, children, right }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 mb-5">
      {(title || right) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-base font-semibold text-gray-900">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
const inputCls =
  "w-full bg-white text-gray-900 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-gray-400";
const btn = "px-4 py-2 rounded-lg text-sm font-medium bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed";
const btnGhost = "px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50";
const pill = (cls) => `inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`;
const emptyP = (txt) => <p className="text-sm text-gray-500">{txt}</p>;

/* ============================================================ MAIN */
export default function LocalKitchen() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState("home");
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [activeView, setActiveView] = useState("dispatches");
  const branchCode = authUtils.getBranchCode?.();

  useEffect(() => {
    if (authUtils.getRole() !== "LOCAL_KITCHEN") {
      navigate("/login");
      return;
    }
    setAuthorized(true);
  }, [navigate]);

  const openBrand = (b) => { setSelectedBrand(b); setActiveView("dispatches"); setMode("brand"); };
  const logout = () => {
    authUtils.clearAuth();
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    navigate("/");
  };

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      <nav className="bg-white shadow-sm w-11/12 lg:w-9/12 mx-auto mt-4 rounded-full border border-gray-100">
        <div className="flex justify-between items-center h-16 px-8">
          <Link to="/" className="flex items-center">
            <img src="/assets/Logo-Dark.png" className="w-[160px]" alt="Skope Kitchens" />
          </Link>
          <button onClick={logout} className="bg-black text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 transition">Logout</button>
        </div>
      </nav>

      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          {mode !== "home" && (
            <button onClick={() => { setMode("home"); setSelectedBrand(null); }} className={btnGhost}>← Brands</button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Local Kitchen</h1>
            <p className="text-sm text-gray-500">{branchCode ? loc(branchCode) : "Kitchen"}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-screen">
        {mode === "home" && <HomeView onOpenBrand={openBrand} />}
        {mode === "brand" && selectedBrand && (
          <div className="flex">
            <aside className={`${collapsed ? "w-16" : "w-60"} shrink-0 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] transition-all`}>
              <button onClick={() => setCollapsed((c) => !c)} className="w-full px-4 py-3 text-left text-gray-500 hover:text-gray-900">
                {collapsed ? "»" : "« Collapse"}
              </button>
              <nav className="px-2 space-y-1">
                {WORKSPACE_ITEMS.map((it) => (
                  <button key={it.key} onClick={() => setActiveView(it.key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm ${activeView === it.key ? "bg-gray-100 font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-100"}`}
                    title={it.label}>
                    {collapsed ? it.label.charAt(0) : it.label}
                  </button>
                ))}
              </nav>
            </aside>

            <main className="flex-1 p-6 max-w-6xl">
              <h2 className="text-xl font-bold mb-4">{selectedBrand}</h2>
              {activeView === "dispatches" && <DispatchesView brandName={selectedBrand} />}
              {activeView === "stock" && <StockView brandName={selectedBrand} />}
              {activeView === "orders" && <OrderEntryView brandName={selectedBrand} />}
              {activeView === "audit" && <AuditView brandName={selectedBrand} />}
              {activeView === "replenish" && <ReplenishView brandName={selectedBrand} />}
              {activeView === "recipes" && <RecipesView brandName={selectedBrand} />}
              {activeView === "menu" && <MenuProjView brandName={selectedBrand} />}
              {activeView === "fcr" && <FcrView brandName={selectedBrand} />}
            </main>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

/* ============================================================ HOME */
function HomeView({ onOpenBrand }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/local-kitchen/brands");
      setBrands(res.data?.data || []);
    } catch (e) { toast.error(errMsg(e, "Failed to load brands")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">Brands at this kitchen</h2>
        <button onClick={load} className={btnGhost}>Refresh</button>
      </div>
      {loading && emptyP("Loading…")}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {brands.map((b) => (
          <button key={b.brandName} onClick={() => onOpenBrand(b.brandName)}
            className="text-left bg-white border border-gray-200 rounded-2xl shadow-sm p-5 hover:border-gray-400 hover:shadow transition">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">{b.brandName}</span>
              {b.lifecycleStage && <span className={pill("bg-gray-100 text-gray-700")}>{b.lifecycleStage}</span>}
            </div>
          </button>
        ))}
        {!loading && brands.length === 0 && emptyP("No brands assigned to this kitchen.")}
      </div>
    </div>
  );
}

/* ============================================================ 1. DISPATCHES */
function DispatchesView({ brandName }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/local-kitchen/dispatches", { params: { brandName } });
      setList(res.data?.data || []);
    } catch (e) { toast.error(errMsg(e, "Failed to load dispatches")); }
    finally { setLoading(false); }
  }, [brandName]);
  useEffect(() => { load(); }, [load]);

  const ack = async (id, status, discrepancyNote) => {
    try {
      await api.patch(`/api/local-kitchen/dispatches/${id}/acknowledge`, { status, discrepancyNote });
      toast.success(status === "RECEIVED" ? "Received — stock credited" : "Discrepancy recorded");
      setNoteFor(null); setNote("");
      load();
    } catch (e) { toast.error(errMsg(e, "Failed to acknowledge")); }
  };

  const statusPill = (s) => ({
    REQUESTED: "bg-amber-100 text-amber-800", DISPATCHED: "bg-blue-100 text-blue-800",
    RECEIVED: "bg-green-100 text-green-800", DISCREPANCY: "bg-red-100 text-red-700",
  }[s] || "bg-gray-100 text-gray-700");

  return (
    <Card title="Incoming dispatches" right={<button className={btnGhost} onClick={load}>Refresh</button>}>
      {loading ? emptyP("Loading…") : list.length === 0 ? emptyP("No dispatches.") : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-2">Sub-recipe</th><th className="py-2 pr-2">Qty</th><th className="py-2 pr-2">From</th>
            <th className="py-2 pr-2">Status</th><th className="py-2 pr-2">When</th><th className="py-2 pr-2"></th>
          </tr></thead>
          <tbody>
            {list.map((d) => (
              <React.Fragment key={d._id}>
                <tr className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-medium">{d.subRecipeName}</td>
                  <td className="py-2 pr-2">{d.qty} {d.uom}</td>
                  <td className="py-2 pr-2">{loc(d.fromBranchCode)}</td>
                  <td className="py-2 pr-2"><span className={pill(statusPill(d.status))}>{d.status}</span></td>
                  <td className="py-2 pr-2 text-gray-500">{fmtDate(d.dispatchedAt || d.createdAt)}</td>
                  <td className="py-2 pr-2 text-right">
                    {d.status === "DISPATCHED" && (
                      <div className="flex gap-2 justify-end">
                        <button className={btn} onClick={() => ack(d._id, "RECEIVED")}>Received</button>
                        <button className={btnGhost} onClick={() => { setNoteFor(d._id); setNote(""); }}>Discrepancy</button>
                      </div>
                    )}
                    {d.status === "DISCREPANCY" && <span className="text-xs text-red-600">{d.discrepancyNote}</span>}
                  </td>
                </tr>
                {noteFor === d._id && (
                  <tr><td colSpan={6} className="py-2">
                    <div className="flex gap-2">
                      <input className={inputCls} placeholder="What's wrong with this delivery?" value={note} onChange={(e) => setNote(e.target.value)} />
                      <button className={btn} onClick={() => ack(d._id, "DISCREPANCY", note)}>Save</button>
                      <button className={btnGhost} onClick={() => setNoteFor(null)}>Cancel</button>
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ============================================================ 2. STOCK */
function StockView({ brandName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/local-kitchen/stock/${encodeURIComponent(brandName)}`);
      setRows(res.data?.data || []);
    } catch (e) { toast.error(errMsg(e, "Failed to load stock")); }
    finally { setLoading(false); }
  }, [brandName]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card title="Local stock" right={<button className={btnGhost} onClick={load}>Refresh</button>}>
      {loading ? emptyP("Loading…") : rows.length === 0 ? emptyP("No stock at this kitchen.") : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-2">Item</th><th className="py-2 pr-2">Location</th><th className="py-2 pr-2">Qty</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-b border-gray-100">
                <td className="py-2 pr-2 font-medium">{r.itemName}</td>
                <td className="py-2 pr-2 text-gray-600">{r.location}</td>
                <td className="py-2 pr-2">{r.qtyRemaining} {r.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ============================================================ 2b. ORDER ENTRY (§25) */
const ORDER_SOURCE_OPTS = [
  ["WALK_IN", "Walk-in"], ["SWIGGY", "Swiggy"], ["ZOMATO", "Zomato"], ["OWNLY", "Ownly"], ["OTHER", "Other"],
];
const ORDER_BUCKET_OPTS = [
  ["MORNING", "Morning"], ["AFTERNOON", "Afternoon"], ["EVENING", "Evening"], ["LATE_NIGHT", "Late Night"],
];
const bucketLabel = (k) => (ORDER_BUCKET_OPTS.find(([v]) => v === k) || [k, k])[1];
const autoBucket = () => {
  const h = new Date().getHours();
  if (h < 11) return "MORNING";
  if (h < 16) return "AFTERNOON";
  if (h < 21) return "EVENING";
  return "LATE_NIGHT";
};
const minOrderDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// NOTE (dropdown-only limitation): orders can ONLY be recorded for dishes that
// exist as a MainRecipe for this brand. A dish not yet added to MainRecipe cannot
// be recorded here — accepted limitation for this build (recipes precede orders).
function OrderEntryView({ brandName }) {
  const [dishes, setDishes] = useState([]);
  const [recipeId, setRecipeId] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [source, setSource] = useState("WALK_IN");
  const [timeBucket, setTimeBucket] = useState(autoBucket());
  const [orderDate, setOrderDate] = useState(today());
  const [busy, setBusy] = useState(false);

  // Soft-block override flow
  const [blocked, setBlocked] = useState(null); // { items: [...] }
  const [overrideReason, setOverrideReason] = useState("");

  // Today's view
  const [summary, setSummary] = useState({ totalOrders: 0, totalRevenue: 0 });
  const [groups, setGroups] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const loadDishes = useCallback(async () => {
    try {
      const res = await api.get("/api/local-kitchen/recipes-for-orders", { params: { brandName } });
      setDishes(res.data?.data || []);
    } catch (e) { toast.error(errMsg(e, "Failed to load dishes")); }
  }, [brandName]);

  const loadOrders = useCallback(async () => {
    try {
      const res = await api.get("/api/local-kitchen/orders", { params: { brandName, date: orderDate } });
      setSummary(res.data?.summary || { totalOrders: 0, totalRevenue: 0 });
      setGroups(res.data?.data || []);
    } catch (e) { toast.error(errMsg(e, "Failed to load orders")); }
  }, [brandName, orderDate]);

  useEffect(() => { loadDishes(); }, [loadDishes]);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  const resetForm = () => {
    setRecipeId(""); setQty(""); setUnitPrice("");
    setSource("WALK_IN"); setTimeBucket(autoBucket());
  };

  const submit = async ({ override = false, reason = "" } = {}) => {
    if (!recipeId) return toast.error("Pick a dish");
    const qtyNum = Number(qty);
    if (!Number.isInteger(qtyNum) || qtyNum < 1) return toast.error("Qty must be a whole number ≥ 1");
    const priceNum = Number(unitPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) return toast.error("Unit price must be 0 or more");

    setBusy(true);
    try {
      await api.post("/api/local-kitchen/orders", {
        brandName, recipeId, qty: qtyNum, unitPrice: priceNum,
        source, timeBucket, orderDate,
        ...(override ? { override: true, overrideReason: reason } : {}),
      });
      toast.success("Order recorded");
      setBlocked(null); setOverrideReason("");
      resetForm();
      loadOrders();
    } catch (e) {
      if (e?.response?.status === 409 && e?.response?.data?.blocked) {
        // Soft block — show the override modal with the insufficient list.
        setBlocked({ items: e.response.data.items || [] });
      } else {
        toast.error(errMsg(e, "Failed to record order"));
      }
    } finally { setBusy(false); }
  };

  const confirmOverride = () => {
    if (!overrideReason.trim()) return toast.error("A reason is required to override");
    submit({ override: true, reason: overrideReason.trim() });
  };

  const deleteEntry = async (id) => {
    try {
      await api.delete(`/api/local-kitchen/orders/${id}`);
      toast.success("Order deleted");
      loadOrders();
    } catch (e) { toast.error(errMsg(e, "Failed to delete order")); }
  };

  const within30 = (enteredAt) =>
    enteredAt && (Date.now() - new Date(enteredAt).getTime()) / 60000 <= 30;

  return (
    <>
      <Card title="Record an order">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dish</label>
            <select className={inputCls} value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
              <option value="">Select a dish…</option>
              {dishes.map((d) => <option key={d.recipeId} value={d.recipeId}>{d.recipeName}</option>)}
            </select>
            {dishes.length === 0 && <p className="text-xs text-amber-600 mt-1">No dishes yet — add a recipe for this brand first.</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Quantity</label>
            <input className={inputCls} type="number" min="1" step="1" placeholder="e.g. 3" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Unit price (₹ per dish)</label>
            <input className={inputCls} type="number" min="0" step="0.01" placeholder="e.g. 250" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Source</label>
            <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
              {ORDER_SOURCE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Time bucket</label>
            <select className={inputCls} value={timeBucket} onChange={(e) => setTimeBucket(e.target.value)}>
              {ORDER_BUCKET_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input className={inputCls} type="date" value={orderDate} min={minOrderDate()} max={today()} onChange={(e) => setOrderDate(e.target.value)} />
          </div>
        </div>
        {qty && unitPrice && (
          <p className="text-sm text-gray-600 mt-3">Total: <span className="font-semibold">{inr(Number(qty) * Number(unitPrice))}</span> ({qty} × {inr(unitPrice)})</p>
        )}
        <div className="mt-3">
          <button className={btn} disabled={busy} onClick={() => submit()}>{busy ? "Saving…" : "Record order"}</button>
        </div>
      </Card>

      <Card title={`Orders for ${fmtDate(orderDate)}`} right={<button className={btnGhost} onClick={loadOrders}>Refresh</button>}>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 flex gap-8">
          <div><div className="text-xs text-gray-500">Orders</div><div className="text-2xl font-bold">{summary.totalOrders}</div></div>
          <div><div className="text-xs text-gray-500">Revenue</div><div className="text-2xl font-bold">{inr(summary.totalRevenue)}</div></div>
        </div>
        {groups.length === 0 ? emptyP("No orders recorded for this date.") : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">Dish</th>
              {ORDER_BUCKET_OPTS.map(([v, l]) => <th key={v} className="py-2 pr-2 text-right">{l}</th>)}
              <th className="py-2 pr-2 text-right">Total qty</th>
              <th className="py-2 pr-2 text-right">Revenue</th>
            </tr></thead>
            <tbody>
              {groups.map((g) => {
                const key = String(g.recipeId || g.recipeName);
                const isOpen = expanded === key;
                return (
                  <React.Fragment key={key}>
                    <tr className="border-b border-gray-100 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(isOpen ? null : key)}>
                      <td className="py-2 pr-2 font-medium">{isOpen ? "▾ " : "▸ "}{g.recipeName}</td>
                      {ORDER_BUCKET_OPTS.map(([v]) => <td key={v} className="py-2 pr-2 text-right">{g.bucketBreakdown?.[v]?.qty || 0}</td>)}
                      <td className="py-2 pr-2 text-right font-semibold">{g.totalQty}</td>
                      <td className="py-2 pr-2 text-right">{inr(g.totalRevenue)}</td>
                    </tr>
                    {isOpen && (g.entries || []).map((en) => (
                      <tr key={en._id} className="border-b border-gray-50 bg-gray-50 text-xs">
                        <td className="py-1.5 pr-2 pl-6 text-gray-600">
                          {bucketLabel(en.timeBucket)} · {en.source} · {new Date(en.enteredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          {!en.cascadeApplied && <span className={pill("bg-amber-100 text-amber-800") + " ml-2"}>override</span>}
                        </td>
                        <td colSpan={ORDER_BUCKET_OPTS.length} className="py-1.5 pr-2 text-right text-gray-600">{en.qty} × {inr(en.unitPrice)}</td>
                        <td className="py-1.5 pr-2 text-right">{inr(en.totalAmount)}</td>
                        <td className="py-1.5 pr-2 text-right">
                          {within30(en.enteredAt) && (
                            <button className="text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); deleteEntry(en._id); }}>Delete</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {blocked && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Not enough stock</h3>
            <p className="text-sm text-gray-600 mb-3">Recording this order will make these ingredients go negative:</p>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-4 max-h-48 overflow-auto">
              {blocked.items.map((it, i) => (
                <div key={i} className="px-3 py-2 text-sm flex justify-between">
                  <span className="font-medium">{it.itemName}</span>
                  <span className="text-gray-600">have {it.currentQty} {it.uom}, need {it.requiredQty} {it.uom} (short {it.shortfall} {it.uom})</span>
                </div>
              ))}
            </div>
            <label className="block text-xs text-gray-500 mb-1">Override reason (required)</label>
            <input className={inputCls} placeholder="e.g. stock audit pending, customer already served" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            <div className="flex justify-end gap-2 mt-4">
              <button className={btnGhost} onClick={() => { setBlocked(null); setOverrideReason(""); }}>Cancel</button>
              <button className={btn} disabled={busy} onClick={confirmOverride}>{busy ? "Saving…" : "Override & record"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================ 3. AUDIT */
function AuditView({ brandName }) {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/local-kitchen/audit/${encodeURIComponent(brandName)}`, { params: { date } });
      const d = res.data?.data;
      setData(d);
      if (d?.existing) {
        const latest = d.records[d.records.length - 1];
        setItems((latest.variances || []).map((v) => ({ ...v, varianceReason: v.reason || "" })));
      } else {
        setItems((d?.snapshot || []).map((s) => ({ ...s, varianceReason: "" })));
      }
    } catch (e) { toast.error(errMsg(e, "Failed to load audit")); }
    finally { setLoading(false); }
  }, [brandName, date]);
  useEffect(() => { load(); }, [load]);

  const setRow = (i, patch) => setItems(items.map((x, j) => {
    if (j !== i) return x;
    const next = { ...x, ...patch };
    next.varianceQty = Number((Number(next.actualQty || 0) - Number(next.expectedQty || 0)).toFixed(4));
    return next;
  }));
  const locked = data?.existing && data.records[data.records.length - 1]?.lockedAt;
  const payload = () => items.map((r) => ({
    itemName: r.itemName, uom: r.uom, expectedQty: Number(r.expectedQty || 0), actualQty: Number(r.actualQty || 0),
    varianceReason: r.varianceReason || undefined, reasonNote: r.reasonNote || "",
  }));
  const save = async () => {
    try { await api.post(`/api/local-kitchen/audit/${encodeURIComponent(brandName)}`, { date, items: payload() }); toast.success("Draft saved"); load(); }
    catch (e) { toast.error(errMsg(e, "Failed to save")); }
  };
  const lock = async (correction) => {
    try { await api.patch(`/api/local-kitchen/audit/${encodeURIComponent(brandName)}/lock`, { date, items: payload(), correction }); toast.success(correction ? "Correction recorded" : "Audit locked"); load(); }
    catch (e) { toast.error(errMsg(e, "Failed to lock")); }
  };

  return (
    <Card title="Daily closing-stock audit" right={
      <div className="flex items-center gap-2">
        <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className={btnGhost} onClick={load}>Load</button>
      </div>
    }>
      {loading ? emptyP("Loading…") : items.length === 0 ? emptyP("No stock to audit for this brand.") : (
        <>
          {locked && <p className="text-xs text-green-700 mb-2">Locked {fmtDate(locked)} — edits are recorded as a correction.</p>}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">Item</th><th className="py-2 pr-2">Expected</th><th className="py-2 pr-2">Actual</th>
              <th className="py-2 pr-2">Variance</th><th className="py-2 pr-2">Reason</th><th className="py-2 pr-2">Note</th>
            </tr></thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-medium">{r.itemName}</td>
                  <td className="py-2 pr-2">{r.expectedQty} {r.uom}</td>
                  <td className="py-2 pr-2"><input type="number" className={`${inputCls} w-24`} value={r.actualQty} onChange={(e) => setRow(i, { actualQty: e.target.value })} /></td>
                  <td className={`py-2 pr-2 ${r.varianceQty !== 0 ? "text-red-600 font-medium" : ""}`}>{r.varianceQty}</td>
                  <td className="py-2 pr-2">
                    <select className={`${inputCls} w-32`} value={r.varianceReason} onChange={(e) => setRow(i, { varianceReason: e.target.value })} disabled={r.varianceQty === 0}>
                      <option value="">—</option>
                      {["WASTAGE", "SPOILAGE", "MISCOUNT", "THEFT", "OTHER"].map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2"><input className={`${inputCls} w-36`} value={r.reasonNote || ""} onChange={(e) => setRow(i, { reasonNote: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-3">
            {!locked && <button className={btnGhost} onClick={save}>Save draft</button>}
            {!locked && <button className={btn} onClick={() => lock(false)}>Lock audit</button>}
            {locked && <button className={btn} onClick={() => lock(true)}>Record correction</button>}
          </div>
        </>
      )}
    </Card>
  );
}

/* ============================================================ 4. REPLENISH */
function ReplenishView({ brandName }) {
  const [requestType, setRequestType] = useState("RAW_INGREDIENT");
  const [rows, setRows] = useState([{ itemName: "", ingredientBrand: "", qty: "", uom: "" }]);
  const [busy, setBusy] = useState(false);
  const [indents, setIndents] = useState({ rawIngredient: [], subRecipe: [] });

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/local-kitchen/indents", { params: { brandName } });
      setIndents(res.data?.data || { rawIngredient: [], subRecipe: [] });
    } catch (e) { toast.error(errMsg(e, "Failed to load requests")); }
  }, [brandName]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const items = rows
      .map((r) => ({ itemName: r.itemName.trim(), ingredientBrand: r.ingredientBrand.trim(), qty: Number(r.qty || 0), uom: r.uom.trim() }))
      .filter((r) => r.itemName);
    if (items.length === 0) return toast.error(requestType === "RAW_INGREDIENT" ? "Each row needs an item name" : "Each row needs a sub-recipe name");
    setBusy(true);
    try {
      await api.post("/api/local-kitchen/indent", { brandName, requestType, items });
      toast.success(requestType === "RAW_INGREDIENT" ? "Raw request sent to Store Manager" : "Sub-recipe request sent to Head Chef");
      setRows([{ itemName: "", ingredientBrand: "", qty: "", uom: "" }]);
      load();
    } catch (e) { toast.error(errMsg(e, "Failed to raise request")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Card title="Request replenishment">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm text-gray-500">Type:</span>
          {[["RAW_INGREDIENT", "Raw ingredient → Store Manager"], ["SUB_RECIPE", "Sub-recipe → Head Chef"]].map(([v, label]) => (
            <button key={v} onClick={() => setRequestType(v)} className={`px-3 py-1.5 rounded-lg text-sm ${requestType === v ? "bg-black text-white" : btnGhost}`}>{label}</button>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
            <input className={inputCls} placeholder={requestType === "RAW_INGREDIENT" ? "Item name" : "Sub-recipe name"} value={r.itemName} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} />
            <input className={inputCls} placeholder={requestType === "RAW_INGREDIENT" ? "Manufacturer brand (optional)" : "—"} value={r.ingredientBrand} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, ingredientBrand: e.target.value } : x))} disabled={requestType !== "RAW_INGREDIENT"} />
            <input className={inputCls} type="number" placeholder="Qty" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
            <input className={inputCls} placeholder="UOM" value={r.uom} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, uom: e.target.value } : x))} />
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <button className={btnGhost} onClick={() => setRows([...rows, { itemName: "", ingredientBrand: "", qty: "", uom: "" }])}>+ Row</button>
          <button className={btn} disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send request"}</button>
        </div>
      </Card>

      <Card title="My raw-ingredient requests (Store Manager)">
        {indents.rawIngredient.length === 0 ? emptyP("None.") : indents.rawIngredient.map((d) => (
          <div key={d._id} className="border-b border-gray-100 py-2 text-sm flex justify-between">
            <span><span className="font-medium">{d.itemName}</span> · {d.qty} {d.uom}</span>
            <span className={pill("bg-gray-100 text-gray-700")}>{d.status}</span>
          </div>
        ))}
      </Card>

      <Card title="My sub-recipe requests (Head Chef)">
        {indents.subRecipe.length === 0 ? emptyP("None.") : indents.subRecipe.map((d) => (
          <div key={d._id} className="border-b border-gray-100 py-2 text-sm flex justify-between">
            <span><span className="font-medium">{d.subRecipeName}</span> · {d.qty} {d.uom}</span>
            <span className={pill("bg-gray-100 text-gray-700")}>{d.status}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ============================================================ 5. RECIPES */
function RecipesView({ brandName }) {
  const [data, setData] = useState({ mainRecipes: [], subRecipes: [] });
  useEffect(() => {
    api.get(`/api/local-kitchen/recipes/${encodeURIComponent(brandName)}`)
      .then((r) => setData(r.data?.data || { mainRecipes: [], subRecipes: [] }))
      .catch((e) => toast.error(errMsg(e, "Failed to load recipes")));
  }, [brandName]);

  return (
    <>
      <Card title="Main recipes">
        {data.mainRecipes.length === 0 ? emptyP("None.") : data.mainRecipes.map((r) => (
          <div key={r._id} className="border-b border-gray-100 py-2 text-sm">
            <span className="font-medium">{r.recipeName}</span> <span className="text-gray-400">· {(r.items || []).length} items</span>
            {r.sopLink && <a href={r.sopLink} target="_blank" rel="noreferrer" className="text-blue-600 ml-2 underline">SOP</a>}
          </div>
        ))}
      </Card>
      <Card title="Sub-recipes">
        {data.subRecipes.length === 0 ? emptyP("None.") : data.subRecipes.map((r) => (
          <div key={r._id} className="border-b border-gray-100 py-2 text-sm">
            <span className="font-medium">{r.recipeName}</span> <span className="text-gray-400">· yield {r.yield} · {(r.items || []).length} items</span>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ============================================================ 6. MENU & PROJ */
function MenuProjView({ brandName }) {
  const [menu, setMenu] = useState([]);
  const [projections, setProjections] = useState([]);
  useEffect(() => {
    api.get(`/api/local-kitchen/menu/${encodeURIComponent(brandName)}`).then((r) => setMenu(r.data?.data || [])).catch(() => {});
    api.get(`/api/local-kitchen/projections/${encodeURIComponent(brandName)}`).then((r) => setProjections(r.data?.data || [])).catch(() => {});
  }, [brandName]);

  return (
    <>
      <Card title="Menu (this kitchen)">
        {menu.length === 0 ? emptyP("No menu.") : menu.map((m) => (
          <div key={m._id} className="border-b border-gray-100 py-2 text-sm">
            <span className="text-gray-500">{fmtDate(m.createdAt)}</span>
            <div className="text-gray-800">{(m.items || []).map((it) => `${it.recipeName} ×${it.qty}`).join(", ")}</div>
          </div>
        ))}
      </Card>
      <Card title="Projections (this kitchen)">
        {projections.length === 0 ? emptyP("No projections.") : projections.map((p) => (
          <div key={p._id} className="border-b border-gray-100 py-2 text-sm">
            <span className="text-gray-500">{p.type} · for {fmtDate(p.forDate)} · {p.status}</span>
            <div className="text-gray-800">{(p.items || []).map((it) => `${it.recipeName} ×${it.targetQty}`).join(", ")}</div>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ============================================================ 7. FCR */
function FcrView({ brandName }) {
  const [dishes, setDishes] = useState([]);
  useEffect(() => {
    api.get(`/api/local-kitchen/fcr/${encodeURIComponent(brandName)}`)
      .then((r) => setDishes(r.data?.data || []))
      .catch((e) => toast.error(errMsg(e, "Failed to load FCR")));
  }, [brandName]);
  return (
    <Card title="FCR iterations (read-only)">
      {dishes.length === 0 ? emptyP("No dishes yet.") : <FcrIterationTimeline dishes={dishes} showConfirmation={false} />}
    </Card>
  );
}
