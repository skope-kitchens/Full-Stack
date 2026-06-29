import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../utils/api";
import { authUtils } from "../utils/auth";
import toast from "../utils/toast";
import Footer from "../components/Footer";

/* ============================================================
 * Stock Manager Dashboard (Dashboard #3 of 6, B2C)
 * Base-kitchen warehouse (JP Nagar). Code role: INGREDIENT_MANAGER.
 * Owns: procurement, Purchase Register, Delivery QC, fulfilling Head-Chef
 * indents, closing-stock audits, vendors. NEVER touches money (frozen).
 * Brand-first: pick a brand → see that brand's stock/indents/audits.
 * ========================================================== */

const BRANCH_DISPLAY = {
  JPNAGAR: "JP Nagar",
  TESTBRANCH: "Test Branch",
  MARATHAHALLI: "Marathahalli",
  KALYANNAGAR: "Kalyan Nagar",
  TESTWAREHOUSE: "Test Warehouse",
  WAREHOUSE_JPNAGAR: "JP Nagar Warehouse",
};
const loc = (code) =>
  BRANCH_DISPLAY[code] ||
  String(code || "")
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const today = () => new Date().toISOString().slice(0, 10);
const errMsg = (e, fallback) => e?.response?.data?.message || fallback;
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");

const WORKSPACE_ITEMS = [
  { key: "stock", label: "Stock Overview" },
  { key: "indents", label: "Indents (incoming)" },
  { key: "procInvoices", label: "Procurement Invoices" },
  { key: "grn", label: "GRN + Delivery QC" },
  { key: "vendorAlerts", label: "Vendor Alerts" },
  { key: "purchases", label: "Purchases Log" },
  { key: "audit", label: "Closing Stock Audit" },
  { key: "reorder", label: "Reorder Insights" },
];

/* ---------- shared UI ---------- */
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
const btn =
  "px-4 py-2 rounded-lg text-sm font-medium bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed";
const btnGhost =
  "px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50";
const pill = (cls) => `inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`;

/* Stock level indicator — currentQty vs minStockLevel as a colored bar.
 * Red < 25%, amber 25–75%, green > 75%. Capped at 100% with an "Above min"
 * label when stock exceeds the minimum. Shows "Threshold not set" when no
 * minStockLevel is configured (set it inline via the Thresholds editor). */
function StockPercentBar({ currentQty, minStockLevel }) {
  if (minStockLevel == null || !(Number(minStockLevel) > 0)) {
    return <span className="text-xs text-gray-400">Threshold not set</span>;
  }
  const raw = (Number(currentQty || 0) / Number(minStockLevel)) * 100;
  const above = raw >= 100;
  const pct = Math.min(Math.round(raw), 100);
  const color = pct < 25 ? "bg-red-500" : pct <= 75 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className={`${color} h-2.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 whitespace-nowrap">{above ? "Above min" : `${pct}%`}</span>
    </div>
  );
}

/* ============================================================
 * MAIN
 * ========================================================== */
export default function StockManager() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const [mode, setMode] = useState("home"); // home | brand | vendors
  const [selectedBrand, setSelectedBrand] = useState(null); // brandName string
  const [activeView, setActiveView] = useState("stock");

  const warehouseId = authUtils.getWarehouseId?.();

  useEffect(() => {
    if (authUtils.getRole() !== "INGREDIENT_MANAGER") {
      navigate("/login");
      return;
    }
    setAuthorized(true);
  }, [navigate]);

  const openBrand = (brandName) => {
    setSelectedBrand(brandName);
    setActiveView("stock");
    setMode("brand");
  };

  const logout = () => {
    authUtils.clearAuth();
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    navigate("/");
  };

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      {/* Rounded pill nav — Skope logo left, Logout right */}
      <nav className="bg-white shadow-sm w-11/12 lg:w-9/12 mx-auto mt-4 rounded-full border border-gray-100">
        <div className="flex justify-between items-center h-16 px-8">
          <Link to="/" className="flex items-center">
            <img src="/assets/Logo-Dark.png" className="w-[160px]" alt="Skope Kitchens" />
          </Link>
          <button onClick={logout} className="bg-black text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 transition">
            Logout
          </button>
        </div>
      </nav>

      {/* Sub-header — title + warehouse below the logo, Vendors stays on the right */}
      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          {mode !== "home" && (
            <button
              onClick={() => {
                setMode("home");
                setSelectedBrand(null);
              }}
              className={btnGhost}
            >
              ← Brands
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Store Manager</h1>
            {warehouseId && <p className="text-sm text-gray-500">Warehouse: {loc(warehouseId)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode !== "audits" && (
            <button onClick={() => setMode("audits")} className={btnGhost}>
              All Audits
            </button>
          )}
          {mode !== "vendors" && (
            <button onClick={() => setMode("vendors")} className={btnGhost}>
              Vendors
            </button>
          )}
        </div>
      </div>

      {/* min-h-screen keeps the content region at least one full viewport tall so
          the footer always sits below the fold — only visible after scrolling. */}
      <div className="flex-1 min-h-screen">
        {mode === "home" && <HomeView onOpenBrand={openBrand} />}
        {mode === "vendors" && <VendorsView />}
        {mode === "audits" && <AllAuditsView />}
        {mode === "brand" && selectedBrand && (
          <div className="flex">
            <aside
              className={`${collapsed ? "w-16" : "w-60"} shrink-0 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] transition-all`}
            >
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="w-full px-4 py-3 text-left text-gray-500 hover:text-gray-900"
              >
                {collapsed ? "»" : "« Collapse"}
              </button>
              <nav className="px-2 space-y-1">
                {WORKSPACE_ITEMS.map((it) => (
                  <button
                    key={it.key}
                    onClick={() => setActiveView(it.key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                      activeView === it.key ? "bg-gray-100 font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-100"
                    }`}
                    title={it.label}
                  >
                    {collapsed ? it.label.charAt(0) : it.label}
                  </button>
                ))}
              </nav>
            </aside>

            <main className="flex-1 p-6 max-w-6xl">
              <h2 className="text-xl font-bold mb-4">{selectedBrand}</h2>
              {activeView === "stock" && <StockOverview brandName={selectedBrand} />}
              {activeView === "indents" && <IndentsView brandName={selectedBrand} />}
              {activeView === "procInvoices" && <ProcurementInvoicesView brandName={selectedBrand} />}
              {activeView === "grn" && <GrnQcView brandName={selectedBrand} />}
              {activeView === "vendorAlerts" && <VendorAlertsView brandName={selectedBrand} />}
              {activeView === "purchases" && <PurchasesView brandName={selectedBrand} />}
              {activeView === "audit" && <ClosingStockView brandName={selectedBrand} />}
              {activeView === "reorder" && <ReorderView brandName={selectedBrand} />}
            </main>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

/* ============================================================
 * HOME — Brand picker grid + all-brands rollup
 * ========================================================== */
