import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import Layout from "../components/Layout";
import toast from "../utils/toast";
import FcrIterationTimeline from "../components/FcrIterationTimeline";

/* ============================================================
 * Constants & helpers
 * ========================================================== */

const BRANCH_DISPLAY = {
  JPNAGAR: "Main Kitchen",
  TESTBRANCH: "Test Branch",
  MARATHAHALLI: "Marathahalli",
  KALYANNAGAR: "Kalyan Nagar",
  JAYANAGAR: "Jayanagar",
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatCurrency = (n) => `₹${formatMoney(n)}`;
const today = () => new Date().toISOString().slice(0, 10);

const DRAWER_ITEMS = [
  { key: "onboarding", label: "Service Onboarding Status" },
  { key: "sop", label: "SOP Documents" },
  { key: "projections", label: "Enter Projections", gate: "LIVE" },
  { key: "dailyStock", label: "Daily Stock" },
  { key: "auditHistory", label: "Audit History", gate: "LIVE" },
  { key: "fcr", label: "Food Cost / FCR" },
  { key: "analyticsDaily", label: "Per Day Analytics", gate: "LIVE" },
  { key: "analyticsRange", label: "Analytics (Date Range)", gate: "LIVE" },
  { key: "invoices", label: "Invoices" },
  { key: "grns", label: "Goods Received Notes" },
  { key: "profile", label: "Profile" },
];

/* ============================================================
 * Reusable Branch dropdown
 * ========================================================== */
function BranchSelect({ branches, value, onChange, label = "Select Branch" }) {
  return (
    <div className="max-w-xs">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      >
        {branches.map((b) => (
          <option key={b.branchCode} value={b.branchCode}>
            {b.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ============================================================
 * KPI tile
 * ========================================================== */
function Stat({ title, value }) {
  return (
    <div className="bg-[#181818] p-6 rounded-xl border border-gray-700">
      <p className="text-gray-400 text-xs uppercase mb-2">{title}</p>
      <p className="text-3xl font-bold">{value ?? "—"}</p>
    </div>
  );
}

function LockedNotice({ message }) {
  return (
    <div className="bg-white rounded-2xl shadow p-10 text-center">
      <h3 className="text-lg font-semibold">Locked</h3>
      <p className="text-gray-500 text-sm mt-1">{message}</p>
    </div>
  );
}

/* ============================================================
 * MAIN DASHBOARD
 * ========================================================== */
export default function Dashboard() {
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState("home");

  const [profile, setProfile] = useState(null);
  const [branches, setBranches] = useState([]);
  const [homeBranch, setHomeBranch] = useState("");

  // Production invoices (reused from legacy)
  const [productionOrders, setProductionOrders] = useState([]);
  const [payingOrderId, setPayingOrderId] = useState(null);

  // Enter-menu modal (reused) + submitted menu view
  const [showEnterMenu, setShowEnterMenu] = useState(false);
  const [menuRows, setMenuRows] = useState([{ recipeName: "", qty: 1, uom: "PC", cost: 0 }]);
  const [menuBranchCode, setMenuBranchCode] = useState("");
  const [menuSaving, setMenuSaving] = useState(false);
  const [submittedMenu, setSubmittedMenu] = useState([]);
  // Single-item edit: { entryId, itemId } when the modal is in edit mode (null = create mode)
  const [editTarget, setEditTarget] = useState(null);
  // Soft-delete confirmation: { entryId, itemId, recipeName } when the dialog is open
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingItem, setDeletingItem] = useState(false);

  // Logo popup
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoSaving, setLogoSaving] = useState(false);

  const lifecycleStage = profile?.lifecycleStage || "AWAITING_MENU";

  /* ---------------- Loaders ---------------- */
  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get("/api/client/profile");
      setProfile(res.data);
    } catch (err) {
      console.error("Failed to fetch profile", err);
    }
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      const res = await api.get("/api/client/branches");
      const list = res.data || [];
      setBranches(list);
      if (list.length) {
        setHomeBranch((prev) => prev || list[0].branchCode);
        setMenuBranchCode((prev) => prev || list[0].branchCode);
      }
    } catch (err) {
      console.error("Failed to fetch branches", err);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadBranches();
  }, [loadProfile, loadBranches]);

  // Submitted menu for the selected home branch
  const loadSubmittedMenu = useCallback(async (branchCode) => {
    if (!branchCode) return;
    try {
      const res = await api.get("/api/client/menu", { params: { branchCode } });
      setSubmittedMenu(res.data?.data || []);
    } catch (err) {
      console.error("Failed to fetch submitted menu", err);
      setSubmittedMenu([]);
    }
  }, []);

  useEffect(() => {
    if (homeBranch) loadSubmittedMenu(homeBranch);
  }, [homeBranch, loadSubmittedMenu]);

  // Production orders (poll like legacy)
  useEffect(() => {
    const fetchProductionOrders = async () => {
      try {
        const res = await api.get("/api/production-orders/my-pending");
        setProductionOrders(res.data?.data || []);
      } catch (err) {
        console.error("Failed to load production orders", err);
      }
    };
    fetchProductionOrders();
    const interval = setInterval(fetchProductionOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  /* ---------------- Production invoice payment (Razorpay-direct) ---------------- */
  const payProductionInvoice = async (orderId, cost) => {
    try {
      setPayingOrderId(orderId);
      // 1) Create the Razorpay order on the production order.
      const { data } = await api.post(`/api/production-orders/${orderId}/create-order`);
      // 2) Launch checkout.
      const options = {
        key: data.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: Math.round(Number(cost) * 100),
        currency: "INR",
        order_id: data.razorpayOrderId,
        name: "Skope Kitchens",
        description: `Production Invoice #${orderId.toString().slice(-6).toUpperCase()}`,
        handler: async (response) => {
          // 3) Verify the signature server-side → flips order to PAID.
          try {
            await api.post(`/api/production-orders/${orderId}/pay`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setProductionOrders((prev) => prev.filter((o) => o._id !== orderId));
            toast.success(`Production invoice paid — ₹${formatMoney(cost)}.`);
          } catch (err) {
            toast.error(err.response?.data?.message || "Payment verification failed");
          } finally {
            setPayingOrderId(null);
          }
        },
        modal: { ondismiss: () => setPayingOrderId(null) },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || "Payment failed. Please try again.");
      setPayingOrderId(null);
    }
  };

  /* ---------------- Menu modal helpers (create + edit reuse one modal) -------- */
  const closeMenuModal = () => {
    setShowEnterMenu(false);
    setEditTarget(null);
    setMenuRows([{ recipeName: "", qty: 1, uom: "PC", cost: 0 }]);
  };

  // Open the shared modal in EDIT mode, pre-populated with one item's four fields.
  const openEditItem = (item) => {
    setEditTarget({ entryId: item.entryId, itemId: item._id });
    setMenuRows([
      {
        recipeName: item.recipeName || "",
        qty: Number(item.qty || 1),
        uom: item.uom || "",
        cost: Number(item.cost || 0),
      },
    ]);
    setShowEnterMenu(true);
  };

  // Soft-delete a single item after confirmation.
  const confirmDeleteItem = async () => {
    if (!deleteTarget) return;
    try {
      setDeletingItem(true);
      await api.delete(`/api/menu-items/${deleteTarget.entryId}/items/${deleteTarget.itemId}`);
      setDeleteTarget(null);
      toast.success("Menu item removed");
      loadSubmittedMenu(homeBranch);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove menu item");
    } finally {
      setDeletingItem(false);
    }
  };

  /* ---------------- Menu submit (reused for create AND edit) ---------------- */
  const submitMenu = async () => {
    // EDIT mode: PUT the single item's four editable fields.
    if (editTarget) {
      const row = menuRows[0] || {};
      const recipeName = String(row.recipeName || "").trim();
      const qty = Number(row.qty || 0);
      const uom = String(row.uom || "").trim();
      const cost = Number(row.cost || 0);
      if (!recipeName || qty <= 0 || !uom) {
        toast.error("Recipe, quantity and UOM are required");
        return;
      }
      try {
        setMenuSaving(true);
        await api.put(`/api/menu-items/${editTarget.entryId}/items/${editTarget.itemId}`, {
          recipeName,
          qty,
          uom,
          cost,
        });
        closeMenuModal();
        toast.success("Menu item updated");
        loadSubmittedMenu(homeBranch);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to update menu item");
      } finally {
        setMenuSaving(false);
      }
      return;
    }

    // CREATE mode (unchanged).
    const items = menuRows
      .map((row) => ({
        recipeName: String(row.recipeName || "").trim(),
        qty: Number(row.qty || 0),
        uom: String(row.uom || "").trim(),
        cost: Number(row.cost || 0),
      }))
      .filter((row) => row.recipeName && row.qty > 0 && row.uom);
    if (items.length === 0) {
      toast.error("Add at least one valid menu item");
      return;
    }
    if (!menuBranchCode) {
      toast.error("Please select a kitchen branch");
      return;
    }
    try {
      setMenuSaving(true);
      await api.post("/api/menu-entries", { items, branchCode: menuBranchCode });
      setShowEnterMenu(false);
      setMenuRows([{ recipeName: "", qty: 1, uom: "PC", cost: 0 }]);
      toast.success("Menu submitted successfully");
      // Menu submission may flip lifecycle AWAITING_MENU -> IN_TRIAL.
      await loadProfile();
      if (menuBranchCode === homeBranch) loadSubmittedMenu(homeBranch);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save menu");
    } finally {
      setMenuSaving(false);
    }
  };

  /* ---------------- Logo file select + validate ---------------- */
  const LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"]; // PNG/JPG/JPEG/SVG
  const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB

  const onLogoFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPG, JPEG or SVG files are allowed");
      e.target.value = "";
      setLogoFile(null);
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Logo file is too large (max 2MB)");
      e.target.value = "";
      setLogoFile(null);
      return;
    }
    setLogoFile(file);
  };

  /* ---------------- Logo upload + save ---------------- */
  const saveLogo = async () => {
    if (!logoFile) {
      toast.error("Choose a logo file");
      return;
    }
    try {
      setLogoSaving(true);
      // 1. Upload the file to Cloudinary via the backend.
      const form = new FormData();
      form.append("file", logoFile);
      const up = await api.post("/api/client/logo-upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // 2. Persist the returned secure URL on the User record.
      const res = await api.patch("/api/client/logo", { logoUrl: up.data.logoUrl });
      setProfile((p) => ({ ...p, logoUrl: res.data.logoUrl }));
      setShowLogoModal(false);
      setLogoFile(null);
      toast.success("Logo updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update logo");
    } finally {
      setLogoSaving(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.clear();
    navigate("/");
  };

  const isLive = lifecycleStage === "LIVE";

  const openDrawerItem = (item) => {
    if (item.gate === "LIVE" && !isLive) {
      // Still allow opening projections/analytics views — they render a locked state.
      setActiveView(item.key);
      return;
    }
    if (item.key === "projections" && isLive) {
      navigate("/projection");
      return;
    }
    setActiveView(item.key);
  };

  /* ---------------- Render ---------------- */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 flex">
        {/* ===== LEFT DRAWER ===== */}
        <aside
          className={`${
            collapsed ? "w-16" : "w-64"
          } shrink-0 bg-white border-r border-gray-200 transition-all duration-200 flex flex-col`}
        >
          <div className="flex items-center justify-between p-3 border-b">
            {!collapsed && <span className="font-semibold text-sm">Menu</span>}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>

          <nav className="flex-1 py-2 overflow-y-auto">
            <button
              onClick={() => setActiveView("home")}
              className={`w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 ${
                activeView === "home" ? "bg-gray-100 font-semibold" : ""
              }`}
              title={collapsed ? "Home" : ""}
            >
              {collapsed ? "H" : "Home"}
            </button>

            {DRAWER_ITEMS.map((item) => {
              const locked = item.gate === "LIVE" && !isLive;
              return (
                <button
                  key={item.key}
                  onClick={() => openDrawerItem(item)}
                  className={`w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 ${
                    activeView === item.key ? "bg-gray-100 font-semibold" : ""
                  }`}
                  title={collapsed ? item.label : ""}
                >
                  {collapsed ? (
                    item.label.charAt(0)
                  ) : (
                    <span className="flex-1 flex items-center justify-between">
                      {item.label}
                      {locked && (
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">Locked</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ===== MAIN AREA ===== */}
        <div className="flex-1 min-w-0">
          {/* Top bar */}
          <div className="flex justify-end items-center gap-4 px-6 py-3 bg-white border-b">
            <button onClick={handleLogout} className="bg-black text-white px-4 py-2 rounded-lg text-sm">
              Logout
            </button>
          </div>

          <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Production invoice banners (visible everywhere) — paid via Razorpay */}
            {productionOrders.map((po) => {
              const invoiceCost = Number(po.financials?.totalIngredientCost || 0);
              const isPaying = payingOrderId === po._id;
              return (
                <div key={po._id} className="rounded-2xl border-2 border-amber-400 bg-amber-50 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-amber-100 border-b border-amber-300">
                    <span className="font-bold text-amber-900 text-sm uppercase tracking-wide">
                      Production Invoice Ready for Payment
                    </span>
                    <span className="text-xs text-amber-700 font-mono">
                      Ref #{po._id.toString().slice(-6).toUpperCase()}
                    </span>
                  </div>
                  <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-sm">
                      <span className="text-gray-500">Invoice Total</span>
                      <p className="font-bold text-xl text-amber-900">₹{formatMoney(invoiceCost)}</p>
                    </div>
                    <button
                      onClick={() => payProductionInvoice(po._id, invoiceCost)}
                      disabled={isPaying}
                      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold text-sm whitespace-nowrap shadow"
                    >
                      {isPaying ? "Processing…" : "Pay Production Invoice"}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ===== VIEWS ===== */}
            {activeView === "home" && (
              <HomeView
                profile={profile}
                branches={branches}
                homeBranch={homeBranch}
                setHomeBranch={setHomeBranch}
                submittedMenu={submittedMenu}
                onOpenMenu={() => {
                  setEditTarget(null);
                  setMenuRows([{ recipeName: "", qty: 1, uom: "PC", cost: 0 }]);
                  setMenuBranchCode(homeBranch);
                  setShowEnterMenu(true);
                }}
                onEditItem={openEditItem}
                onDeleteItem={(item) =>
                  setDeleteTarget({ entryId: item.entryId, itemId: item._id, recipeName: item.recipeName })
                }
                onOpenLogo={() => setShowLogoModal(true)}
              />
            )}

            {activeView === "onboarding" && <OnboardingView />}

            {activeView === "sop" && <SopView />}

            {activeView === "projections" &&
              (isLive ? (
                <LockedNotice message="Redirecting to projections…" />
              ) : (
                <LockedNotice message="Projections unlock once your brand goes live." />
              ))}

            {activeView === "dailyStock" && <DailyStockView />}

            {activeView === "auditHistory" &&
              (isLive ? (
                <AuditHistoryView />
              ) : (
                <LockedNotice message="Audit history unlocks once your brand goes live." />
              ))}

            {activeView === "fcr" && <FcrView />}

            {activeView === "analyticsDaily" &&
              (isLive ? (
                <DailyAnalyticsView branches={branches} />
              ) : (
                <LockedNotice message="Per-day analytics unlock once your brand goes live." />
              ))}

            {activeView === "analyticsRange" &&
              (isLive ? (
                <RangeAnalyticsView branches={branches} />
              ) : (
                <LockedNotice message="Date-range analytics unlock once your brand goes live." />
              ))}

            {activeView === "invoices" && <InvoicesView branches={branches} />}

            {activeView === "grns" && <GrnView />}

            {activeView === "profile" && <ProfileView profile={profile} onChangeLogo={() => setShowLogoModal(true)} />}
          </div>
        </div>
      </div>

      {/* ===== LOGO MODAL ===== */}
      {showLogoModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-96 space-y-4">
            <h2 className="text-xl font-bold">Change Logo</h2>
            <p className="text-sm text-gray-500">
              Choose a logo from your device. PNG, JPG, JPEG or SVG — max 2MB.
            </p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={onLogoFileChange}
              className="w-full border p-2 rounded text-sm"
            />
            {logoFile && (
              <p className="text-xs text-gray-600">
                {logoFile.name} — {(logoFile.size / 1024).toFixed(0)} KB
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowLogoModal(false);
                  setLogoFile(null);
                }}
                className="flex-1 border py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={saveLogo}
                disabled={logoSaving || !logoFile}
                className="flex-1 bg-black text-white py-2 rounded disabled:opacity-50"
              >
                {logoSaving ? "Uploading…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ENTER MENU MODAL (reused) ===== */}
      {showEnterMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-[95vw] max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold">{editTarget ? "Edit Menu Item" : "Enter Menu"}</h2>
              <button onClick={closeMenuModal} className="text-gray-500 hover:text-black text-2xl">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {!editTarget && (
                <div className="mb-4 max-w-xs">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kitchen Branch</label>
                  <select
                    value={menuBranchCode}
                    onChange={(e) => setMenuBranchCode(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select branch…</option>
                    {branches.map((b) => (
                      <option key={b.branchCode} value={b.branchCode}>
                        {b.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Recipe Name</th>
                      <th className="p-2 text-center w-28">Quantity</th>
                      <th className="p-2 text-center w-24">UOM</th>
                      <th className="p-2 text-center w-40">Online Selling Price (₹)</th>
                      <th className="p-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {menuRows.map((r, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">
                          <input
                            value={r.recipeName}
                            onChange={(e) =>
                              setMenuRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], recipeName: e.target.value };
                                return next;
                              })
                            }
                            className="w-full border rounded px-2 py-1 text-sm"
                            placeholder="Recipe name"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            min={1}
                            value={r.qty}
                            onChange={(e) =>
                              setMenuRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], qty: Number(e.target.value || 1) };
                                return next;
                              })
                            }
                            className="w-20 border rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={r.uom || ""}
                            onChange={(e) =>
                              setMenuRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], uom: e.target.value };
                                return next;
                              })
                            }
                            className="w-full border rounded px-2 py-1 text-sm"
                          >
                            <option value="">Select</option>
                            <option value="PC">PC</option>
                            <option value="ML">ml</option>
                            <option value="GM">gm</option>
                            <option value="KG">Kg</option>
                            <option value="L">L</option>
                          </select>
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={r.cost}
                            onChange={(e) =>
                              setMenuRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], cost: Number(e.target.value || 0) };
                                return next;
                              })
                            }
                            className="w-32 border rounded px-2 py-1 text-sm text-right"
                          />
                        </td>
                        <td className="p-2 text-right">
                          {!editTarget && (
                            <button
                              type="button"
                              onClick={() => setMenuRows((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-red-600 hover:underline text-sm"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!editTarget && (
                <button
                  type="button"
                  onClick={() => setMenuRows((prev) => [...prev, { recipeName: "", qty: 1, uom: "PC", cost: 0 }])}
                  className="mt-4 text-blue-600 text-sm hover:underline"
                >
                  + Add Row
                </button>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={closeMenuModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={menuSaving}
                className="px-4 py-2 text-sm rounded-lg bg-black text-white disabled:opacity-50 hover:bg-gray-800"
                onClick={submitMenu}
              >
                {menuSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Soft-delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-[90vw] max-w-md overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-slate-900">Remove menu item</h2>
            </div>
            <div className="p-6 space-y-2">
              {deleteTarget.recipeName && (
                <p className="text-sm font-medium text-slate-900">{deleteTarget.recipeName}</p>
              )}
              <p className="text-sm text-slate-600">
                Are you sure? This item will be hidden from your menu but past orders will be preserved.
              </p>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingItem}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingItem}
                className="px-4 py-2 text-sm rounded-lg bg-black text-white disabled:opacity-50 hover:bg-gray-800"
                onClick={confirmDeleteItem}
              >
                {deletingItem ? "Removing..." : "Remove item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

/* ============================================================
 * HOME VIEW
 * ========================================================== */
function HomeView({ profile, branches, homeBranch, setHomeBranch, submittedMenu, onOpenMenu, onEditItem, onDeleteItem, onOpenLogo }) {
  const brandName = profile?.brandName || "Your Brand";
  // Flatten items across entries, keeping each item's entryId + _id so edit/delete
  // can target the exact subdocument.
  const menuItemsForBranch = submittedMenu.flatMap((entry) =>
    (entry.items || []).map((it) => ({ ...it, entryId: entry._id }))
  );

  return (
    <div className="space-y-6">
      {/* Brand header */}
      <header className="rounded-2xl bg-white p-8 shadow flex items-center gap-6">
        <button
          onClick={onOpenLogo}
          className="w-20 h-20 rounded-full bg-slate-100 border flex items-center justify-center overflow-hidden shrink-0"
          title="Change logo"
        >
          {profile?.logoUrl ? (
            <img src={profile.logoUrl} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-gray-400">＋</span>
          )}
        </button>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-slate-500">Brand Dashboard</p>
          <h1 className="text-3xl font-semibold">{brandName}</h1>
        </div>
      </header>

      {/* Horizontal branch selector */}
      <div className="bg-white rounded-2xl p-5 shadow">
        <p className="text-xs font-medium text-gray-500 mb-2">Select Branch</p>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <button
              key={b.branchCode}
              onClick={() => setHomeBranch(b.branchCode)}
              className={`px-4 py-2 rounded-lg text-sm border ${
                homeBranch === b.branchCode
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {b.displayName}
            </button>
          ))}
        </div>
      </div>

      {/* Menu section (focal) */}
      <section className="bg-white rounded-2xl p-8 shadow space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Menu</h2>
            <p className="text-sm text-gray-500">
              {BRANCH_DISPLAY[homeBranch] || homeBranch || "—"}
            </p>
          </div>
          <button onClick={onOpenMenu} className="bg-black text-white px-5 py-2.5 rounded-lg text-sm font-medium">
            + Enter Menu
          </button>
        </div>

        {menuItemsForBranch.length === 0 ? (
          <p className="text-gray-500 text-sm">No menu submitted for this branch yet.</p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Recipe</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-left">UOM</th>
                  <th className="p-2 text-right">Selling Price (₹)</th>
                  <th className="p-2 text-right w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {menuItemsForBranch.map((it, i) => (
                  <tr key={it._id || i} className="border-t">
                    <td className="p-2 font-medium">{it.recipeName}</td>
                    <td className="p-2 text-right">{it.qty}</td>
                    <td className="p-2 uppercase text-xs text-gray-500">{it.uom}</td>
                    <td className="p-2 text-right">{formatMoney(it.cost)}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onEditItem(it)}
                        className="text-sm text-slate-700 hover:text-black hover:underline"
                      >
                        Edit
                      </button>
                      <span className="text-gray-300 mx-2">|</span>
                      <button
                        type="button"
                        onClick={() => onDeleteItem(it)}
                        className="text-sm text-red-600 hover:text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================
 * ONBOARDING VIEW
 * ========================================================== */
function OnboardingView() {
  const [data, setData] = useState({ lifecycleStage: "", tasks: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/api/client/onboarding-status")
      .then((res) => setData(res.data))
      .catch(() => setData({ lifecycleStage: "", tasks: [] }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="bg-white rounded-2xl p-8 shadow space-y-6">
      <h2 className="text-2xl font-semibold">Service Onboarding Status</h2>
      {loading && <p className="text-gray-500">Loading…</p>}
      {!loading && data.tasks.length === 0 && (
        <p className="text-gray-500">No onboarding tasks assigned yet.</p>
      )}
      <div className="space-y-3">
        {data.tasks.map((t, idx) => (
          <div key={idx} className="flex items-center justify-between border rounded-lg p-4">
            <p className="font-medium">{t.taskName}</p>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                t.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {t.status === "COMPLETED" ? "Completed" : "Pending"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
 * SOP DOCUMENTS VIEW (read-only)
 * The POC enters these (title + link) via the POC dashboard; the client reads
 * back their own list here. No lifecycle gate, no add/edit/delete — read-only.
 * ========================================================== */
function SopView() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/api/client/sop")
      .then((res) => setDocuments(res.data?.documents || []))
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="bg-white rounded-2xl p-8 shadow space-y-6">
      <h2 className="text-2xl font-semibold">SOP Documents</h2>
      {loading && <p className="text-gray-500">Loading…</p>}
      {!loading && documents.length === 0 && (
        <p className="text-gray-500">Your SOPs will appear here as your POC finalises them.</p>
      )}
      <div className="space-y-3">
        {documents.map((doc, idx) => (
          <div key={idx} className="flex items-center justify-between border rounded-lg p-4">
            <p className="font-semibold">{doc.title}</p>
            <a
              href={doc.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-sm font-medium"
            >
              Open SOP
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
 * DAILY STOCK VIEW (brand-wide, no branch dropdown)
 * ========================================================== */
function DailyStockView() {
  const [date, setDate] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/client/daily-stock", { params: date ? { date } : {} });
      setRows(res.data?.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="bg-white rounded-2xl p-8 shadow space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-semibold">Daily Stock</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <p className="text-xs text-gray-400">Shown brand-wide (not branch-specific).</p>

      {loading && <p className="text-gray-500">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-gray-500">No stock records found.</p>}

      {rows.map((r) => (
        <div key={r._id} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 text-sm font-semibold">{r.date}</div>
          <table className="w-full text-sm">
            <thead className="bg-white border-b">
              <tr>
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-left">UOM</th>
                <th className="p-2 text-right">Issued</th>
                <th className="p-2 text-right">Used</th>
                <th className="p-2 text-right">Wastage</th>
                <th className="p-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {(r.items || []).map((it, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-medium">{it.itemName}</td>
                  <td className="p-2 uppercase text-xs text-gray-500">{it.uom}</td>
                  <td className="p-2 text-right">{it.issueQty}</td>
                  <td className="p-2 text-right">{it.usedQty}</td>
                  <td className="p-2 text-right">{it.wastageQty}</td>
                  <td className="p-2 text-right font-semibold">{it.remainingQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

/* ============================================================
 * AUDIT HISTORY VIEW (read-only, LIVE-gated) — three sections:
 *   Warehouse (brand-wide) · Local Kitchen (per branch) · Base Kitchen.
 * Reads only LOCKED audits. When all three are empty (common right after
 * go-live) a single welcome empty-state replaces the three empty cards.
 * ========================================================== */

// One audit's item table. Non-zero variance rows are highlighted amber and
// show the reason + note.
function AuditItemsTable({ items }) {
  if (!items || items.length === 0) {
    return <p className="p-3 text-sm text-gray-500">No items in this audit.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-white border-b">
        <tr>
          <th className="p-2 text-left">Item</th>
          <th className="p-2 text-left">UOM</th>
          <th className="p-2 text-right">Expected</th>
          <th className="p-2 text-right">Actual</th>
          <th className="p-2 text-right">Variance</th>
          <th className="p-2 text-left">Reason</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => {
          const hasVar = Number(it.varianceQty) !== 0;
          return (
            <tr key={i} className={`border-t ${hasVar ? "bg-amber-50" : ""}`}>
              <td className="p-2 font-medium">{it.itemName}</td>
              <td className="p-2 uppercase text-xs text-gray-500">{it.uom}</td>
              <td className="p-2 text-right">{it.expectedQty}</td>
              <td className="p-2 text-right">{it.actualQty}</td>
              <td className={`p-2 text-right font-semibold ${hasVar ? "text-amber-700" : "text-gray-500"}`}>
                {it.varianceQty > 0 ? `+${it.varianceQty}` : it.varianceQty}
              </td>
              <td className="p-2 text-xs">
                {it.reason ? (
                  <span>
                    <span className="font-medium">{it.reason}</span>
                    {it.reasonNote ? <span className="text-gray-500"> — {it.reasonNote}</span> : null}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// One locked audit document (date header + lock/correction badges + table).
function AuditCard({ audit }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold">{audit.date}</span>
        <span className="flex items-center gap-2">
          {audit.correctionSeq > 0 && (
            <span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              Correction #{audit.correctionSeq}
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            Locked
          </span>
          {audit.lockedAt && (
            <span className="text-xs text-gray-500">{new Date(audit.lockedAt).toLocaleString()}</span>
          )}
        </span>
      </div>
      <AuditItemsTable items={audit.items} />
    </div>
  );
}

function AuditHistoryView() {
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState(today());
  const [warehouse, setWarehouse] = useState([]);
  const [local, setLocal] = useState([]); // [{ branchCode, branchDisplayName, audits: [] }]
  const [base, setBase] = useState([]);
  const [branchFilter, setBranchFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { from, to };
    try {
      const [w, l, b] = await Promise.all([
        api.get("/api/client/audits/warehouse", { params }),
        api.get("/api/client/audits/local-kitchen", { params }),
        api.get("/api/client/audits/base-kitchen", { params }),
      ]);
      setWarehouse(w.data?.data || []);
      setLocal(l.data?.data || []);
      setBase(b.data?.data || []);
    } catch {
      setWarehouse([]);
      setLocal([]);
      setBase([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const localHasAny = local.some((grp) => (grp.audits || []).length > 0);
  const allEmpty = !loading && warehouse.length === 0 && base.length === 0 && !localHasAny;

  const visibleLocal = branchFilter
    ? local.filter((grp) => grp.branchCode === branchFilter)
    : local;

  return (
    <section className="bg-white rounded-2xl p-8 shadow space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-semibold">Audit History</h2>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-3 py-2" />
          <label className="text-gray-500">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-3 py-2" />
        </div>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}

      {allEmpty && (
        <div className="bg-slate-50 border border-gray-200 rounded-xl p-10 text-center">
          <h3 className="text-lg font-semibold">No audit history yet</h3>
          <p className="text-gray-500 text-sm mt-1">
            Audits will appear here once your Store Manager and kitchen chefs complete their first daily audits.
          </p>
        </div>
      )}

      {!loading && !allEmpty && (
        <>
          {/* A. Warehouse — brand-wide */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Warehouse Audits</h3>
            <p className="text-xs text-gray-400">Shown brand-wide (one central warehouse).</p>
            {warehouse.length === 0 ? (
              <p className="text-gray-500 text-sm">No warehouse audits in this range.</p>
            ) : (
              warehouse.map((a, i) => <AuditCard key={`wh-${i}`} audit={a} />)
            )}
          </div>

          {/* B. Local Kitchen — per branch */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-lg font-semibold">Local Kitchen Audits</h3>
              {local.length > 1 && (
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">All branches</option>
                  {local.map((grp) => (
                    <option key={grp.branchCode} value={grp.branchCode}>
                      {grp.branchDisplayName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {visibleLocal.map((grp) => (
              <div key={grp.branchCode} className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">{grp.branchDisplayName}</h4>
                {(grp.audits || []).length === 0 ? (
                  <p className="text-gray-500 text-sm">No audits yet for {grp.branchDisplayName}.</p>
                ) : (
                  grp.audits.map((a, i) => <AuditCard key={`${grp.branchCode}-${i}`} audit={a} />)
                )}
              </div>
            ))}
          </div>

          {/* C. Base Kitchen — JP Nagar SEMI_FINISHED */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Base Kitchen Audits</h3>
            <p className="text-xs text-gray-400">Sub-recipes prepared at JP Nagar before dispatch.</p>
            {base.length === 0 ? (
              <p className="text-gray-500 text-sm">No base kitchen audits in this range.</p>
            ) : (
              base.map((a, i) => <AuditCard key={`bk-${i}`} audit={a} />)
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ============================================================
 * FCR VIEW (brand-wide, no branch dropdown) — per-dish iteration timeline.
 * Only POC-confirmed iterations are returned by the backend; a dish with
 * zero confirmed iterations still appears, showing "Awaiting confirmation".
 * ========================================================== */
function FcrView() {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/api/client/fcr/dishes")
      .then((res) => setDishes(res.data?.dishes || []))
      .catch(() => setDishes([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="bg-white rounded-2xl p-8 shadow space-y-5">
      <h2 className="text-2xl font-semibold">Food Cost / FCR</h2>
      <p className="text-xs text-gray-400">Shown brand-wide (not branch-specific).</p>
      {loading && <p className="text-gray-500">Loading…</p>}
      {!loading && <FcrIterationTimeline dishes={dishes} />}
    </section>
  );
}

/* ============================================================
 * PER-DAY ANALYTICS VIEW (LIVE)
 * ========================================================== */
function DailyAnalyticsView({ branches }) {
  const [branch, setBranch] = useState(branches[0]?.branchCode || "");
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!branch && branches[0]) setBranch(branches[0].branchCode);
  }, [branches, branch]);

  const fetchData = async () => {
    if (!branch || !date) {
      toast.info("Select a branch and date");
      return;
    }
    setLoading(true);
    try {
      const res = await api.get("/api/client/analytics/daily", { params: { branchCode: branch, date } });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="bg-white rounded-2xl p-6 shadow grid md:grid-cols-3 gap-4 items-end">
        <BranchSelect branches={branches} value={branch} onChange={setBranch} />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={fetchData} className="bg-black text-white py-2 rounded-lg text-sm">Apply</button>
      </div>

      {loading && <p className="text-center">Loading…</p>}
      {data && (
        <div className="bg-[#111] text-white rounded-2xl p-8">
          <h2 className="text-3xl font-bold mb-6">Per Day Analytics</h2>
          {data.noData ? (
            <p className="text-gray-300">No sales data for this day.</p>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              <Stat title="Total Orders" value={data.totalOrders} />
              <Stat title="Total Revenue" value={formatCurrency(data.totalRevenue)} />
              <Stat title="Net Revenue" value={formatCurrency(data.netRevenue)} />
              <Stat title="Total Taxes" value={formatCurrency(data.totalTaxes)} />
              <Stat title="Total Discounts" value={formatCurrency(data.totalDiscounts)} />
              <Stat title="Avg Order Value" value={formatCurrency(data.avgOrderValue)} />
              <Stat title="Avg Item Selling Price" value={formatCurrency(data.avgItemSellingPrice)} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ============================================================
 * RANGE ANALYTICS VIEW (LIVE)
 * ========================================================== */
function RangeAnalyticsView({ branches }) {
  const [branch, setBranch] = useState(branches[0]?.branchCode || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!branch && branches[0]) setBranch(branches[0].branchCode);
  }, [branches, branch]);

  const fetchData = async () => {
    if (!branch || !startDate || !endDate) {
      toast.info("Select a branch and both dates");
      return;
    }
    setLoading(true);
    try {
      const res = await api.get("/api/client/analytics/range", {
        params: { branchCode: branch, startDate, endDate },
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="bg-white rounded-2xl p-6 shadow grid md:grid-cols-4 gap-4 items-end">
        <BranchSelect branches={branches} value={branch} onChange={setBranch} />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={fetchData} className="bg-black text-white py-2 rounded-lg text-sm">Fetch</button>
      </div>

      {loading && <p className="text-center">Loading…</p>}
      {data && (
        <div className="bg-[#111] text-white rounded-2xl p-8">
          <h2 className="text-3xl font-bold mb-6">Analytics (Date Range)</h2>
          {data.noData ? (
            <p className="text-gray-300">No sales data in this range.</p>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              <Stat title="Total Orders" value={data.totalOrders} />
              <Stat title="Total Revenue" value={formatCurrency(data.totalRevenue)} />
              <Stat title="Net Revenue" value={formatCurrency(data.netRevenue)} />
              <Stat title="Total Taxes" value={formatCurrency(data.totalTaxes)} />
              <Stat title="Total Discounts" value={formatCurrency(data.totalDiscounts)} />
              <Stat title="Avg Order Value" value={formatCurrency(data.avgOrderValue)} />
              <Stat title="Avg Item Selling Price" value={formatCurrency(data.avgItemSellingPrice)} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ============================================================
 * INVOICES VIEW
 * ========================================================== */
function InvoicesView({ branches }) {
  const [branch, setBranch] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [grns, setGrns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState(null);
  const [viewGrnFor, setViewGrnFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, grn] = await Promise.all([
        api.get("/api/client/invoices", { params: branch ? { branchCode: branch } : {} }),
        api.get("/api/client/grns").catch(() => ({ data: { data: [] } })),
      ]);
      setInvoices(inv.data || []);
      setGrns(grn.data?.data || []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    load();
  }, [load]);

  // Pay a manual invoice via Razorpay: pay-direct → checkout → verify-payment.
  const payInvoice = async (inv) => {
    if (inv.source === "PRODUCTION_ORDER") {
      toast.info("Pay production invoices from the banner at the top of the dashboard.");
      return;
    }
    setPayingId(inv.id);
    try {
      const { data } = await api.post(`/api/client/invoices/${inv.id}/pay-direct`);
      const options = {
        key: data.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: Math.round(Number(data.total) * 100),
        currency: "INR",
        order_id: data.razorpayOrderId,
        name: "Skope Kitchens",
        description: `${inv.type} Invoice`,
        handler: async (response) => {
          try {
            await api.post(`/api/client/invoices/${inv.id}/verify-payment`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success("Invoice paid");
            await load();
          } catch (err) {
            toast.error(err.response?.data?.message || "Payment verification failed");
          } finally {
            setPayingId(null);
          }
        },
        modal: { ondismiss: () => setPayingId(null) },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to start payment");
      setPayingId(null);
    }
  };

  // GRNs the client can see, indexed by linked invoice id.
  const grnByInvoice = {};
  grns.forEach((g) => (g.linkedInvoiceIds || []).forEach((id) => (grnByInvoice[id] = g)));

  // Group manual invoices: parents carry their supplementaries; production stays flat.
  const manual = invoices.filter((i) => i.source !== "PRODUCTION_ORDER");
  const production = invoices.filter((i) => i.source === "PRODUCTION_ORDER");
  const byId = Object.fromEntries(manual.map((i) => [i.id, i]));
  const parents = manual.filter((i) => !i.parentInvoiceId || !byId[i.parentInvoiceId]);
  const suppsByParent = {};
  manual
    .filter((i) => i.parentInvoiceId && byId[i.parentInvoiceId])
    .forEach((s) => {
      (suppsByParent[s.parentInvoiceId] = suppsByParent[s.parentInvoiceId] || []).push(s);
    });

  const renderRow = (inv, isSupp = false) => {
    const grn = grnByInvoice[inv.id];
    return (
      <div
        key={`${inv.source}-${inv.id}`}
        className={`flex flex-wrap items-center justify-between gap-3 py-3 ${isSupp ? "pl-5 border-l-2 border-purple-200" : ""}`}
      >
        <div className="text-sm">
          <span className="font-medium">
            {isSupp ? "Supplementary" : inv.type}
            {inv.source === "PRODUCTION_ORDER" && <span className="ml-1 text-xs text-amber-600">(production)</span>}
          </span>{" "}
          <span className="text-gray-700">₹{formatMoney(inv.total ?? inv.amount)}</span>
          {Number(inv.commission) > 0 && (
            <span className="text-xs text-gray-400 ml-1">
              (incl. ₹{formatMoney(inv.commission)} commission)
            </span>
          )}
          {isSupp && inv.supplementaryReason && (
            <span className="text-xs text-gray-500 ml-1">— {inv.supplementaryReason}</span>
          )}
          {inv.attachmentUrl && (
            <a href={inv.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline ml-2">
              {inv.attachmentName || "attachment"}
            </a>
          )}
          {inv.notes && <div className="text-xs text-gray-400">{inv.notes}</div>}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              inv.status === "PAID" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {inv.status}
          </span>
          {inv.status === "PAID" && grn && (
            <button onClick={() => setViewGrnFor(grn)} className="text-xs text-blue-600 underline">
              View GRN
            </button>
          )}
          {inv.status === "UNPAID" && inv.source !== "PRODUCTION_ORDER" && (
            <button
              onClick={() => payInvoice(inv)}
              disabled={payingId === inv.id}
              className="bg-black text-white px-4 py-1.5 rounded-lg text-xs disabled:opacity-50"
            >
              {payingId === inv.id ? "Paying…" : "Pay Now"}
            </button>
          )}
          {inv.status === "UNPAID" && inv.source === "PRODUCTION_ORDER" && (
            <span className="text-xs text-gray-400">Pay from banner ↑</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="bg-white rounded-2xl p-8 shadow space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-semibold">Invoices</h2>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.branchCode} value={b.branchCode}>
              {b.displayName}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}
      {!loading && invoices.length === 0 && <p className="text-gray-500">No invoices yet.</p>}

      {!loading && invoices.length > 0 && (
        <div className="divide-y">
          {parents.map((p) => (
            <div key={p.id}>
              {renderRow(p)}
              {(suppsByParent[p.id] || []).map((s) => renderRow(s, true))}
            </div>
          ))}
          {production.map((p) => renderRow(p))}
        </div>
      )}

      {viewGrnFor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setViewGrnFor(null)}>
          <div className="bg-white p-6 rounded-xl w-[640px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Goods Received Note</h3>
              <button onClick={() => setViewGrnFor(null)} className="text-gray-400 hover:text-black">
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Received {new Date(viewGrnFor.date).toLocaleDateString()}</p>
            <GrnItemsTable items={viewGrnFor.items} />
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================================
 * GOODS RECEIVED NOTES VIEW (read-only)
 * ========================================================== */
function GrnItemsTable({ items }) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">Ingredient</th>
            <th className="p-2 text-left">Vendor</th>
            <th className="p-2 text-right">Received</th>
            <th className="p-2 text-left">UOM</th>
            <th className="p-2 text-right">Unit Price</th>
          </tr>
        </thead>
        <tbody>
          {(items || []).map((it, i) => (
            <tr key={i} className="border-t">
              <td className="p-2 font-medium">{it.itemName}</td>
              <td className="p-2 text-gray-500">{it.vendorName || "—"}</td>
              <td className="p-2 text-right">{formatMoney(it.receivedQty)}</td>
              <td className="p-2 uppercase text-xs text-gray-500">{it.uom}</td>
              <td className="p-2 text-right">₹{formatMoney(it.finalUnitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GrnView() {
  const [grns, setGrns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/client/grns");
        setGrns(res.data?.data || []);
      } catch {
        setGrns([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className="bg-white rounded-2xl p-8 shadow space-y-5">
      <h2 className="text-2xl font-semibold">Goods Received Notes</h2>
      <p className="text-sm text-gray-500">
        Purchases linked to your paid procurement invoices. Each note appears once the related invoice(s) are paid
        and the received quantity has been confirmed.
      </p>

      {loading && <p className="text-gray-500">Loading…</p>}
      {!loading && grns.length === 0 && <p className="text-gray-500">No goods received notes yet.</p>}

      <div className="space-y-5">
        {grns.map((g) => (
          <div key={g.grnId} className="border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">GRN · {new Date(g.date).toLocaleDateString()}</span>
              <span className="text-xs text-gray-400">
                {(g.linkedInvoiceIds || []).map((id) => `INV-${id.slice(-4).toUpperCase()}`).join(", ")}
              </span>
            </div>
            <GrnItemsTable items={g.items} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
 * PROFILE VIEW
 * ========================================================== */
function ProfileView({ profile, onChangeLogo }) {
  const stageLabel = {
    AWAITING_MENU: "Awaiting Menu",
    IN_TRIAL: "In Trial",
    LIVE: "Live",
  };
  return (
    <section className="bg-white rounded-2xl p-8 shadow space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold">Profile</h2>
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-slate-100 border flex items-center justify-center overflow-hidden">
          {profile?.logoUrl ? (
            <img src={profile.logoUrl} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg text-gray-400">{(profile?.brandName || "?").charAt(0)}</span>
          )}
        </div>
        <button onClick={onChangeLogo} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
          Change Logo
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <Field label="Brand Name" value={profile?.brandName} />
        <Field label="Company" value={profile?.company} />
        <Field label="Email" value={profile?.email} />
        <Field label="Mobile" value={profile?.mobile} />
        <Field label="Lifecycle Stage" value={stageLabel[profile?.lifecycleStage] || profile?.lifecycleStage} />
        <Field
          label="Assigned Branches"
          value={(profile?.assignedBranches || []).map((c) => BRANCH_DISPLAY[c] || c).join(", ")}
        />
      </div>
    </section>
  );
}

function Field({ label, value }) {
  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
