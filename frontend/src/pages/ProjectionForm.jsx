import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api from "../utils/api";
import toast from "../utils/toast";

const today = () => new Date().toISOString().split("T")[0];

const emptyRow = () => ({ recipeName: "", targetQty: "", uom: "PC" });

export default function ProjectionForm() {
  const navigate = useNavigate();

  const [dishes, setDishes] = useState([]);
  const [type, setType] = useState("DAILY");
  const [forDate, setForDate] = useState(today());
  const [rows, setRows] = useState([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // holds the created projection on success

  useEffect(() => {
    api
      .get("/api/mainrecipes/dish-list")
      .then((res) => setDishes(res.data?.dishes || []))
      .catch(() => setDishes([]));
  }, []);

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

    setSubmitting(true);
    try {
      const res = await api.post("/api/projections", { type, forDate, items });
      setSubmitted(res.data?.data);
      toast.success("Projection submitted successfully");
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

            {/* Type + Date row */}
            <div className="bg-white rounded-xl shadow-sm border p-5 grid grid-cols-2 gap-4">
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

        </div>
      </div>
    </Layout>
  );
}
