import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api from "../utils/api";
import { authUtils } from "../utils/auth";
import toast from "../utils/toast";

const SPOILAGE_REASONS = [
  { value: "SPOILED_EXPIRED", label: "Spoiled / Expired" },
  { value: "WASTAGE", label: "Wastage" },
  { value: "QUALITY_REJECTION", label: "Quality Rejection" },
  { value: "OTHER", label: "Other" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

const FridgeAudit = () => {
  const navigate = useNavigate();
  const adminRole = authUtils.getRole();
  const branchCode = authUtils.getBranchCode();

  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [audits, setAudits] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // rowState: { [stockId]: { countedQty, spoiledQty, spoilageReason, note } }
  const [rowState, setRowState] = useState({});

  useEffect(() => {
    if (adminRole !== "RECIPE_MANAGER") {
      navigate("/admin-dashboard");
      return;
    }
    loadStock();
    loadAudits();
  }, []);

  const loadStock = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/fridge-stock");
      const data = res.data?.data || [];
      setStock(data);
      setRowState((prev) => {
        const next = { ...prev };
        for (const row of data) {
          if (!next[row._id]) {
            next[row._id] = {
              countedQty: String(row.qtyRemaining),
              spoiledQty: "0",
              spoilageReason: "",
              note: "",
            };
          }
        }
        return next;
      });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load fridge stock");
      setStock([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAudits = async () => {
    try {
      const res = await api.get("/api/fridge-audit");
      setAudits(res.data?.data || []);
    } catch {
      setAudits([]);
    }
  };

  const updateRow = (id, field, value) => {
    setRowState((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const formatLocationName = (code) => {
    if (!code) return "";
    const overrides = {
      JPNAGAR: "JP Nagar",
      MARATHAHALLI: "Marathahalli",
      KALYANNAGAR: "Kalyan Nagar",
      TESTBRANCH: "Test Branch",
    };
    return overrides[code] || code;
  };

  const handleSubmit = async () => {
    const items = [];
    for (const row of stock) {
      const r = rowState[row._id] || {};
      const countedQty = Number(r.countedQty);
      const spoiledQty = Number(r.spoiledQty || 0);

      if (!Number.isFinite(countedQty) || countedQty < 0) {
        toast.error(`Enter a valid counted quantity for "${row.itemName}"`);
        return;
      }
      if (!Number.isFinite(spoiledQty) || spoiledQty < 0) {
        toast.error(`Enter a valid spoiled quantity for "${row.itemName}"`);
        return;
      }
      if (spoiledQty > 0 && !r.spoilageReason) {
        toast.error(`Select a reason for spoiled stock on "${row.itemName}"`);
        return;
      }
      if (spoiledQty > countedQty) {
        toast.error(`Spoiled quantity cannot be more than the counted quantity for "${row.itemName}"`);
        return;
      }
      if (countedQty === row.qtyRemaining && spoiledQty === 0) {
        // No change for this item — skip sending it.
        continue;
      }

      items.push({
        stockId: row._id,
        countedQty,
        spoiledQty,
        spoilageReason: r.spoilageReason || null,
        note: (r.note || "").trim(),
      });
    }

    if (items.length === 0) {
      toast.error("No changes to submit — all counts match current fridge stock.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/fridge-audit", {
        date: todayStr(),
        items,
      });
      toast.success("Fridge audit submitted");
      await loadStock();
      await loadAudits();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit fridge audit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">Fridge Audit</h1>
          <button
            type="button"
            onClick={() => navigate("/admin-dashboard")}
            className="text-sm text-gray-600 hover:text-black"
          >
            ← Back to Dashboard
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Branch: <span className="font-semibold">{formatLocationName(branchCode)}</span>
          {" "}&middot; {todayStr()}
        </p>

        <div className="bg-white rounded-2xl border p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Current Fridge Stock (Semi-Finished)</h2>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : stock.length === 0 ? (
            <p className="text-gray-500 text-sm">No semi-finished stock recorded for this kitchen yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Item</th>
                    <th className="py-2 pr-4">UOM</th>
                    <th className="py-2 pr-4">In System</th>
                    <th className="py-2 pr-4">Added On (Date &amp; Time)</th>
                    <th className="py-2 pr-4">Actual Count</th>
                    <th className="py-2 pr-4">Spoiled/Wasted</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2 pr-4">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((row) => {
                    const r = rowState[row._id] || {};
                    return (
                      <tr key={row._id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">
                          {row.itemName}
                          {row.ingredientBrand ? (
                            <span className="text-gray-400"> ({row.ingredientBrand})</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4">{row.uom}</td>
                        <td className="py-2 pr-4">{row.qtyRemaining}</td>
                        <td className="py-2 pr-4 text-gray-500">
                          {row.receivedBatches?.length ? (
                            <div className="space-y-0.5">
                              {row.receivedBatches.slice(0, 3).map((b, idx) => (
                                <div key={idx}>
                                  {b.qty} {b.uom} — {new Date(b.at).toLocaleString()}
                                </div>
                              ))}
                              {row.receivedBatches.length > 3 && (
                                <div className="text-gray-400">
                                  +{row.receivedBatches.length - 3} more
                                </div>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.countedQty ?? ""}
                            onChange={(e) => updateRow(row._id, "countedQty", e.target.value)}
                            className="w-24 border rounded px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.spoiledQty ?? ""}
                            onChange={(e) => updateRow(row._id, "spoiledQty", e.target.value)}
                            className="w-24 border rounded px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            value={r.spoilageReason || ""}
                            onChange={(e) => updateRow(row._id, "spoilageReason", e.target.value)}
                            className="border rounded px-2 py-1"
                          >
                            <option value="">—</option>
                            {SPOILAGE_REASONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="text"
                            value={r.note ?? ""}
                            onChange={(e) => updateRow(row._id, "note", e.target.value)}
                            placeholder="Optional"
                            className="w-32 border rounded px-2 py-1"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {stock.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-black text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Audit"}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border p-6">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-lg font-semibold"
          >
            Past Audits {showHistory ? "▲" : "▼"}
          </button>

          {showHistory && (
            <div className="mt-4">
              {audits.length === 0 ? (
                <p className="text-gray-500 text-sm">No audits recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {audits.map((audit) => (
                    <div key={audit._id} className="border rounded-lg p-4">
                      <p className="font-semibold mb-2">{audit.date}</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b text-gray-500">
                            <th className="py-1 pr-4">Item</th>
                            <th className="py-1 pr-4">Before</th>
                            <th className="py-1 pr-4">Counted</th>
                            <th className="py-1 pr-4">Spoiled</th>
                            <th className="py-1 pr-4">After</th>
                            <th className="py-1 pr-4">Reason</th>
                            <th className="py-1 pr-4">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {audit.items.map((item, idx) => (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="py-1 pr-4">{item.itemName}</td>
                              <td className="py-1 pr-4">{item.previousQty}</td>
                              <td className="py-1 pr-4">{item.countedQty}</td>
                              <td className="py-1 pr-4">{item.spoiledQty || 0}</td>
                              <td className="py-1 pr-4">
                                {item.finalQty ?? Math.max(item.countedQty - (item.spoiledQty || 0), 0)}
                              </td>
                              <td className="py-1 pr-4">
                                {SPOILAGE_REASONS.find((o) => o.value === item.spoilageReason)?.label || "—"}
                              </td>
                              <td className="py-1 pr-4">{item.note || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default FridgeAudit;