function HomeView({ onOpenBrand }) {
  const [brands, setBrands] = useState([]);
  const [rollup, setRollup] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([
        api.get("/api/stock-manager/brands-summary"),
        api.get("/api/stock-manager/all-brands-rollup"),
      ]);
      setBrands(b.data?.data || []);
      setRollup(r.data?.data || null);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load brands"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">Brands</h2>
        <button onClick={load} className={btnGhost}>
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {brands.map((b) => (
          <button
            key={b.brandName}
            onClick={() => onOpenBrand(b.brandName)}
            className="text-left bg-white border border-gray-200 rounded-2xl shadow-sm p-5 hover:border-gray-400 hover:shadow transition"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-900">{b.brandName}</span>
              <span className="text-gray-900 font-bold">{money(b.totalStockValue)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <span>{b.activeItemCount} active items</span>
              <span>{b.pendingIndents} pending indents</span>
              <span className={b.nearExpiryCount ? "text-amber-700 font-medium" : ""}>
                {b.nearExpiryCount} near-expiry
              </span>
              <span className={b.lowStockCount ? "text-red-600 font-medium" : ""}>
                {b.lowStockCount} low-stock
              </span>
            </div>
          </button>
        ))}
        {!loading && brands.length === 0 && (
          <p className="text-sm text-gray-500">No brands found.</p>
        )}
      </div>

      {rollup && (
        <div className="bg-slate-100 border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">All Brands — Roll-up</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <Metric label="Brands" value={rollup.brandCount} />
            <Metric label="Total Stock Value" value={money(rollup.totalStockValue)} />
            <Metric label="Active Items" value={rollup.activeItemCount} />
            <Metric label="Pending Indents" value={rollup.pendingIndents} />
            <Metric label="Near-expiry / Low" value={`${rollup.nearExpiryCount} / ${rollup.lowStockCount}`} />
          </div>
        </div>
      )}
    </div>
  );
}
function Metric({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
    </div>
  );
}

/* ============================================================
 * STOCK OVERVIEW
 * ========================================================== */
