import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../utils/api";
import { authUtils } from "../utils/auth";
import toast from "../utils/toast";
import FcrIterationTimeline from "../components/FcrIterationTimeline";
import Footer from "../components/Footer";

/* ============================================================
 * POC Dashboard (Dashboard #2 of 6)
 * Skope-internal. Two POCs share this one login and manage EVERY client.
 * Money is FROZEN — this UI renders NO wallet/balance/GST. Invoices are
 * trigger-only records.
 * ========================================================== */

const BRANCH_DISPLAY = {
  JPNAGAR: "Main Kitchen",
  TESTBRANCH: "Test Branch",
  MARATHAHALLI: "Marathahalli",
  KALYANNAGAR: "Kalyan Nagar",
  JAYANAGAR: "Jayanagar",
};
const KNOWN_BRANCHES = Object.keys(BRANCH_DISPLAY);

const STAGE_LABEL = {
  AWAITING_MENU: "Awaiting Menu",
  IN_TRIAL: "In Trial",
  LIVE: "Live",
};
const STAGE_COLOR = {
  AWAITING_MENU: "bg-gray-100 text-gray-700",
  IN_TRIAL: "bg-amber-100 text-amber-800",
  LIVE: "bg-green-100 text-green-800",
};

const today = () => new Date().toISOString().slice(0, 10);
const errMsg = (e, fallback) => e?.response?.data?.message || fallback;

const WORKSPACE_ITEMS = [
  { key: "onboarding", label: "Onboarding Status" },
  { key: "dailyStock", label: "Daily Stock" },
  { key: "fcr", label: "Food Cost / FCR" },
  { key: "sop", label: "SOP Documents" },
  { key: "procurement", label: "Procurement" },
  { key: "branches", label: "Branch Assignment" },
  { key: "invoicing", label: "Invoicing" },
  { key: "menuProj", label: "Menu & Projections" },
  { key: "settings", label: "Client Settings" },
];

/* ---------- small shared UI ---------- */
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

/* ============================================================
 * MAIN
 * ========================================================== */
