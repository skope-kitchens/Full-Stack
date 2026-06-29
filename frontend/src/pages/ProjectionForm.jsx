import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api from "../utils/api";
import toast from "../utils/toast";

const today = () => new Date().toISOString().split("T")[0];

const emptyRow = () => ({ recipeName: "", targetQty: "", uom: "PC" });

const BRANCH_OPTIONS = [
  { label: "JP Nagar", value: "JPNAGAR" },
  { label: "Marathahalli", value: "MARATHAHALLI" },
  { label: "Kalyan Nagar", value: "KALYANNAGAR" },
  { label: "Jayanagar", value: "JAYANAGAR" },
  { label: "Test Branch", value: "TESTBRANCH" },
];

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

export default function ProjectionForm() {
  const navigate = useNavigate();

  const [dishes, setDishes] = useState([]);
  const [type, setType] = useState("DAILY");
  const [forDate, setForDate] = useState(today());
  const [branchCode, setBranchCode] = useState("");
  const [rows, setRows] = useState([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // holds the created projection on success

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedProjections, setExpandedProjections] = useState({});

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get("/api/projections/my");
      setHistory(res.data?.data || []);
    } catch (err) {
      console.error("Failed to load projection history", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const getBranchLabel = (code) => {
    const branch = BRANCH_OPTIONS.find((b) => b.value === code);
    return branch ? branch.label : code;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PENDING_CHEF_REVIEW":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            Pending Chef Review
          </span>
        );
      case "CHEF_CONFIRMED":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
            Chef Confirmed
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            Completed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-800 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  const toggleExpand = (id) => {
    setExpandedProjections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    api
      .get("/api/mainrecipes/dish-list")
      .then((res) => setDishes(res.data?.dishes || []))
      .catch(() => setDishes([]));
    
    fetchHistory();
  }, [fetchHistory]);

  /* ── row helpers ── */
  const updateRow = (idx, field, value) =>
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (idx) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));

  /* ── submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();

    const items = rows
      .map((r) => ({
        recipeName: r.recipeName.trim(),
        targetQty: Number(r.targetQty),
        uom: r.uom,
      }))
      .filter((r) => r.recipeName && r.targetQty > 0);

    if (items.length === 0) {
      toast.error("Add at least one dish with a quantity greater than 0");
      return;
    }

    if (!branchCode) {
      toast.error("Please select a kitchen branch");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/api/projections", { type, forDate, items, branchCode });
      setSubmitted(res.data?.data);
      toast.success("Projection submitted successfully");
      fetchHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit projection");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── success state ── */
  if (submitted) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-6 py-10">
          <div className="mx-auto max-w-2xl">
            <div className="bg-white rounded-2xl shadow p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto text-2xl">
                ✓
              </div>
              <h2 className="text-2xl font-semibold">Projection Submitted</h2>
              <p className="text-gray-500 text-sm">
                Your {submitted.type} projection for{" "}
                <strong>
                  {new Date(submitted.forDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>{" "}
                has been received. The kitchen team will review it shortly.
              </p>

              {submitted.submittedAt && (
                <p className="text-xs text-gray-400">
                  Submitted on {formatSubmittedAt(submitted.submittedAt)}
                </p>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 text-left">
                <strong>Note:</strong> No wallet amount has been deducted.
                Operational cost will be calculated when the chef confirms the
                production plan.
              </div>

              <div className="border rounded-lg divide-y text-sm text-left">
                {submitted.items.map((item, i) => (
                  <div key={i} className="flex justify-between px-4 py-2.5">
                    <span className="font-medium">{item.recipeName}</span>
                    <span className="text-gray-500">
                      {item.targetQty} {item.uom}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setSubmitted(null);
                    setRows([emptyRow()]);
                  }}
                  className="flex-1 border border-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  Submit Another
                </button>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="flex-1 bg-black text-white py-2 rounded-lg text-sm hover:bg-gray-800"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  /* ── form ── */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-2xl space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Submit Production Projection</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Tell the kitchen what you plan to sell so preparation can be scheduled.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="text-sm text-gray-500 hover:text-black border border-gray-300 px-3 py-1.5 rounded-lg"
            >
              ← Back
            </button>
          </div>

          {/* Cost disclaimer — always visible */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex gap-3">
            <span className="text-amber-500 text-lg shrink-0">ℹ</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Estimated Operational Cost: Calculated at execution setup
              </p>
              <p className="text-sm text-amber-700 mt-0.5">
                No immediate wallet deduction applies. Your wallet balance is only
                debited after the chef confirms the production plan and the Wallet
                Admin approves the ingredient indent.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Type + Date + Branch row */}
            <div className="bg-white rounded-xl shadow-sm border p-5 grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Projection Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Production Date
                </label>
                <input
                  type="date"
                  value={forDate}
                  min={today()}
                  onChange={(e) => setForDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kitchen Branch
                </label>
                <select
                  required
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="">Select branch…</option>
                  {BRANCH_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dish rows */}
            <div className="bg-white rounded-xl shadow-sm border p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-gray-700">Dishes</h2>
                <button
                  type="button"
                  onClick={addRow}
                  className="text-sm text-black border border-gray-300 px-3 py-1 rounded-lg hover:bg-gray-50"
                >
                  + Add Dish
                </button>
              </div>

              {rows.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  {/* Dish selector */}
                  <div className="flex-1">
                    {idx === 0 && (
                      <label className="block text-xs text-gray-500 mb-1">Dish Name</label>
                    )}
                    {dishes.length > 0 ? (
                      <select
                        value={row.recipeName}
                        onChange={(e) => updateRow(idx, "recipeName", e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      >
                        <option value="">Select a dish…</option>
                        {dishes.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={row.recipeName}
                        onChange={(e) => updateRow(idx, "recipeName", e.target.value)}
                        placeholder="Dish name"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      />
                    )}
                  </div>

                  {/* Target qty */}
                  <div className="w-28">
                    {idx === 0 && (
                      <label className="block text-xs text-gray-500 mb-1">Target Qty</label>
                    )}
                    <input
                      type="number"
                      min={1}
                      value={row.targetQty}
                      onChange={(e) => updateRow(idx, "targetQty", e.target.value)}
                      placeholder="Qty"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>

                  {/* UOM */}
                  <div className="w-20">
                    {idx === 0 && (
                      <label className="block text-xs text-gray-500 mb-1">Unit</label>
                    )}
                    <select
                      value={row.uom}
                      onChange={(e) => updateRow(idx, "uom", e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="PC">PC</option>
                      <option value="KG">KG</option>
                      <option value="GM">GM</option>
                    </select>
                  </div>

                  {/* Remove */}
                  <div className={idx === 0 ? "mt-5" : ""}>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={rows.length === 1}
                      className="w-8 h-9 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-30 rounded border border-gray-200 hover:border-red-300"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-black text-white py-3 rounded-xl font-medium text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Projection"}
            </button>
          </form>

          {/* Projection History */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-semibold text-gray-900">Projection History</h2>
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                {history.length} {history.length === 1 ? "submission" : "submissions"}
              </span>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-gray-500 text-sm animate-pulse">
                Loading history…
              </div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">
                No previous projections submitted.
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {history.map((proj) => {
                  const isExpanded = !!expandedProjections[proj._id];
                  const totalItems = proj.items?.length || 0;
                  const totalQty = proj.items?.reduce((sum, i) => sum + (Number(i.targetQty) || 0), 0) || 0;
                  
                  return (
                    <div
                      key={proj._id}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all duration-200"
                    >
                      {/* Card Header (clickable to toggle expansion) */}
                      <div
                        onClick={() => toggleExpand(proj._id)}
                        className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md ${
                              proj.type === "WEEKLY" ? "bg-purple-100 text-purple-800" : "bg-teal-100 text-teal-800"
                            }`}>
                              {proj.type}
                            </span>
                            <span className="text-xs text-gray-400">
                              Submitted {formatSubmittedAt(proj.submittedAt)}
                            </span>
                          </div>
                          
                          <h3 className="font-semibold text-gray-900 text-sm">
                            Production Date:{" "}
                            <span className="text-black font-bold">
                              {new Date(proj.forDate).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </h3>

                          <div className="flex gap-3 text-xs text-gray-500">
                            <span>
                              Branch: <span className="text-gray-700 font-medium">{getBranchLabel(proj.branchCode)}</span>
                            </span>
                            <span>•</span>
                            <span>
                              {totalItems} {totalItems === 1 ? "dish" : "dishes"} ({totalQty} units total)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {getStatusBadge(proj.status)}
                          <span className={`text-gray-400 text-xs transform transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}>
                            ▼
                          </span>
                        </div>
                      </div>

                      {/* Card Expanded Content */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-100 bg-slate-50/50 pt-3">
                          <div className="border rounded-lg bg-white overflow-hidden shadow-inner">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Dish Name</th>
                                  <th className="px-3 py-2 font-semibold text-right">Target Quantity</th>
                                  <th className="px-3 py-2 font-semibold text-center w-20">Unit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 text-gray-700">
                                {proj.items.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/50">
                                    <td className="px-3 py-2 font-medium text-gray-900">{item.recipeName}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{item.targetQty}</td>
                                    <td className="px-3 py-2 text-center text-gray-500">{item.uom}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </Layout>
  );
}