function StockOverview({ brandName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState(null); // {itemName, shelfLifeDays, minStockLevel, minStockUom}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/stock-manager/stock/${encodeURIComponent(brandName)}`, {
        params: search.trim() ? { search: search.trim() } : {},
      });
      setRows(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load stock"));
    } finally {
      setLoading(false);
    }
  }, [brandName, search]);

  useEffect(() => {
    load();
  }, [load]);

  const saveThresholds = async () => {
    try {
      await api.patch(`/api/stock-manager/ingredient/${encodeURIComponent(editItem.itemName)}`, {
        shelfLifeDays: editItem.shelfLifeDays === "" ? null : Number(editItem.shelfLifeDays),
        minStockLevel: editItem.minStockLevel === "" ? null : Number(editItem.minStockLevel),
        minStockUom: editItem.minStockUom || null,
      });
      toast.success("Thresholds saved");
      setEditItem(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to save"));
    }
  };

  return (
    <Card
      title="Stock Overview"
      right={
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter item…"
            className={inputCls + " w-44"}
          />
          <button onClick={load} className={btnGhost}>
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No stock for this brand yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Ing. Brand</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2 pr-3">Expiry</th>
                <th className="py-2 pr-3">Age</th>
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3">Price</th>
                <th className="py-2 pr-3">Stock %</th>
                <th className="py-2 pr-3">Thresholds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r._id}
                  className={`border-b last:border-0 ${
                    r.belowMin ? "bg-red-50" : r.nearExpiry ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="py-2 pr-3 font-medium">
                    {r.itemName}
                    {r.belowMin && <span className={pill("bg-red-100 text-red-700") + " ml-2"}>Low</span>}
                  </td>
                  <td className="py-2 pr-3">{r.ingredientBrand || "—"}</td>
                  <td className="py-2 pr-3">
                    {r.qtyRemaining} {r.uom}
                  </td>
                  <td className="py-2 pr-3">
                    {fmtDate(r.expiryDate)}
                    {r.nearExpiry && (
                      <span className={pill("bg-amber-100 text-amber-800") + " ml-2"}>Soon</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{r.batchAgeDays == null ? "—" : `${r.batchAgeDays}d`}</td>
                  <td className="py-2 pr-3">{r.vendorName || "—"}</td>
                  <td className="py-2 pr-3">{money(r.pricePerUnit)}</td>
                  <td className="py-2 pr-3">
                    <StockPercentBar currentQty={r.itemTotalRemaining} minStockLevel={r.minStockLevel} />
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className="text-gray-900 underline text-xs hover:text-black"
                      onClick={() =>
                        setEditItem({
                          itemName: r.itemName,
                          shelfLifeDays: r.shelfLifeDays ?? "",
                          minStockLevel: r.minStockLevel ?? "",
                          minStockUom: r.minStockUom ?? r.uom ?? "",
                        })
                      }
                    >
                      {r.shelfLifeDays == null && r.minStockLevel == null
                        ? "Not set — edit"
                        : `Shelf ${r.shelfLifeDays ?? "—"}d / Min ${r.minStockLevel ?? "—"}`}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <Modal title={`Thresholds — ${editItem.itemName}`} onClose={() => setEditItem(null)}>
          <div className="space-y-3">
            <Field label="Shelf life (days)">
              <input
                type="number"
                min="0"
                value={editItem.shelfLifeDays}
                onChange={(e) => setEditItem({ ...editItem, shelfLifeDays: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Minimum stock level">
              <input
                type="number"
                min="0"
                value={editItem.minStockLevel}
                onChange={(e) => setEditItem({ ...editItem, minStockLevel: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Min-stock UOM">
              <input
                value={editItem.minStockUom}
                onChange={(e) => setEditItem({ ...editItem, minStockUom: e.target.value })}
                placeholder="KG / GM / L / PC"
                className={inputCls}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditItem(null)} className={btnGhost}>
                Cancel
              </button>
              <button onClick={saveThresholds} className={btn}>
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ============================================================
 * INDENTS (incoming) — verify/issue reuse existing endpoints
 * ========================================================== */
const INDENT_STATUS_PILL = {
  INDENT_PENDING: pill("bg-gray-100 text-gray-700"),
  INDENT_VERIFIED: pill("bg-blue-100 text-blue-700"),
  INDENT_ISSUING: pill("bg-amber-100 text-amber-800"),
  ISSUED: pill("bg-green-100 text-green-700"),
};
/* ============================================================
 * Procurement Invoices — raise (from indent) + supplementary + list.
 * Wallet-free: each raise creates a Razorpay order; the client pays from their
 * dashboard. GRN becomes client-visible once all linked invoices are paid AND
 * received qty is entered. (CLAUDE.md §24)
 * ========================================================== */
function ProcInvoiceForm({ title, initialItems, lockItems, onSubmit, onCancel, requireReason }) {
  const [items, setItems] = useState(
    initialItems && initialItems.length
      ? initialItems.map((it) => ({ ...it }))
      : [{ itemName: "", qty: "", uom: "", unitPrice: "" }]
  );
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const setItem = (i, patch) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, { itemName: "", qty: "", uom: "", unitPrice: "" }]);
  const removeItem = (i) => setItems((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));

  const amount = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);

  const onUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post(`/api/stock-manager/invoice-attachment`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAttachmentUrl(res.data?.attachmentUrl || "");
      setAttachmentName(res.data?.attachmentName || file.name);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(errMsg(e, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const clean = items
      .map((it) => ({
        itemName: String(it.itemName || "").trim(),
        qty: Number(it.qty || 0),
        uom: String(it.uom || "").trim(),
        unitPrice: Number(it.unitPrice || 0),
      }))
      .filter((it) => it.itemName && it.qty > 0);
    if (!clean.length) return toast.error("Add at least one valid line item");
    if (requireReason && !reason.trim()) return toast.error("Supplementary reason is required");
    setSaving(true);
    try {
      await onSubmit({
        items: clean,
        notes: notes || undefined,
        supplementaryReason: requireReason ? reason : undefined,
        attachmentUrl: attachmentUrl || undefined,
        attachmentName: attachmentName || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={title}>
      <table className="w-full text-sm mb-3">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-1 pr-2">Item</th>
            <th className="py-1 pr-2">Qty</th>
            <th className="py-1 pr-2">UOM</th>
            <th className="py-1 pr-2">Unit price ₹</th>
            <th className="py-1 pr-2">Line ₹</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1 pr-2">
                <input
                  className={inputCls}
                  value={it.itemName}
                  disabled={lockItems}
                  onChange={(e) => setItem(i, { itemName: e.target.value })}
                />
              </td>
              <td className="py-1 pr-2 w-24">
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  value={it.qty}
                  disabled={lockItems}
                  onChange={(e) => setItem(i, { qty: e.target.value })}
                />
              </td>
              <td className="py-1 pr-2 w-20">
                <input
                  className={inputCls}
                  value={it.uom}
                  disabled={lockItems}
                  onChange={(e) => setItem(i, { uom: e.target.value })}
                />
              </td>
              <td className="py-1 pr-2 w-28">
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  value={it.unitPrice}
                  onChange={(e) => setItem(i, { unitPrice: e.target.value })}
                />
              </td>
              <td className="py-1 pr-2 text-gray-700">
                {money(Number(it.qty || 0) * Number(it.unitPrice || 0))}
              </td>
              <td className="py-1">
                {!lockItems && (
                  <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-600">
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!lockItems && (
        <button onClick={addItem} className={btnGhost + " mb-3"}>
          + Add line
        </button>
      )}

      {requireReason && (
        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">Supplementary reason</label>
          <input
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. vendor price increased ₹20/kg"
          />
        </div>
      )}

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Notes</label>
        <textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Attachment (PDF / DOC / DOCX)</label>
        {attachmentUrl ? (
          <div className="flex items-center gap-2 text-sm">
            <a href={attachmentUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
              {attachmentName || "attachment"}
            </a>
            <button
              onClick={() => {
                setAttachmentUrl("");
                setAttachmentName("");
              }}
              className="text-gray-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            disabled={uploading}
            onChange={(e) => onUpload(e.target.files?.[0])}
            className="text-sm"
          />
        )}
      </div>

      <div className="rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 mb-3">
        ⚠ Ensure prices are confirmed before raising the invoice. Once paid, supplementary invoices may be needed
        for price differences.
      </div>

      <div className="flex items-center gap-3">
        <div className="text-sm text-gray-700">
          Total: <span className="font-semibold">{money(amount)}</span>
        </div>
        <button onClick={submit} disabled={saving || !(amount > 0)} className={btn}>
          {saving ? "…" : "Raise Invoice"}
        </button>
        <button onClick={onCancel} className={btnGhost}>
          Cancel
        </button>
      </div>
    </Card>
  );
}

function ProcurementInvoicesView({ brandName }) {
  const [indents, setIndents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [clientId, setClientId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [raiseFor, setRaiseFor] = useState(null); // indent
  const [suppFor, setSuppFor] = useState(null); // parent invoice

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ind = await api.get(`/api/stock-manager/indents/${encodeURIComponent(brandName)}`);
      const indentRows = (ind.data?.data || []).filter(
        (r) => r.status !== "ISSUED" && (!r.indentType || r.indentType === "PROCUREMENT")
      );
      setIndents(indentRows);
      const cid = indentRows.find((r) => r.clientBrandId)?.clientBrandId || null;
      setClientId(cid);

      const inv = await api.get(`/api/stock-manager/invoices`, {
        params: cid ? { clientId: cid } : {},
      });
      const data = (inv.data?.data || []).filter((g) => !brandName || g.brandName === brandName);
      setInvoices(data);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load procurement invoices"));
    } finally {
      setLoading(false);
    }
  }, [brandName]);

  useEffect(() => {
    load();
  }, [load]);

  const raiseFromIndent = async (payload) => {
    try {
      await api.post(`/api/stock-manager/invoice`, {
        clientId: raiseFor.clientBrandId,
        branchCode: raiseFor.branchCode || undefined,
        indentId: raiseFor._id,
        ...payload,
      });
      toast.success("Procurement invoice raised — client notified");
      setRaiseFor(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to raise invoice"));
    }
  };

  const raiseSupplementary = async (payload) => {
    try {
      await api.post(`/api/stock-manager/invoice`, {
        clientId,
        parentInvoiceId: suppFor.id,
        indentId: suppFor.indentId || undefined,
        ...payload,
      });
      toast.success("Supplementary invoice raised — client notified");
      setSuppFor(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to raise supplementary invoice"));
    }
  };

  if (raiseFor) {
    return (
      <ProcInvoiceForm
        title={`Raise Procurement Invoice — ${raiseFor.itemName}`}
        initialItems={[
          { itemName: raiseFor.itemName, qty: raiseFor.qty, uom: raiseFor.uom, unitPrice: "" },
        ]}
        lockItems={false}
        onSubmit={raiseFromIndent}
        onCancel={() => setRaiseFor(null)}
      />
    );
  }

  if (suppFor) {
    return (
      <ProcInvoiceForm
        title={`Supplementary Invoice for INV-${suppFor.id.slice(-4).toUpperCase()}`}
        initialItems={[{ itemName: "", qty: "", uom: "", unitPrice: "" }]}
        lockItems={false}
        requireReason
        onSubmit={raiseSupplementary}
        onCancel={() => setSuppFor(null)}
      />
    );
  }

  return (
    <>
      <Card
        title="Indents needing a procurement invoice"
        right={
          <button onClick={load} className={btnGhost}>
            Refresh
          </button>
        }
      >
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : indents.length === 0 ? (
          <p className="text-sm text-gray-500">No open procurement indents for this brand.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {indents.map((r) => (
                <tr key={r._id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.itemName}</td>
                  <td className="py-2 pr-3">
                    {r.qty} {r.uom}
                  </td>
                  <td className="py-2 pr-3 text-gray-500">{r.status}</td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => setRaiseFor(r)}
                      disabled={!r.clientBrandId}
                      className={btnGhost}
                      title={!r.clientBrandId ? "Indent has no linked client" : ""}
                    >
                      Raise Procurement Invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Procurement invoices raised">
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-500">No procurement invoices yet.</p>
        ) : (
          <div className="space-y-3">
            {invoices.map((g) => (
              <div key={g.id} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm">
                    <span className="font-semibold">INV-{g.id.slice(-4).toUpperCase()}</span>{" "}
                    <span className="text-gray-700">{money(g.amount)}</span>{" "}
                    <span
                      className={pill(
                        g.status === "PAID" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {g.status}
                    </span>
                    {g.status === "PAID" && g.paidAt && (
                      <span className="text-xs text-gray-400 ml-2">Paid {fmtDate(g.paidAt)}</span>
                    )}
                  </div>
                  {g.status === "PAID" && (
                    <button onClick={() => setSuppFor(g)} className={btnGhost}>
                      Raise Supplementary Invoice
                    </button>
                  )}
                </div>
                {g.notes && <div className="text-xs text-gray-500 mt-1">{g.notes}</div>}
                {g.attachmentUrl && (
                  <a
                    href={g.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 underline mt-1 inline-block"
                  >
                    {g.attachmentName || "attachment"}
                  </a>
                )}
                {g.supplementaries?.length > 0 && (
                  <div className="mt-2 pl-3 border-l-2 border-purple-200 space-y-1">
                    {g.supplementaries.map((s) => (
                      <div key={s.id} className="text-sm">
                        <span className="text-purple-700">
                          INV-{s.id.slice(-4).toUpperCase()} (Suppl.)
                        </span>{" "}
                        {money(s.amount)}{" "}
                        <span
                          className={pill(
                            s.status === "PAID" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                          )}
                        >
                          {s.status}
                        </span>
                        {s.supplementaryReason && (
                          <span className="text-xs text-gray-500 ml-1">— {s.supplementaryReason}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-2">
                  GRN for this purchase becomes visible to the client once all linked invoices are paid and
                  received qty is entered.
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function IndentsView({ brandName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [verifyRow, setVerifyRow] = useState(null);
  const [verifyCost, setVerifyCost] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/stock-manager/indents/${encodeURIComponent(brandName)}`, {
        params: statusFilter ? { status: statusFilter } : {},
      });
      setRows(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load indents"));
    } finally {
      setLoading(false);
    }
  }, [brandName, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const logEvent = async (indentId, eventType) => {
    try {
      await api.post("/api/stock-manager/indents/log", { indentId, eventType });
    } catch {
      /* analytics log is best-effort */
    }
  };

  const doVerify = async () => {
    const cost = Number(verifyCost);
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Enter a valid cost");
      return;
    }
    try {
      await api.patch(`/api/ingredient-indent/${verifyRow._id}/verify`, { cost });
      await logEvent(verifyRow._id, "INDENT_VERIFIED");
      toast.success("Verified");
      setVerifyRow(null);
      setVerifyCost("");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to verify"));
    }
  };

  const verifyTransfer = async (row) => {
    setBusyId(row._id);
    try {
      await api.patch(`/api/ingredient-indent/${row._id}/verify`, { cost: 0 });
      await logEvent(row._id, "INDENT_VERIFIED");
      toast.success("Transfer verified (₹0)");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to verify"));
    } finally {
      setBusyId(null);
    }
  };

  const doIssue = async (row, fulfillFromWarehouse = false) => {
    setBusyId(row._id);
    try {
      await api.patch(`/api/ingredient-indent/${row._id}/issue`, { fulfillFromWarehouse });
      await logEvent(row._id, "INDENT_ISSUED");
      toast.success("Issued");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to issue"));
    } finally {
      setBusyId(null);
    }
  };

  const isTransfer = (r) => r.indentType === "INVENTORY_TRANSFER" || r.indentType === "WAREHOUSE_TRANSFER";

  return (
    <Card
      title="Indents (incoming from Head Chef)"
      right={
        <div className="flex gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls + " w-44"}>
            <option value="">All statuses</option>
            <option value="INDENT_PENDING">Pending</option>
            <option value="INDENT_VERIFIED">Verified</option>
            <option value="ISSUED">Issued</option>
          </select>
          <button onClick={load} className={btnGhost}>
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No indents for this brand.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const enough = Number(r.warehouseStockAvailable || 0) >= Number(r.qty || 0);
                return (
                  <tr key={r._id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      {r.itemName}
                      {r.ingredientBrand ? <span className="text-gray-400"> · {r.ingredientBrand}</span> : null}
                      {!isTransfer(r) && r.status !== "ISSUED" && Number(r.warehouseStockAvailable || 0) > 0 && (
                        <div className="text-xs text-amber-700">
                          In Warehouse Stock: {r.warehouseStockAvailable} {r.uom}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.qty} {r.uom}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={pill(r.source === "PROJECTION" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-700")}>
                        {r.source}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {isTransfer(r) ? (
                        <span className={pill("bg-purple-100 text-purple-700")}>Warehouse Transfer</span>
                      ) : (
                        <span className={pill("bg-gray-100 text-gray-600")}>Procurement</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={INDENT_STATUS_PILL[r.status] || ""}>{r.status?.replace("INDENT_", "")}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {r.status === "INDENT_PENDING" &&
                        (isTransfer(r) ? (
                          <button disabled={busyId === r._id} onClick={() => verifyTransfer(r)} className={btn}>
                            Verify Transfer
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setVerifyRow(r);
                              setVerifyCost("");
                            }}
                            className={btn}
                          >
                            Verify
                          </button>
                        ))}
                      {r.status === "INDENT_VERIFIED" && (
                        <div className="flex gap-2">
                          {isTransfer(r) ? (
                            <button disabled={busyId === r._id} onClick={() => doIssue(r, false)} className={btn}>
                              Issue Transfer
                            </button>
                          ) : enough ? (
                            <>
                              <button disabled={busyId === r._id} onClick={() => doIssue(r, false)} className={btn}>
                                Issue
                              </button>
                              <button
                                disabled={busyId === r._id}
                                onClick={() => doIssue(r, true)}
                                className={btnGhost}
                                title="Deduct from Warehouse Stock (no client charge)"
                              >
                                Fulfill from Warehouse Stock
                              </button>
                            </>
                          ) : (
                            <span className={pill("bg-red-100 text-red-700")}>Out of Stock</span>
                          )}
                        </div>
                      )}
                      {r.status === "ISSUED" && <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {verifyRow && (
        <Modal title={`Verify — ${verifyRow.itemName}`} onClose={() => setVerifyRow(null)}>
          <Field label={`Cost for ${verifyRow.qty} ${verifyRow.uom}`}>
            <input
              type="number"
              min="0"
              value={verifyCost}
              onChange={(e) => setVerifyCost(e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3">
            <button onClick={() => setVerifyRow(null)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={doVerify} className={btn}>
              Verify
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ============================================================
 * GRN + DELIVERY QC
 * ========================================================== */
const QC_OPTIONS = ["ACCEPTED", "PARTIAL", "SHORT", "REJECTED"];
function GrnQcView({ brandName }) {
  const [indents, setIndents] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [failures, setFailures] = useState([]);
  const [vendorId, setVendorId] = useState("");
  const [indentId, setIndentId] = useState("");
  const [line, setLine] = useState(blankLine());
  const [saving, setSaving] = useState(false);

  function blankLine() {
    return {
      itemName: "",
      ingredientBrand: "",
      uom: "",
      plannedQty: "",
      purchasedQty: "",
      receivedQty: "",
      price: "",
      expiryDate: "",
      qcStatus: "ACCEPTED",
      qcNote: "",
    };
  }

  const load = useCallback(async () => {
    try {
      const [i, v, f] = await Promise.all([
        api.get(`/api/stock-manager/indents/${encodeURIComponent(brandName)}`, { params: { status: "INDENT_VERIFIED" } }),
        api.get("/api/stock-manager/vendors", { params: { status: "ACTIVE" } }),
        api.get("/api/stock-manager/qc-failures", { params: { brandName } }),
      ]);
      setIndents(i.data?.data || []);
      setVendors(v.data?.data || []);
      setFailures(f.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load GRN data"));
    }
  }, [brandName]);

  useEffect(() => {
    load();
  }, [load]);

  const pickIndent = (id) => {
    setIndentId(id);
    const ind = indents.find((x) => x._id === id);
    if (ind) {
      setLine((l) => ({
        ...l,
        itemName: ind.itemName,
        ingredientBrand: ind.ingredientBrand || "",
        uom: ind.uom || "",
        plannedQty: ind.qty ?? "",
        purchasedQty: ind.qty ?? "",
        receivedQty: ind.qty ?? "",
      }));
    }
  };

  const submit = async () => {
    if (!line.itemName.trim()) {
      toast.error("Item name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/api/stock-manager/grn", {
        indentId: indentId || undefined,
        vendorId: vendorId || undefined,
        items: [
          {
            brandName,
            itemName: line.itemName.trim(),
            ingredientBrand: line.ingredientBrand.trim(),
            uom: line.uom.trim(),
            plannedQty: Number(line.plannedQty || 0),
            purchasedQty: Number(line.purchasedQty || 0),
            receivedQty: Number(line.receivedQty || 0),
            price: Number(line.price || 0),
            expiryDate: line.expiryDate || null,
            qcStatus: line.qcStatus,
            qcNote: line.qcNote.trim(),
          },
        ],
      });
      const r = res.data?.data?.[0];
      if (r?.ok) {
        toast.success(r.credited ? "GRN recorded — stock credited" : "GRN recorded — QC failed, no stock credited");
      } else {
        toast.error(r?.error || "GRN line rejected");
      }
      setLine(blankLine());
      setIndentId("");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to record GRN"));
    } finally {
      setSaving(false);
    }
  };

  const credits = line.qcStatus === "ACCEPTED" || line.qcStatus === "PARTIAL";

  return (
    <>
      <Card title="Record GRN + Delivery QC">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <Field label="Against indent (optional)">
            <select value={indentId} onChange={(e) => pickIndent(e.target.value)} className={inputCls}>
              <option value="">— none —</option>
              {indents.map((i) => (
                <option key={i._id} value={i._id}>
                  {i.itemName} · {i.qty} {i.uom}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vendor">
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls}>
              <option value="">— select —</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.storeName || v.supplierName}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Item name">
            <input value={line.itemName} onChange={(e) => setLine({ ...line, itemName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Ingredient brand">
            <input value={line.ingredientBrand} onChange={(e) => setLine({ ...line, ingredientBrand: e.target.value })} className={inputCls} />
          </Field>
          <Field label="UOM">
            <input value={line.uom} onChange={(e) => setLine({ ...line, uom: e.target.value })} placeholder="KG/GM/L/PC" className={inputCls} />
          </Field>
          <Field label="QC status">
            <select value={line.qcStatus} onChange={(e) => setLine({ ...line, qcStatus: e.target.value })} className={inputCls}>
              {QC_OPTIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Planned qty">
            <input type="number" value={line.plannedQty} onChange={(e) => setLine({ ...line, plannedQty: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Purchased qty">
            <input type="number" value={line.purchasedQty} onChange={(e) => setLine({ ...line, purchasedQty: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Received qty">
            <input type="number" value={line.receivedQty} onChange={(e) => setLine({ ...line, receivedQty: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Price / unit">
            <input type="number" value={line.price} onChange={(e) => setLine({ ...line, price: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Expiry date">
            <input type="date" value={line.expiryDate} onChange={(e) => setLine({ ...line, expiryDate: e.target.value })} className={inputCls} />
          </Field>
          <Field label="QC note">
            <input value={line.qcNote} onChange={(e) => setLine({ ...line, qcNote: e.target.value })} className={inputCls} />
          </Field>
        </div>

        <div className="flex items-center justify-between pt-4">
          <p className="text-xs text-gray-500">
            {credits
              ? "ACCEPTED / PARTIAL credits stock to Warehouse Stock (PARTIAL credits received qty only)."
              : "SHORT / REJECTED records the failure for Head-Chef visibility — no stock credited."}
          </p>
          <button onClick={submit} disabled={saving} className={btn}>
            {saving ? "Saving…" : "Record GRN"}
          </button>
        </div>
      </Card>

      <Card title="QC Failures (visible to Head Chef)">
        {failures.length === 0 ? (
          <p className="text-sm text-gray-500">No QC failures.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Planned</th>
                <th className="py-2 pr-3">Received</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Note</th>
                <th className="py-2 pr-3">When</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={f._id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{f.itemName}</td>
                  <td className="py-2 pr-3">{f.plannedQty} {f.uom}</td>
                  <td className="py-2 pr-3">{f.receivedQty} {f.uom}</td>
                  <td className="py-2 pr-3">
                    <span className={pill("bg-red-100 text-red-700")}>{f.qcStatus}</span>
                  </td>
                  <td className="py-2 pr-3">{f.qcNote || "—"}</td>
                  <td className="py-2 pr-3">{fmtDate(f.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

/* ============================================================
 * PURCHASES LOG
 * ========================================================== */
function PurchasesView({ brandName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ itemName: "", qcStatus: "", from: "", to: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { brandName };
      Object.entries(filters).forEach(([k, v]) => {
        if (v && String(v).trim()) params[k] = v;
      });
      const res = await api.get("/api/stock-manager/purchases", { params });
      setRows(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load purchases"));
    } finally {
      setLoading(false);
    }
  }, [brandName, filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card
      title="Purchases Log"
      right={
        <button onClick={load} className={btnGhost}>
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <input placeholder="Item" value={filters.itemName} onChange={(e) => setFilters({ ...filters, itemName: e.target.value })} className={inputCls} />
        <select value={filters.qcStatus} onChange={(e) => setFilters({ ...filters, qcStatus: e.target.value })} className={inputCls}>
          <option value="">Any QC</option>
          {["ACCEPTED", "PARTIAL", "SHORT", "REJECTED"].map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={inputCls} />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={inputCls} />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No purchases.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Ing. Brand</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2 pr-3">Price</th>
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3">Expiry</th>
                <th className="py-2 pr-3">QC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{fmtDate(r.purchaseDate)}</td>
                  <td className="py-2 pr-3 font-medium">{r.itemName}</td>
                  <td className="py-2 pr-3">{r.ingredientBrand || "—"}</td>
                  <td className="py-2 pr-3">
                    {r.qtyPurchased} {r.uom}
                  </td>
                  <td className="py-2 pr-3">{money(r.pricePerUnit)}</td>
                  <td className="py-2 pr-3">{r.vendorName || "—"}</td>
                  <td className="py-2 pr-3">{fmtDate(r.expiryDate)}</td>
                  <td className="py-2 pr-3">
                    {r.qcStatus ? (
                      <span
                        className={pill(
                          r.qcStatus === "ACCEPTED"
                            ? "bg-green-100 text-green-700"
                            : r.qcStatus === "PARTIAL"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-700"
                        )}
                      >
                        {r.qcStatus}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
 * CLOSING STOCK AUDIT
 * ========================================================== */
const REASONS = ["WASTAGE", "SPOILAGE", "MISCOUNT", "THEFT", "OTHER"];
function ClosingStockView({ brandName }) {
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState(null); // { records: [...] } when locked/exists
  const [draft, setDraft] = useState([]); // editable rows when no record yet
  const [mode, setMode] = useState("view"); // view | correct
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/stock-manager/closing-stock/${encodeURIComponent(brandName)}`, { params: { date } });
      const d = res.data?.data;
      if (d?.existing) {
        setExisting(d);
        setDraft([]);
        setMode("view");
      } else {
        setExisting(null);
        setDraft(
          (d?.snapshot || []).map((s) => ({
            itemName: s.itemName,
            uom: s.uom,
            expectedQty: s.expectedQty,
            actualQty: s.actualQty ?? s.expectedQty,
            varianceReason: "",
            reasonNote: "",
          }))
        );
        setMode("view");
      }
    } catch (e) {
      toast.error(errMsg(e, "Failed to load audit"));
    } finally {
      setLoading(false);
    }
  }, [brandName, date]);

  useEffect(() => {
    load();
  }, [load]);

  const originalLocked = existing?.records?.find((r) => (r.correctionSeq || 0) === 0)?.lockedAt;

  const setRow = (idx, patch) => setDraft((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const payloadItems = (rows) =>
    rows.map((r) => ({
      itemName: r.itemName,
      uom: r.uom,
      expectedQty: Number(r.expectedQty || 0),
      actualQty: Number(r.actualQty || 0),
      varianceReason: Number(r.actualQty || 0) - Number(r.expectedQty || 0) !== 0 ? r.varianceReason : undefined,
      reasonNote: r.reasonNote,
    }));

  const saveDraft = async () => {
    setSaving(true);
    try {
      await api.post(`/api/stock-manager/closing-stock/${encodeURIComponent(brandName)}`, {
        date,
        items: payloadItems(draft),
      });
      toast.success("Draft saved");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const lockAudit = async () => {
    setSaving(true);
    try {
      // Persist current values, then lock.
      await api.post(`/api/stock-manager/closing-stock/${encodeURIComponent(brandName)}`, {
        date,
        items: payloadItems(draft),
      });
      await api.patch(`/api/stock-manager/closing-stock/${encodeURIComponent(brandName)}/lock`, { date });
      toast.success("Audit locked");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to lock"));
    } finally {
      setSaving(false);
    }
  };

  const submitCorrection = async () => {
    setSaving(true);
    try {
      await api.post(`/api/stock-manager/closing-stock/${encodeURIComponent(brandName)}/correction`, {
        date,
        items: payloadItems(draft),
      });
      toast.success("Correction recorded");
      setMode("view");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to record correction"));
    } finally {
      setSaving(false);
    }
  };

  const startCorrection = () => {
    // Seed correction rows from the latest record's variances.
    const records = existing?.records || [];
    const latest = records[records.length - 1];
    setDraft(
      (latest?.variances || []).map((v) => ({
        itemName: v.itemName,
        uom: v.uom,
        expectedQty: v.expectedQty,
        actualQty: v.actualQty,
        varianceReason: v.reason || "",
        reasonNote: v.reasonNote || "",
      }))
    );
    setMode("correct");
  };

  const renderEditable = (onSave, saveLabel, extra) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-3">Item</th>
            <th className="py-2 pr-3">Expected</th>
            <th className="py-2 pr-3">Actual</th>
            <th className="py-2 pr-3">Variance</th>
            <th className="py-2 pr-3">Reason</th>
            <th className="py-2 pr-3">Note</th>
          </tr>
        </thead>
        <tbody>
          {draft.map((r, idx) => {
            const variance = Number(r.actualQty || 0) - Number(r.expectedQty || 0);
            const needsReason = variance !== 0;
            return (
              <tr key={idx} className={`border-b last:border-0 ${needsReason ? "bg-amber-50" : ""}`}>
                <td className="py-2 pr-3 font-medium">
                  {r.itemName} <span className="text-gray-400">{r.uom}</span>
                </td>
                <td className="py-2 pr-3">{r.expectedQty}</td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    value={r.actualQty}
                    onChange={(e) => setRow(idx, { actualQty: e.target.value })}
                    className={inputCls + " w-24"}
                  />
                </td>
                <td className={`py-2 pr-3 ${variance !== 0 ? "text-amber-700 font-medium" : "text-gray-400"}`}>
                  {variance > 0 ? "+" : ""}
                  {Number(variance.toFixed(4))}
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={r.varianceReason}
                    onChange={(e) => setRow(idx, { varianceReason: e.target.value })}
                    disabled={!needsReason}
                    className={inputCls + " w-32"}
                  >
                    <option value="">{needsReason ? "Required…" : "—"}</option>
                    {REASONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={r.reasonNote}
                    onChange={(e) => setRow(idx, { reasonNote: e.target.value })}
                    disabled={!needsReason}
                    className={inputCls + " w-40"}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex justify-end gap-2 pt-4">{extra}</div>
    </div>
  );

  return (
    <Card
      title="Closing Stock Audit"
      right={
        <div className="flex gap-2 items-center">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + " w-40"} />
          <button onClick={load} className={btnGhost}>
            Load
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : existing ? (
        <>
          {/* Stacked history — original + corrections, never collapsed */}
          {(existing.records || []).map((rec) => (
            <div key={rec._id} className="mb-5 border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
                <span className="text-sm font-semibold">
                  {(rec.correctionSeq || 0) === 0 ? "Original audit" : `Correction #${rec.correctionSeq}`}
                </span>
                <span className="text-xs text-gray-500">
                  {rec.lockedAt ? `Locked ${fmtDate(rec.lockedAt)}` : "Draft (unlocked)"}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 px-4">Item</th>
                    <th className="py-2 pr-3">Expected</th>
                    <th className="py-2 pr-3">Actual</th>
                    <th className="py-2 pr-3">Variance</th>
                    <th className="py-2 pr-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(rec.variances || []).map((v, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-4 font-medium">
                        {v.itemName} <span className="text-gray-400">{v.uom}</span>
                      </td>
                      <td className="py-2 pr-3">{v.expectedQty}</td>
                      <td className="py-2 pr-3">{v.actualQty}</td>
                      <td className={`py-2 pr-3 ${v.varianceQty !== 0 ? "text-amber-700 font-medium" : "text-gray-400"}`}>
                        {v.varianceQty > 0 ? "+" : ""}
                        {v.varianceQty}
                      </td>
                      <td className="py-2 pr-3">
                        {v.reason ? (
                          <span>
                            <span className={pill("bg-amber-100 text-amber-800")}>{v.reason}</span>
                            {v.reasonNote ? <span className="text-gray-500 text-xs ml-1">{v.reasonNote}</span> : null}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {!originalLocked ? (
            <p className="text-sm text-gray-500">
              This audit is a draft. Reload to edit, or lock it from the draft view.
            </p>
          ) : mode === "correct" ? (
            renderEditable(submitCorrection, "Submit Correction", (
              <>
                <button onClick={() => setMode("view")} className={btnGhost}>
                  Cancel
                </button>
                <button onClick={submitCorrection} disabled={saving} className={btn}>
                  {saving ? "Saving…" : "Submit Correction"}
                </button>
              </>
            ))
          ) : (
            <button onClick={startCorrection} className={btnGhost}>
              + Add Correction
            </button>
          )}
        </>
      ) : draft.length === 0 ? (
        <p className="text-sm text-gray-500">No Warehouse Stock to audit for this brand.</p>
      ) : (
        renderEditable(saveDraft, "Save", (
          <>
            <button onClick={saveDraft} disabled={saving} className={btnGhost}>
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button onClick={lockAudit} disabled={saving} className={btn}>
              {saving ? "…" : "Lock Audit"}
            </button>
          </>
        ))
      )}
    </Card>
  );
}

/* ============================================================
 * REORDER INSIGHTS (derived)
 * ========================================================== */
const ADVISORY_PILL = {
  OK: pill("bg-gray-100 text-gray-600"),
  BELOW_MIN: pill("bg-red-100 text-red-700"),
  NEAR_EXPIRY: pill("bg-amber-100 text-amber-800"),
  CADENCE_DRIFT: pill("bg-blue-100 text-blue-700"),
};
function ReorderView({ brandName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/stock-manager/reorder-insights/${encodeURIComponent(brandName)}`);
      setRows(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load insights"));
    } finally {
      setLoading(false);
    }
  }, [brandName]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card
      title="Reorder Insights (advisory — does not auto-indent)"
      right={
        <button onClick={load} className={btnGhost}>
          Refresh
        </button>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No purchase history for this brand yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Last purchase</th>
                <th className="py-2 pr-3">Days since</th>
                <th className="py-2 pr-3">Avg cadence</th>
                <th className="py-2 pr-3">Current</th>
                <th className="py-2 pr-3">Min</th>
                <th className="py-2 pr-3">Stock %</th>
                <th className="py-2 pr-3">Next expiry</th>
                <th className="py-2 pr-3">Advisory</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemName} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.itemName}</td>
                  <td className="py-2 pr-3">{fmtDate(r.lastPurchaseAt)}</td>
                  <td className="py-2 pr-3">{r.daysSinceLastPurchase == null ? "—" : `${r.daysSinceLastPurchase}d`}</td>
                  <td className="py-2 pr-3">{r.avgCadenceDays == null ? "—" : `${r.avgCadenceDays}d`}</td>
                  <td className="py-2 pr-3">
                    {r.currentQty} {r.currentUom}
                  </td>
                  <td className="py-2 pr-3">{r.minStockLevel == null ? "—" : `${r.minStockLevel} ${r.minStockUom || ""}`}</td>
                  <td className="py-2 pr-3">
                    <StockPercentBar currentQty={r.currentQty} minStockLevel={r.minStockLevel} />
                  </td>
                  <td className="py-2 pr-3">{fmtDate(r.nextExpiryAt)}</td>
                  <td className="py-2 pr-3">
                    <span className={ADVISORY_PILL[r.advisory] || ADVISORY_PILL.OK}>{r.advisory.replace("_", " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
 * VENDORS (global — not brand-scoped)
 * ========================================================== */
function VendorsView() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // vendor object or {} for new

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await api.get("/api/stock-manager/vendors", { params });
      setVendors(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load vendors"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id) => {
    try {
      const res = await api.get(`/api/stock-manager/vendors/${id}`);
      setDetail(res.data?.data || null);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load vendor"));
    }
  };

  const toggleStatus = async (v) => {
    try {
      await api.patch(`/api/stock-manager/vendors/${v._id}/status`, {
        status: v.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
      toast.success("Status updated");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to update"));
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, store or email…" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <button onClick={load} className={btnGhost}>
          Refresh
        </button>
        <button onClick={() => setEditing({})} className={btn}>
          + Add Vendor
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-500 p-4">Loading…</p>
        ) : vendors.length === 0 ? (
          <p className="text-sm text-gray-500 p-4">No vendors.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-4">Supplier</th>
                <th className="py-2 pr-3">Store</th>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Last delivery</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v._id} className="border-b last:border-0">
                  <td className="py-2 px-4 font-medium">{v.supplierName}</td>
                  <td className="py-2 pr-3">{v.storeName}</td>
                  <td className="py-2 pr-3">{v.phoneNumber || "—"}</td>
                  <td className="py-2 pr-3">{fmtDate(v.lastDeliveryAt)}</td>
                  <td className="py-2 pr-3">
                    <span className={pill(v.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600")}>
                      {v.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 space-x-2">
                    <button onClick={() => openDetail(v._id)} className="text-gray-900 underline text-xs hover:text-black">
                      View
                    </button>
                    <button onClick={() => setEditing(v)} className="text-blue-600 underline text-xs">
                      Edit
                    </button>
                    <button onClick={() => toggleStatus(v)} className="text-gray-600 underline text-xs">
                      {v.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <Modal title={detail.supplierName} onClose={() => setDetail(null)}>
          <div className="text-sm space-y-1 mb-4">
            <p><span className="text-gray-500">Store:</span> {detail.storeName}</p>
            <p><span className="text-gray-500">Email:</span> {detail.email}</p>
            <p><span className="text-gray-500">Phone:</span> {detail.phoneNumber || "—"}</p>
            <p><span className="text-gray-500">FSSAI:</span> {detail.fssai || "—"}</p>
            <p><span className="text-gray-500">PAN:</span> {detail.pan || "—"}</p>
            <p><span className="text-gray-500">Status:</span> {detail.status}</p>
            <p><span className="text-gray-500">Last delivery:</span> {fmtDate(detail.lastDeliveryAt)}</p>
            {detail.notes && <p><span className="text-gray-500">Notes:</span> {detail.notes}</p>}
          </div>
          <h4 className="text-sm font-semibold mb-2">Recent purchases</h4>
          {(detail.recentPurchases || []).length === 0 ? (
            <p className="text-sm text-gray-500">None.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">Brand</th>
                  <th className="py-1 pr-2">Item</th>
                  <th className="py-1 pr-2">Qty</th>
                  <th className="py-1 pr-2">QC</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentPurchases.map((p) => (
                  <tr key={p._id} className="border-b last:border-0">
                    <td className="py-1 pr-2">{fmtDate(p.createdAt)}</td>
                    <td className="py-1 pr-2">{p.brandName}</td>
                    <td className="py-1 pr-2">{p.itemName}</td>
                    <td className="py-1 pr-2">{p.receivedQty} {p.uom}</td>
                    <td className="py-1 pr-2">{p.qcStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {editing && <VendorForm vendor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function VendorForm({ vendor, onClose, onSaved }) {
  const isNew = !vendor?._id;
  const [form, setForm] = useState({
    supplierName: vendor.supplierName || "",
    storeName: vendor.storeName || "",
    email: vendor.email || "",
    phoneNumber: vendor.phoneNumber || "",
    fssai: vendor.fssai || "",
    pan: vendor.pan || "",
    notes: vendor.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        await api.post("/api/stock-manager/vendors", form);
        toast.success("Vendor created");
      } else {
        const { email, ...editable } = form; // email is not editable
        await api.patch(`/api/stock-manager/vendors/${vendor._id}`, editable);
        toast.success("Vendor updated");
      }
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, "Failed to save vendor"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? "Add Vendor" : "Edit Vendor"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier name">
          <input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Store name">
          <input value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Email">
          <input value={form.email} disabled={!isNew} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} className={inputCls} />
        </Field>
        <Field label="FSSAI (14 digits)">
          <input value={form.fssai} onChange={(e) => setForm({ ...form, fssai: e.target.value })} className={inputCls} />
        </Field>
        <Field label="PAN">
          <input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} className={inputCls} />
        </Field>
        <div className="col-span-2">
          <Field label="Notes">
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className={btnGhost}>
          Cancel
        </button>
        <button onClick={save} disabled={saving} className={btn}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

/* ============================================================
 * VENDOR ALERTS (per-brand — renamed from "Credit Note")
 * ========================================================== */
function VendorAlertsView({ brandName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [armedId, setArmedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/stock-manager/vendor-alerts/${encodeURIComponent(brandName)}`);
      setRows(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load vendor alerts"));
    } finally {
      setLoading(false);
    }
  }, [brandName]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (id) => {
    try {
      await api.delete(`/api/stock-manager/vendor-alerts/${id}`);
      toast.success("Alert resolved");
      setArmedId(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to resolve alert"));
    }
  };

  return (
    <Card
      title="Vendor Alerts"
      right={
        <button onClick={load} className={btnGhost}>
          Refresh
        </button>
      }
    >
      <p className="text-xs text-gray-500 mb-4">
        Operational alerts raised by the Head Chef about an ingredient or vendor (for
        example, follow-up on goods rejected at Delivery QC). Resolving an alert is logged.
      </p>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No open vendor alerts for this brand.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Ingredient</th>
                <th className="py-2 pr-3">Note</th>
                <th className="py-2 pr-3">Raised by</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className={`border-b last:border-0 ${armedId === r._id ? "bg-red-50" : ""}`}>
                  <td className="py-2 pr-3 font-medium">{r.ingredientName}</td>
                  <td className="py-2 pr-3">{r.note || "—"}</td>
                  <td className="py-2 pr-3">{r.createdByRole || "—"}</td>
                  <td className="py-2 pr-3">{fmtDate(r.createdAt)}</td>
                  <td className="py-2 pr-3">
                    {armedId === r._id ? (
                      <span className="flex items-center gap-2">
                        <button onClick={() => resolve(r._id)} className={btn}>
                          Confirm resolve
                        </button>
                        <button onClick={() => setArmedId(null)} className="text-xs text-gray-500 underline">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setArmedId(r._id)} className={btnGhost}>
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
 * ALL AUDITS (top-level — cross-brand daily stock roll-up)
 * Reuses the existing GET /api/stock-updates/all (no backend change).
 * ========================================================== */
function AllAuditsView() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/stock-updates/all");
      setRecords(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load audits"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = records.filter(
    (r) =>
      !search ||
      r.brandName?.toLowerCase().includes(search.toLowerCase()) ||
      r.date?.includes(search)
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Card
        title="All Audits — Daily Stock (all brands)"
        right={
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Brand or date (YYYY-MM-DD)"
              className={inputCls + " w-56"}
            />
            <button onClick={load} className={btnGhost}>
              Refresh
            </button>
          </div>
        }
      >
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500">No stock records found.</p>
        ) : (
          filtered.map((record) => (
            <div key={record._id} className="border border-gray-200 rounded-xl mb-3 overflow-hidden">
              <button
                type="button"
                className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                onClick={() => setExpandedId(expandedId === record._id ? null : record._id)}
              >
                <div className="flex gap-6 text-sm">
                  <span className="font-semibold">{record.brandName}</span>
                  <span className="text-gray-500">{record.date}</span>
                  <span className="text-gray-400">{record.items?.length || 0} items</span>
                </div>
                <span className="text-gray-400 text-xs">{expandedId === record._id ? "▲" : "▼"}</span>
              </button>
              {expandedId === record._id && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr className="text-left">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">UOM</th>
                        <th className="px-3 py-2 text-right">Issue</th>
                        <th className="px-3 py-2 text-right">Used</th>
                        <th className="px-3 py-2 text-right">Wastage</th>
                        <th className="px-3 py-2 text-right">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(record.items || []).map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2">{item.itemName}</td>
                          <td className="px-3 py-2">{item.uom}</td>
                          <td className="px-3 py-2 text-right">{item.issueQty}</td>
                          <td className="px-3 py-2 text-right">{item.usedQty}</td>
                          <td className="px-3 py-2 text-right">{item.wastageQty}</td>
                          <td className="px-3 py-2 text-right font-medium">{item.remainingQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

/* ---------- tiny helpers ---------- */
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