export default function PocDashboard() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);

  const [collapsed, setCollapsed] = useState(false);
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");

  const [selected, setSelected] = useState(null); // client header object
  const [activeView, setActiveView] = useState("onboarding");

  // Role gate
  useEffect(() => {
    if (authUtils.getRole() !== "POC") {
      navigate("/login");
      return;
    }
    setAuthorized(true);
  }, [navigate]);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (stageFilter) params.stage = stageFilter;
      const res = await api.get("/api/poc/clients", { params });
      setClients(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load clients"));
    } finally {
      setLoadingClients(false);
    }
  }, [search, stageFilter]);

  useEffect(() => {
    if (authorized) loadClients();
  }, [authorized, loadClients]);

  const openClient = async (clientId) => {
    try {
      const res = await api.get(`/api/poc/clients/${clientId}`);
      setSelected(res.data);
      setActiveView("onboarding");
    } catch (e) {
      toast.error(errMsg(e, "Failed to open client"));
    }
  };

  const refreshHeader = async () => {
    if (!selected) return;
    try {
      const res = await api.get(`/api/poc/clients/${selected.clientId}`);
      setSelected(res.data);
    } catch {
      /* non-fatal */
    }
  };

  const logout = () => {
    authUtils.clearAuth();
    navigate("/login");
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

      {/* Sub-header — title below the logo, ← Clients back button when a client is open */}
      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          {selected && (
            <button onClick={() => setSelected(null)} className={btnGhost}>
              ← Clients
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">POC Dashboard</h1>
            {selected && <p className="text-sm text-gray-500">{selected.brandName}</p>}
          </div>
        </div>
      </div>

      {/* min-h-screen keeps the content region at least one full viewport tall so
          the footer always sits below the fold — only visible after scrolling. */}
      <div className="flex-1 min-h-screen">
        {!selected ? (
          <ClientList
            clients={clients}
            loading={loadingClients}
            search={search}
            setSearch={setSearch}
            stageFilter={stageFilter}
            setStageFilter={setStageFilter}
            onReload={loadClients}
            onOpen={openClient}
          />
        ) : (
          <div className="flex">
            {/* Workspace drawer */}
            <aside
              className={`${
                collapsed ? "w-16" : "w-60"
              } shrink-0 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] transition-all`}
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
                      activeView === it.key
                        ? "bg-gray-100 font-semibold text-gray-900"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    title={it.label}
                  >
                    {collapsed ? it.label.charAt(0) : it.label}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Workspace content */}
            <main className="flex-1 p-6 max-w-5xl">
              <WorkspaceHeader client={selected} />
              {activeView === "onboarding" && (
                <OnboardingView clientId={selected.clientId} onChange={refreshHeader} />
              )}
              {activeView === "dailyStock" && <DailyStockView clientId={selected.clientId} />}
              {activeView === "fcr" && (
                <FcrView clientId={selected.clientId} client={selected} />
              )}
              {activeView === "sop" && <SopView clientId={selected.clientId} />}
              {activeView === "procurement" && (
                <ProcurementView clientId={selected.clientId} onChange={refreshHeader} />
              )}
              {activeView === "branches" && (
                <BranchesView client={selected} onChange={refreshHeader} />
              )}
              {activeView === "invoicing" && (
                <InvoicingView clientId={selected.clientId} client={selected} />
              )}
              {activeView === "menuProj" && <MenuProjView clientId={selected.clientId} />}
              {activeView === "settings" && (
                <SettingsView client={selected} onChange={refreshHeader} />
              )}
            </main>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

/* ============================================================
 * HOME — Client List
 * ========================================================== */
function ClientList({ clients, loading, search, setSearch, stageFilter, setStageFilter, onReload, onOpen }) {
  return (
    <div className="p-6">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Brand, company or email…"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Stage</label>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">All</option>
            <option value="AWAITING_MENU">Awaiting Menu</option>
            <option value="IN_TRIAL">In Trial</option>
            <option value="LIVE">Live</option>
          </select>
        </div>
        <button onClick={onReload} className={btnGhost}>
          Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Onboarding</th>
              <th className="px-4 py-3">Branches</th>
              <th className="px-4 py-3">Type</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No clients found.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr
                  key={c.clientId}
                  onClick={() => onOpen(c.clientId)}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {c.logoUrl ? (
                        <img src={c.logoUrl} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-semibold">
                          {(c.brandName || "?")[0]}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">{c.brandName}</div>
                        <div className="text-xs text-gray-500">{c.company}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${STAGE_COLOR[c.lifecycleStage] || ""}`}>
                      {STAGE_LABEL[c.lifecycleStage] || c.lifecycleStage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gray-800 h-2 rounded-full"
                          style={{ width: `${c.onboardingPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{c.onboardingPercent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {(c.assignedBranches || []).map((b) => BRANCH_DISPLAY[b] || b).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded text-xs bg-slate-100 text-slate-700">
                      {c.clientType}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
 * Workspace header
 * ========================================================== */
function WorkspaceHeader({ client }) {
  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-4">
        {client.logoUrl ? (
          <img src={client.logoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center text-lg font-semibold">
            {(client.brandName || "?")[0]}
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-gray-900">{client.brandName}</h2>
          <p className="text-sm text-gray-500">
            {client.company} · {client.email} · {client.mobile || "no phone"}
          </p>
        </div>
        <div className="ml-auto text-right">
          <span className={`px-2 py-1 rounded text-xs ${STAGE_COLOR[client.lifecycleStage] || ""}`}>
            {STAGE_LABEL[client.lifecycleStage] || client.lifecycleStage}
          </span>
          <div className="text-xs text-gray-500 mt-1">
            Onboarding {client.onboarding?.percent ?? 0}% · {client.clientType}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * 1. Onboarding
 * ========================================================== */
function OnboardingView({ clientId, onChange }) {
  const [data, setData] = useState({ tasks: [], percent: 0, lifecycleStage: "" });
  const [busy, setBusy] = useState("");
  const [confirmRemove, setConfirmRemove] = useState("");
  const [newTaskName, setNewTaskName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/poc/clients/${clientId}/onboarding`);
      setData(res.data);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load onboarding"));
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset any pending remove-confirmation whenever the client changes.
  useEffect(() => {
    setConfirmRemove("");
    setNewTaskName("");
  }, [clientId]);

  const toggle = async (taskName, status) => {
    setBusy(taskName);
    try {
      await api.patch(`/api/poc/clients/${clientId}/onboarding-task`, { taskName, status });
      await load();
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e, "Failed to update task"));
    } finally {
      setBusy("");
    }
  };

  const addTask = async () => {
    const name = newTaskName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await api.post(`/api/poc/clients/${clientId}/onboarding-task`, { taskName: name });
      setNewTaskName("");
      await load();
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e, "Failed to add task"));
    } finally {
      setAdding(false);
    }
  };

  // Click-twice pattern: first click on the X arms removal for that task and
  // shows a "Click again to remove" warning; a second click on the SAME task
  // actually deletes it. Clicking any other task's X (or re-toggling status)
  // resets the armed state instead of accidentally deleting the wrong row.
  const handleRemoveClick = async (taskName) => {
    if (confirmRemove !== taskName) {
      setConfirmRemove(taskName);
      return;
    }
    setConfirmRemove("");
    setBusy(taskName);
    try {
      await api.delete(`/api/poc/clients/${clientId}/onboarding-task`, { data: { taskName } });
      await load();
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e, "Failed to remove task"));
    } finally {
      setBusy("");
    }
  };

  return (
    <Card
      title="Onboarding Status"
      right={<span className="text-sm text-gray-500">{data.percent}% complete</span>}
    >
      <div className="space-y-2">
        {data.tasks.map((t) => {
          const done = t.status === "COMPLETED";
          const armed = confirmRemove === t.taskName;
          return (
            <div
              key={t.taskName}
              className={`flex items-center justify-between border rounded-lg px-4 py-3 ${
                armed ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={done ? "text-green-600" : "text-gray-400"}>
                  {done ? "✓" : "○"}
                </span>
                <span className={done ? "line-through text-gray-400" : "text-gray-900"}>{t.taskName}</span>
                {armed && <span className="text-xs text-red-600">Click ✕ again to remove permanently</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={busy === t.taskName}
                  onClick={() => {
                    setConfirmRemove("");
                    toggle(t.taskName, done ? "PENDING" : "COMPLETED");
                  }}
                  className={btnGhost}
                >
                  {done ? "Mark Pending" : "Mark Completed"}
                </button>
                <button
                  disabled={busy === t.taskName}
                  onClick={() => handleRemoveClick(t.taskName)}
                  title="Remove task"
                  className={`px-2 py-1 rounded text-sm font-medium ${
                    armed ? "bg-red-600 text-white hover:bg-red-700" : "text-gray-400 hover:text-red-500"
                  }`}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        {data.tasks.length === 0 && (
          <p className="text-gray-400 text-sm">No checklist yet.</p>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
        <input
          type="text"
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTask();
          }}
          placeholder="New task name…"
          className={`${inputCls} flex-1`}
        />
        <button
          disabled={adding || !newTaskName.trim()}
          onClick={addTask}
          className={btn}
        >
          {adding ? "Adding…" : "Add Task"}
        </button>
      </div>
    </Card>
  );
}

/* ============================================================
 * 2. Daily Stock (brand-wide)
 * ========================================================== */
const emptyStockRow = () => ({
  itemName: "",
  uom: "GM",
  issueQty: 0,
  usedQty: 0,
  wastageQty: 0,
  remainingQty: 0,
});

function DailyStockView({ clientId }) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState([emptyStockRow()]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/poc/clients/${clientId}/daily-stock`);
      setHistory(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load stock history"));
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const setCell = (i, field, value) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/api/poc/clients/${clientId}/daily-stock`, { date, items: rows });
      toast.success("Daily stock saved");
      setRows([emptyStockRow()]);
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to save daily stock"));
    } finally {
      setSaving(false);
    }
  };

  const numFields = ["issueQty", "usedQty", "wastageQty", "remainingQty"];

  return (
    <>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
        Shown brand-wide (daily stock is not branch-specific).
      </p>
      <Card
        title="Enter Daily Stock"
        right={
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900" />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2">UOM</th>
                <th className="py-2 pr-2">Issue</th>
                <th className="py-2 pr-2">Used</th>
                <th className="py-2 pr-2">Wastage</th>
                <th className="py-2 pr-2">Remaining</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="pr-2 py-1">
                    <input value={r.itemName} onChange={(e) => setCell(i, "itemName", e.target.value)} className={inputCls} />
                  </td>
                  <td className="pr-2 py-1">
                    <select value={r.uom} onChange={(e) => setCell(i, "uom", e.target.value)} className={inputCls}>
                      <option>GM</option>
                      <option>KG</option>
                      <option>PC</option>
                      <option>ML</option>
                      <option>L</option>
                    </select>
                  </td>
                  {numFields.map((f) => (
                    <td key={f} className="pr-2 py-1">
                      <input
                        type="number"
                        min="0"
                        value={r[f]}
                        onChange={(e) => setCell(i, f, e.target.value)}
                        className={inputCls}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                      className="text-gray-400 hover:text-red-500 px-2"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={() => setRows((rs) => [...rs, emptyStockRow()])} className={btnGhost}>
            + Add row
          </button>
          <button onClick={save} disabled={saving} className={btn}>
            {saving ? "Saving…" : "Save Daily Stock"}
          </button>
        </div>
      </Card>

      <Card title="Recent Daily Stock">
        {history.length === 0 ? (
          <p className="text-gray-400 text-sm">No entries yet.</p>
        ) : (
          history.map((h) => (
            <div key={h._id} className="mb-3 border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-medium mb-1 text-gray-900">{h.date}</div>
              <div className="text-xs text-gray-500">
                {(h.items || []).map((it) => `${it.itemName} (${it.remainingQty}${it.uom})`).join(", ")}
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

/* ============================================================
 * 3. FCR (brand-scoped + phase-scoped)
 * ========================================================== */
const ITERATION_LABEL = (it) => (it.phase === "FINAL" ? "Final Recipe" : it.code || it.phase);

function FcrView({ clientId, client }) {
  const [dishes, setDishes] = useState([]);
  const [loadingDishes, setLoadingDishes] = useState(true);
  const [selectedDish, setSelectedDish] = useState("");
  const [selectedIterKey, setSelectedIterKey] = useState("");
  const [edits, setEdits] = useState({}); // key -> {unitPrice, yieldPercent}
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadingDishes(true);
    try {
      const res = await api.get(`/api/poc/clients/${clientId}/fcr-summary`);
      setDishes(res.data?.dishes || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load FCR data"));
    } finally {
      setLoadingDishes(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const dish = dishes.find((d) => d.recipeName === selectedDish);
  const iteration = dish?.iterations.find((it) => `${it.phase}-${it.code || "FINAL"}` === selectedIterKey);

  const phaseOfSelected = iteration?.phase;
  const procMode = phaseOfSelected ? client?.procurement?.[phaseOfSelected.toLowerCase()]?.mode : null;
  const listSent = phaseOfSelected ? client?.procurement?.[phaseOfSelected.toLowerCase()]?.listSentAt : null;
  const blocked = procMode === "CLIENT_PROCURES" && !listSent;

  const keyOf = (it) => `${it.source || "ITERATION"}||${it.subRecipeName || ""}||${it.itemName}||${it.uom}`;
  const setEdit = (row, field, value) =>
    setEdits((e) => ({
      ...e,
      [keyOf(row)]: {
        unitPrice: field === "unitPrice" ? value : e[keyOf(row)]?.unitPrice ?? row.unitPrice,
        yieldPercent: field === "yieldPercent" ? value : e[keyOf(row)]?.yieldPercent ?? row.yieldPercent,
      },
    }));

  const changedKeys = Object.keys(edits);

  // Save = "persist my edits" only. Saving does NOT confirm/un-confirm or
  // make anything client-visible — that is Confirm's job (below). Only rows
  // actually touched (present in `edits`) are sent.
  const saveAll = async () => {
    if (!dish || !iteration || changedKeys.length === 0) return;
    const rows = (iteration.editableIngredients || []).filter((r) => edits[keyOf(r)]);
    setSaving(true);
    try {
      const results = await Promise.allSettled(
        rows.map((row) => {
          const k = keyOf(row);
          const unitPrice = Number(edits[k]?.unitPrice ?? row.unitPrice ?? 0);
          const yieldPercent = Number(edits[k]?.yieldPercent ?? row.yieldPercent ?? 100);
          return api.post(`/api/poc/clients/${clientId}/fcr-item`, {
            phase: iteration.phase,
            recipeName: dish.recipeName,
            code: iteration.code || undefined,
            refId: row.itemName,
            uom: row.uom,
            unitPrice,
            yieldPercent,
            source: row.source || "ITERATION",
            subRecipeName: row.subRecipeName || undefined,
            subRecipeBrand: row.subRecipeBrand || undefined,
          });
        })
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) {
        toast.success(`Saved ${rows.length} price${rows.length === 1 ? "" : "s"}. Re-confirm this iteration if it was confirmed.`);
      } else {
        toast.error(`${failed} of ${rows.length} prices failed to save — re-check and try again.`);
      }
      setEdits({});
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleConfirm = async (d, it) => {
    try {
      await api.patch(`/api/poc/clients/${clientId}/fcr-confirm`, {
        recipeName: d.recipeName,
        phase: it.phase,
        code: it.code,
        confirmed: !it.confirmed,
      });
      toast.success(it.confirmed ? "Un-confirmed" : "Confirmed — now visible to the client");
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to update confirmation"));
    }
  };

  return (
    <>
      <Card title="Iteration Timeline (all iterations, confirmed and pending)">
        {loadingDishes ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : (
          <FcrIterationTimeline dishes={dishes} showConfirmation onToggleConfirm={toggleConfirm} />
        )}
      </Card>

      <Card title="Edit Iteration Price">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <select
            value={selectedDish}
            onChange={(e) => {
              setSelectedDish(e.target.value);
              setSelectedIterKey("");
            }}
            className={`${inputCls} w-56`}
          >
            <option value="">Select dish…</option>
            {dishes.map((d) => (
              <option key={d.recipeName} value={d.recipeName}>
                {d.recipeName}
              </option>
            ))}
          </select>
          <select
            value={selectedIterKey}
            onChange={(e) => setSelectedIterKey(e.target.value)}
            disabled={!dish}
            className={`${inputCls} w-44`}
          >
            <option value="">Select iteration…</option>
            {dish?.iterations.map((it) => {
              const k = `${it.phase}-${it.code || "FINAL"}`;
              return (
                <option key={k} value={k}>
                  {ITERATION_LABEL(it)}
                </option>
              );
            })}
          </select>
        </div>

        {blocked && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-4 text-sm">
            This phase is set to <b>CLIENT_PROCURES</b>. Send the ingredient list to the client
            first (Procurement tab), then enter prices after they purchase.
          </div>
        )}

        {iteration && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              Net price = unit price ÷ (yield% ÷ 100). You price individual ingredients only — a
              sub-recipe's cost rolls up automatically from its own ingredients' prices (the "From"
              column shows which sub-recipe an ingredient belongs to, if any). Direct-ingredient
              edits write ONLY this iteration's recipe document; sub-recipe-ingredient edits write
              the shared sub-recipe (used by every dish/iteration that includes it). If this
              iteration was already confirmed, it will auto-un-confirm and the client won't see it
              until you re-confirm.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-left">
                  <tr>
                    <th className="py-2 pr-2">Ingredient</th>
                    <th className="py-2 pr-2">From</th>
                    <th className="py-2 pr-2">Spec</th>
                    <th className="py-2 pr-2">UOM</th>
                    <th className="py-2 pr-2">Unit Price</th>
                    <th className="py-2 pr-2">Yield %</th>
                    <th className="py-2 pr-2">Net Price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(iteration.editableIngredients || []).map((row) => {
                    const k = keyOf(row);
                    const isChanged = Boolean(edits[k]);
                    const up = Number(edits[k]?.unitPrice ?? row.unitPrice ?? 0);
                    const yp = Number(edits[k]?.yieldPercent ?? row.yieldPercent ?? 100);
                    const net = yp > 0 ? (up / (yp / 100)).toFixed(2) : up.toFixed(2);
                    return (
                      <tr key={k} className={`border-t border-gray-100 ${isChanged ? "bg-amber-50" : ""}`}>
                        <td className="py-2 pr-2 text-gray-900">{row.itemName}</td>
                        <td className="py-2 pr-2 text-gray-500">
                          {row.source === "SUBRECIPE" ? (
                            <span className="text-xs">{row.subRecipeName} (sub-recipe)</span>
                          ) : (
                            <span className="text-xs text-gray-400">Direct</span>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-gray-500">{row.specification || "—"}</td>
                        <td className="py-2 pr-2 text-gray-700">{row.uom}</td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            disabled={blocked || saving}
                            value={up}
                            onChange={(e) => setEdit(row, "unitPrice", e.target.value)}
                            className={`${inputCls} w-28`}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="1"
                            disabled={blocked || saving}
                            value={yp}
                            onChange={(e) => setEdit(row, "yieldPercent", e.target.value)}
                            className={`${inputCls} w-20`}
                          />
                        </td>
                        <td className="py-2 pr-2 text-gray-700">₹{net}</td>
                        <td className="py-2 pr-2 text-xs">
                          {isChanged && <span className="text-amber-600 font-medium">● Unsaved</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {(iteration.editableIngredients || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-gray-400">
                        No ingredients on this iteration.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 mt-4">
              <span
                className={`text-xs px-2 py-1 rounded ${
                  iteration.confirmed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {iteration.confirmed ? "✓ Confirmed — visible to client" : "Pending — not visible to client"}
              </span>
              {changedKeys.length > 0 && (
                <span className="text-xs text-amber-600">
                  {changedKeys.length} unsaved change{changedKeys.length === 1 ? "" : "s"}
                </span>
              )}
              <button
                disabled={blocked || saving}
                onClick={saveAll}
                className="bg-black text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button
                disabled={blocked || saving || changedKeys.length > 0}
                onClick={() => toggleConfirm(dish, iteration)}
                title={changedKeys.length > 0 ? "Save your changes before confirming" : ""}
                className={`px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                  iteration.confirmed
                    ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {iteration.confirmed ? "Un-confirm" : "✓ Confirm " + ITERATION_LABEL(iteration)}
              </button>
            </div>
          </>
        )}

        {!iteration && <p className="text-gray-400 text-sm">Select a dish and iteration above to edit prices.</p>}
      </Card>
    </>
  );
}

/* ============================================================
 * 4. SOP
 * ========================================================== */
function SopView({ clientId }) {
  const [docs, setDocs] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/poc/clients/${clientId}/sop`);
      setDocs(res.data?.documents?.length ? res.data.documents : [{ title: "", link: "" }]);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load SOP"));
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const setCell = (i, field, value) =>
    setDocs((d) => d.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const save = async () => {
    setSaving(true);
    try {
      const cleaned = docs.filter((d) => d.title.trim() && d.link.trim());
      const res = await api.post(`/api/poc/clients/${clientId}/sop`, { documents: cleaned });
      setDocs(res.data?.documents?.length ? res.data.documents : [{ title: "", link: "" }]);
      toast.success("SOP documents saved");
    } catch (e) {
      toast.error(errMsg(e, "Failed to save SOP"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="SOP Documents (links only)">
      <p className="text-xs text-gray-500 mb-3">SOPs are typically created during the training phase.</p>
      <div className="space-y-3">
        {docs.map((d, i) => (
          <div key={i} className="flex gap-2">
            <input
              placeholder="Title"
              value={d.title}
              onChange={(e) => setCell(i, "title", e.target.value)}
              className={`${inputCls} w-1/3`}
            />
            <input
              placeholder="https://…"
              value={d.link}
              onChange={(e) => setCell(i, "link", e.target.value)}
              className={inputCls}
            />
            <button
              onClick={() => setDocs((arr) => arr.filter((_, idx) => idx !== i))}
              className="text-gray-400 hover:text-red-500 px-2"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={() => setDocs((d) => [...d, { title: "", link: "" }])} className={btnGhost}>
          + Add document
        </button>
        <button onClick={save} disabled={saving} className={btn}>
          {saving ? "Saving…" : "Save SOP"}
        </button>
      </div>
    </Card>
  );
}

/* ============================================================
 * 5. Procurement
 * ========================================================== */
function ProcurementView({ clientId, onChange }) {
  const [phase, setPhase] = useState("TRIAL");
  const [info, setInfo] = useState({ mode: "SKOPE_PROCURES", listSentAt: null, items: [] });
  const [busy, setBusy] = useState(false);
  // Additive: ingredient lists sent by the Head Chef awaiting POC action.
  const [kitchenLists, setKitchenLists] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/poc/clients/${clientId}/procurement-list`, { params: { phase } });
      setInfo(res.data);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load procurement"));
    }
  }, [clientId, phase]);

  const loadKitchenLists = useCallback(async () => {
    try {
      const res = await api.get(`/api/poc/clients/${clientId}/ingredient-lists`, { params: { status: "PENDING" } });
      setKitchenLists(res.data?.data || []);
    } catch {
      /* non-blocking — panel just stays empty */
    }
  }, [clientId]);

  const acknowledgeKitchenList = async (listId) => {
    try {
      await api.patch(`/api/poc/clients/${clientId}/ingredient-lists/${listId}/acknowledge`);
      toast.success("Marked as seen");
      loadKitchenLists();
    } catch (e) {
      toast.error(errMsg(e, "Failed to acknowledge"));
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadKitchenLists();
  }, [loadKitchenLists]);

  const setMode = async (mode) => {
    setBusy(true);
    try {
      await api.patch(`/api/poc/clients/${clientId}/procurement-mode`, { phase, mode });
      await load();
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e, "Failed to set mode"));
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/poc/clients/${clientId}/procurement-list`, { phase });
      if (!res.data?.sent) toast.info(res.data?.message || "Nothing to send.");
      else toast.success("Ingredient list generated & marked sent");
      await load();
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e, "Failed to generate list"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {kitchenLists.length > 0 && (
        <Card title={`Ingredient lists from kitchen (${kitchenLists.length})`}>
          <p className="text-sm text-gray-500 mb-3">
            The Head Chef sent these from a trial/training recipe. Review, then decide who procures below.
          </p>
          {kitchenLists.map((l) => (
            <div key={l._id} className="border border-gray-200 rounded-lg p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  {l.phase} {l.code}{l.recipeName ? ` — ${l.recipeName}` : ""}{" "}
                  <span className="text-xs text-gray-400">({(l.items || []).length} items · {new Date(l.sentAt).toLocaleDateString()})</span>
                </span>
                <button onClick={() => acknowledgeKitchenList(l._id)} className={btnGhost}>
                  Mark seen
                </button>
              </div>
              <div className="text-xs text-gray-600">
                {(l.items || []).map((it) => `${it.itemName} ${it.qty}${it.uom}`).join(" · ")}
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-gray-500">Phase:</span>
        {["TRIAL", "TRAINING"].map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className={`px-3 py-1.5 rounded-lg text-sm ${phase === p ? "bg-black text-white" : btnGhost}`}
          >
            {p}
          </button>
        ))}
      </div>

      <Card title={`Procurement — ${phase}`}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-500">Who procures:</span>
          {["SKOPE_PROCURES", "CLIENT_PROCURES"].map((m) => (
            <button
              key={m}
              disabled={busy}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-sm ${info.mode === m ? "bg-black text-white" : btnGhost}`}
            >
              {m === "SKOPE_PROCURES" ? "Skope buys" : "Client buys"}
            </button>
          ))}
        </div>

        <button onClick={generate} disabled={busy} className={btn}>
          Generate & send ingredient list
        </button>
        {info.listSentAt && (
          <span className="text-xs text-gray-500 ml-3">
            Sent {new Date(info.listSentAt).toLocaleString()}
          </span>
        )}

        <div className="mt-4">
          {(info.items || []).length === 0 ? (
            <p className="text-gray-400 text-sm">No list generated yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-left">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">UOM</th>
                </tr>
              </thead>
              <tbody>
                {info.items.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 text-gray-900">{it.itemName}</td>
                    <td className="py-2 text-gray-700">{it.qty}</td>
                    <td className="py-2 text-gray-700">{it.uom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  );
}

/* ============================================================
 * 6. Branch Assignment
 * ========================================================== */
function BranchesView({ client, onChange }) {
  const initial = (client.assignedBranches || []).map((b) => b.branchCode);
  const [selected, setSelected] = useState(initial);
  const [saving, setSaving] = useState(false);

  const toggle = (code) =>
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  const save = async () => {
    if (selected.length === 0) {
      toast.error("Select at least one branch");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/poc/clients/${client.clientId}/branches`, { assignedBranches: selected });
      toast.success("Branches updated");
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e, "Failed to update branches"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Branch Assignment">
      <div className="space-y-2 mb-4">
        {KNOWN_BRANCHES.map((code) => (
          <label key={code} className="flex items-center gap-3 text-sm text-gray-900">
            <input type="checkbox" checked={selected.includes(code)} onChange={() => toggle(code)} />
            <span>{BRANCH_DISPLAY[code]}</span>
            <span className="text-gray-400 text-xs">({code})</span>
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving} className={btn}>
        {saving ? "Saving…" : "Save Branches"}
      </button>
    </Card>
  );
}

/* ============================================================
 * 7. Invoicing (trigger only)
 * ========================================================== */
function InvoicingView({ clientId, client }) {
  const [type, setType] = useState("ONBOARDING");
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(false);

  const branches = client.assignedBranches || [];

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/poc/clients/${clientId}/invoices`);
      setList(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load invoices"));
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const onUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post(`/api/poc/clients/${clientId}/invoice-attachment`, form, {
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

  const raise = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/poc/clients/${clientId}/invoice`, {
        type,
        amount: amt,
        commission: Number(commission || 0),
        notes: notes || undefined,
        branchCode: branchCode || undefined,
        attachmentUrl: attachmentUrl || undefined,
        attachmentName: attachmentName || undefined,
      });
      toast.success("Invoice raised — client notified");
      setAmount("");
      setCommission("");
      setNotes("");
      setAttachmentUrl("");
      setAttachmentName("");
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to raise invoice"));
    } finally {
      setSaving(false);
    }
  };

  const total = Number(amount || 0) + Number(commission || 0);

  return (
    <>
      <Card title="Raise Invoice">
        {/* Header section */}
        <div className="mb-3 text-sm text-gray-700">
          Brand: <span className="font-semibold">{client.brandName}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Invoice type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              <option value="ONBOARDING">Onboarding</option>
              <option value="PROCUREMENT">Procurement</option>
              <option value="SUBSCRIPTION">Subscription</option>
              <option value="REIMBURSEMENT">Reimbursement</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Branch (optional)</label>
            <select value={branchCode} onChange={(e) => setBranchCode(e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {branches.map((b) => (
                <option key={b.branchCode} value={b.branchCode}>
                  {b.displayName}
                </option>
              ))}
            </select>
          </div>
          <div />
          {/* Line items */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Amount (₹)</label>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Commission (₹, default 0)</label>
            <input
              type="number"
              min="0"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-end">
            <div className="text-sm text-gray-700">
              Total payable: <span className="font-semibold">₹{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="e.g. Q1 subscription + service fee"
          />
        </div>

        {/* Attachment */}
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">Attachment (PDF / DOC / DOCX)</label>
          {attachmentUrl ? (
            <div className="flex items-center gap-2 text-sm">
              <a href={attachmentUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                {attachmentName || "attachment"}
              </a>
              <button
                type="button"
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
          {uploading && <p className="text-xs text-gray-400 mt-1">Uploading…</p>}
        </div>

        {/* Price-confirmation guardrail */}
        <div className="mt-4 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
          ⚠ Ensure prices are confirmed before raising the invoice. Once paid, supplementary invoices may be needed
          for price differences.
        </div>

        <div className="mt-3">
          <button onClick={raise} disabled={saving || !(Number(amount) > 0)} className={btn}>
            {saving ? "…" : "Raise Invoice"}
          </button>
        </div>
      </Card>

      <Card title="Invoices">
        {list.length === 0 ? (
          <p className="text-gray-400 text-sm">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-2">Type</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Commission</th>
                <th className="py-2">Total</th>
                <th className="py-2">Status</th>
                <th className="py-2">Paid</th>
                <th className="py-2">Attachment</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-900">
                    {inv.type}
                    {inv.parentInvoiceId && <span className="ml-1 text-xs text-purple-600">(suppl.)</span>}
                  </td>
                  <td className="py-2 text-gray-700">₹{Number(inv.amount).toFixed(2)}</td>
                  <td className="py-2 text-gray-700">
                    {Number(inv.commission) > 0 ? `₹${Number(inv.commission).toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 text-gray-900 font-medium">₹{Number(inv.total).toFixed(2)}</td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        inv.status === "PAID" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-2 text-gray-400">
                    {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    {inv.attachmentUrl ? (
                      <a href={inv.attachmentUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                        {inv.attachmentName || "view"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-gray-500 max-w-[180px] truncate" title={inv.notes || ""}>
                    {inv.notes || "—"}
                  </td>
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
 * 8. Menu & Projections (view-only)
 * ========================================================== */
function MenuProjView({ clientId }) {
  const [menu, setMenu] = useState([]);
  const [projections, setProjections] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [m, p] = await Promise.all([
          api.get(`/api/poc/clients/${clientId}/menu`),
          api.get(`/api/poc/clients/${clientId}/projections`),
        ]);
        setMenu(m.data?.data || []);
        setProjections(p.data?.data || []);
      } catch (e) {
        toast.error(errMsg(e, "Failed to load menu/projections"));
      }
    })();
  }, [clientId]);

  return (
    <>
      <Card title="Submitted Menu (read-only)">
        {menu.length === 0 ? (
          <p className="text-gray-400 text-sm">No menu submitted.</p>
        ) : (
          menu.map((m) => (
            <div key={m._id} className="mb-3 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">
                {m.branchCode} · {new Date(m.createdAt).toLocaleDateString()}
              </div>
              <div className="text-sm text-gray-700">
                {(m.items || []).map((it) => `${it.recipeName} (${it.qty}${it.uom})`).join(", ")}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card title="Projections (read-only)">
        {projections.length === 0 ? (
          <p className="text-gray-400 text-sm">No projections.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="py-2">For Date</th>
                <th className="py-2">Type</th>
                <th className="py-2">Branch</th>
                <th className="py-2">Status</th>
                <th className="py-2">Items</th>
              </tr>
            </thead>
            <tbody>
              {projections.map((p) => (
                <tr key={p._id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-900">{p.forDate ? new Date(p.forDate).toLocaleDateString() : "—"}</td>
                  <td className="py-2 text-gray-700">{p.type}</td>
                  <td className="py-2 text-gray-700">{p.branchCode}</td>
                  <td className="py-2 text-gray-700">{p.status}</td>
                  <td className="py-2 text-gray-500">
                    {(p.items || []).map((it) => `${it.recipeName} (${it.targetQty})`).join(", ")}
                  </td>
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
 * 9. Client Settings (clientType + go-live)
 * ========================================================== */
function SettingsView({ client, onChange }) {
  const [clientType, setClientType] = useState(client.clientType || "B2C");
  const [busy, setBusy] = useState(false);

  const saveType = async (val) => {
    setBusy(true);
    try {
      await api.patch(`/api/poc/clients/${client.clientId}/client-type`, { clientType: val });
      setClientType(val);
      toast.success(`Client type set to ${val}`);
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e, "Failed to set client type"));
    } finally {
      setBusy(false);
    }
  };

  const goLive = async () => {
    if (!window.confirm("Set this client LIVE? Analytics & projections will unlock for them.")) return;
    setBusy(true);
    try {
      await api.patch(`/api/poc/clients/${client.clientId}/go-live`);
      toast.success("Client is now LIVE");
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e, "Failed to set go-live"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title="Client Type (internal — never shown to client)">
        <div className="flex items-center gap-3">
          {["B2C", "B2B"].map((t) => (
            <button
              key={t}
              disabled={busy}
              onClick={() => saveType(t)}
              className={`px-4 py-2 rounded-lg text-sm ${clientType === t ? "bg-black text-white" : btnGhost}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Lifecycle">
        <p className="text-sm text-gray-500 mb-3">
          Current stage: <b className="text-gray-900">{STAGE_LABEL[client.lifecycleStage] || client.lifecycleStage}</b>
        </p>
        <button onClick={goLive} disabled={busy || client.lifecycleStage === "LIVE"} className={btn}>
          {client.lifecycleStage === "LIVE" ? "Already Live" : "Set Go-Live"}
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Note: go-live is not yet gated on subscription payment (finance ownership pending).
        </p>
      </Card>
    </>
  );
}
