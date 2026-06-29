import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../utils/api";
import { authUtils } from "../utils/auth";
import toast from "../utils/toast";
import Footer from "../components/Footer";
import FcrIterationTimeline from "../components/FcrIterationTimeline";

/* ============================================================
 * Head Chef Dashboard (#4 of 6, B2C) — base kitchen JP Nagar.
 * Code role: RECIPE_MANAGER. Owns recipe lifecycle, promote-to-final, bulk
 * sub-recipe production planning, dispatch to local kitchens, indents + vendor
 * alerts to the Stock Manager, SEMI_FINISHED audit, ingredient lists to POC, and
 * Rista reconciliation. NEVER touches money (frozen).
 * The legacy Admin Dashboard stays reachable for recipe editing during parity.
 * ========================================================== */

const BRANCH_DISPLAY = {
  JPNAGAR: "JP Nagar",
  TESTBRANCH: "Test Branch",
  MARATHAHALLI: "Marathahalli",
  KALYANNAGAR: "Kalyan Nagar",
  JPNAGAR_KITCHEN: "JP Nagar (Assembly)",
};
const loc = (code) =>
  BRANCH_DISPLAY[code] ||
  String(code || "").toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// Dispatch destinations (local kitchens). TESTBRANCH is included so the test
// Local Kitchen login (branchCode TESTBRANCH) can receive dispatches end-to-end.
const LOCAL_KITCHENS = ["MARATHAHALLI", "KALYANNAGAR", "JPNAGAR_KITCHEN", "TESTBRANCH"];
const TRIAL_CODES = ["T1", "T2", "T3"];
const TRAINING_CODES = ["TR1", "TR2", "TR3"];

const today = () => new Date().toISOString().slice(0, 10);
const errMsg = (e, fallback) => e?.response?.data?.message || fallback;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");

const WORKSPACE_ITEMS = [
  { key: "recipes", label: "Recipes (Main + Sub)" },
  { key: "import", label: "Recipe Import" },
  { key: "trials", label: "Trials (T1/T2/T3)" },
  { key: "training", label: "Training (TR1/TR2/TR3)" },
  { key: "promote", label: "Promote to Final" },
  { key: "plan", label: "Production Planning" },
  { key: "dispatch", label: "Sub-Recipe Dispatch" },
  { key: "indents", label: "Indents" },
  { key: "qc", label: "QC Failures" },
  { key: "alerts", label: "Vendor Alerts" },
  { key: "audit", label: "Base Kitchen Audit" },
  { key: "reorder", label: "Reorder Insights" },
  { key: "rista", label: "Stock (Rista)" },
  { key: "fcr", label: "FCR Iterations" },
  { key: "menu", label: "Menu & Projections" },
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
const emptyP = (txt) => <p className="text-sm text-gray-500">{txt}</p>;

/* ============================================================
 * MAIN
 * ========================================================== */
export default function HeadChef() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState("home"); // home | brand
  const [selected, setSelected] = useState(null); // { brandName, clientId }
  const [activeView, setActiveView] = useState("recipes");

  useEffect(() => {
    if (authUtils.getRole() !== "RECIPE_MANAGER") {
      navigate("/login");
      return;
    }
    setAuthorized(true);
  }, [navigate]);

  const openBrand = (b) => {
    setSelected({ brandName: b.brandName, clientId: b.clientId });
    setActiveView("recipes");
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
      <nav className="bg-white shadow-sm w-11/12 lg:w-9/12 mx-auto mt-4 rounded-full border border-gray-100">
        <div className="flex justify-between items-center h-16 px-8">
          <Link to="/" className="flex items-center">
            <img src="/assets/Logo-Dark.png" className="w-[160px]" alt="Skope Kitchens" />
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/admin-dashboard" className={btnGhost} title="Legacy recipe editor (parity fallback)">
              Legacy Admin Dashboard
            </Link>
            <button onClick={logout} className="bg-black text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 transition">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          {mode !== "home" && (
            <button onClick={() => { setMode("home"); setSelected(null); }} className={btnGhost}>
              ← Brands
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Head Chef</h1>
            <p className="text-sm text-gray-500">Base kitchen — JP Nagar</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-screen">
        {mode === "home" && <HomeView onOpenBrand={openBrand} />}
        {mode === "brand" && selected && (
          <div className="flex">
            <aside className={`${collapsed ? "w-16" : "w-60"} shrink-0 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] transition-all`}>
              <button onClick={() => setCollapsed((c) => !c)} className="w-full px-4 py-3 text-left text-gray-500 hover:text-gray-900">
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
              <h2 className="text-xl font-bold mb-4">{selected.brandName}</h2>
              {activeView === "recipes" && <RecipesView brandName={selected.brandName} />}
              {activeView === "import" && <RecipeImportView brandName={selected.brandName} />}
              {activeView === "trials" && <IterationsInfoView phase="TRIAL" />}
              {activeView === "training" && <IterationsInfoView phase="TRAINING" />}
              {activeView === "promote" && <PromoteView brandName={selected.brandName} />}
              {activeView === "plan" && <PlanView brandName={selected.brandName} />}
              {activeView === "dispatch" && <DispatchView brandName={selected.brandName} />}
              {activeView === "indents" && <IndentsView brandName={selected.brandName} />}
              {activeView === "qc" && <QcView brandName={selected.brandName} />}
              {activeView === "alerts" && <AlertsView brandName={selected.brandName} />}
              {activeView === "audit" && <AuditView brandName={selected.brandName} />}
              {activeView === "reorder" && <ReorderView brandName={selected.brandName} />}
              {activeView === "rista" && <RistaView brandName={selected.brandName} />}
              {activeView === "fcr" && <FcrView brandName={selected.brandName} clientId={selected.clientId} />}
              {activeView === "menu" && <MenuProjectionsView brandName={selected.brandName} />}
            </main>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

/* ============================================================
 * HOME — brand picker
 * ========================================================== */
function HomeView({ onOpenBrand }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/head-chef/brands-summary");
      setBrands(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load brands"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">Brands</h2>
        <button onClick={load} className={btnGhost}>Refresh</button>
      </div>
      {loading && emptyP("Loading…")}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {brands.map((b) => (
          <button
            key={b.brandName}
            onClick={() => onOpenBrand(b)}
            className="text-left bg-white border border-gray-200 rounded-2xl shadow-sm p-5 hover:border-gray-400 hover:shadow transition"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-900">{b.brandName}</span>
              {b.lifecycleStage && <span className={pill("bg-gray-100 text-gray-700")}>{b.lifecycleStage}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <span>{b.mainRecipes} main recipes</span>
              <span>{b.confirmedFinals} confirmed finals</span>
              <span className={b.pendingTrials ? "text-amber-700 font-medium" : ""}>{b.pendingTrials} pending trials</span>
              <span className={b.pendingTraining ? "text-amber-700 font-medium" : ""}>{b.pendingTraining} pending training</span>
              <span className={b.pendingIndents ? "text-blue-700 font-medium" : ""}>{b.pendingIndents} pending indents</span>
              <span className={b.qcFailures ? "text-red-600 font-medium" : ""}>{b.qcFailures} QC failures</span>
            </div>
          </button>
        ))}
        {!loading && brands.length === 0 && emptyP("No brands found.")}
      </div>
    </div>
  );
}

/* ============================================================
 * 1. RECIPES — entry points + new-ingredient form
 * ========================================================== */
function RecipesView({ brandName }) {
  const [form, setForm] = useState({ itemName: "", uom: "", ingredientBrand: "" });
  const [saving, setSaving] = useState(false);

  const addIngredient = async () => {
    if (!form.itemName.trim()) return toast.error("Ingredient name is required");
    setSaving(true);
    try {
      await api.post("/api/head-chef/ingredient", form);
      toast.success("Ingredient added to catalog");
      setForm({ itemName: "", uom: "", ingredientBrand: "" });
    } catch (e) {
      toast.error(errMsg(e, "Failed to add ingredient"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card title="Build recipes">
        <p className="text-sm text-gray-600 mb-3">
          Recipe building (Main, Sub, BOM mapping) uses the existing builders. They write to the same
          recipe collections this dashboard reads from.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/add-recipe" className={btn}>+ Main / Sub Recipe</Link>
          <Link to="/add-trial-recipe" className={btn}>+ Trial Recipe</Link>
          <Link to="/add-training-recipe" className={btn}>+ Training Recipe</Link>
          <Link to="/admin-dashboard" className={btnGhost}>Open Recipe Editor</Link>
        </div>
      </Card>

      <Card title="Add a new ingredient to the catalog">
        <p className="text-sm text-gray-600 mb-3">
          Add an ingredient when a recipe needs something new. Shelf-life and minimum-stock thresholds
          are set later by the Store Manager.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className={inputCls} placeholder="Ingredient name" value={form.itemName}
            onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
          <input className={inputCls} placeholder="UOM (e.g. KG, GM, PC)" value={form.uom}
            onChange={(e) => setForm({ ...form, uom: e.target.value })} />
          <input className={inputCls} placeholder="Manufacturer brand (optional)" value={form.ingredientBrand}
            onChange={(e) => setForm({ ...form, ingredientBrand: e.target.value })} />
        </div>
        <div className="mt-3">
          <button className={btn} disabled={saving} onClick={addIngredient}>{saving ? "Saving…" : "Add ingredient"}</button>
        </div>
      </Card>
    </>
  );
}

/* ============================================================
 * 1b. RECIPE IMPORT (bulk onboarding via Excel template) — CLAUDE.md §26
 * ========================================================== */
function RecipeImportView({ brandName }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { plan, warnings, errors, confirmationToken }
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState(null);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    setPreview(null);
    setResult(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      toast.error("Please choose an .xlsx file");
      e.target.value = "";
      setFile(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("File is too large (max 5MB)");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(f);
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/api/head-chef/recipe-import-template", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "recipe_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errMsg(e, "Failed to download template"));
    }
  };

  const runPreview = async () => {
    if (!file) return toast.error("Choose an .xlsx file first");
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("brandName", brandName);
      form.append("file", file);
      const res = await api.post("/api/head-chef/recipe-import-preview", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(res.data);
      if (res.data.errors?.length) toast.error(`Preview found ${res.data.errors.length} blocking error(s)`);
      else toast.success("Preview ready — review and confirm");
    } catch (e) {
      toast.error(errMsg(e, "Preview failed"));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file || !preview?.confirmationToken) return;
    setCommitting(true);
    try {
      const form = new FormData();
      form.append("brandName", brandName);
      form.append("file", file);
      form.append("confirmationToken", preview.confirmationToken);
      const res = await api.post("/api/head-chef/recipe-import-commit", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const c = res.data.created || {};
      setResult(res.data);
      setPreview(null);
      setFile(null);
      toast.success(`Import successful: ${c.itemMasters || 0} ItemMasters, ${c.subRecipes || 0} SubRecipes, ${c.mainRecipes || 0} MainRecipes created`);
    } catch (e) {
      const errs = e?.response?.data?.errors;
      if (Array.isArray(errs) && errs.length) {
        toast.error("Import rejected — fix the errors and preview again");
        setPreview((p) => (p ? { ...p, errors: errs, confirmationToken: null } : p));
      } else {
        toast.error(errMsg(e, "Import failed and was rolled back"));
      }
    } finally {
      setCommitting(false);
    }
  };

  const plan = preview?.plan;
  const hasErrors = (preview?.errors?.length || 0) > 0;

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 mb-5 text-sm">
        After import, verify the recipes in the <span className="font-semibold">Recipes</span> tab. Once imported,
        the BOM drives all stock cascades — incorrect data here causes cascading stock errors. Units must be
        GM, KG or PC. Sub-recipe references in MainRecipes use the <span className="font-mono">SR: </span> prefix.
        Prices are not imported (FCR pricing is entered later by the POC).
      </div>

      <Card title="Recipe Import" right={<span className="text-sm text-gray-500">Brand: <span className="font-semibold text-gray-800">{brandName}</span></span>}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button className={btnGhost} onClick={downloadTemplate}>Download Excel Template</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
          <input type="file" accept=".xlsx" onChange={onFileChange} className={`${inputCls} py-1.5`} />
          <button className={btn} onClick={runPreview} disabled={busy || !file}>
            {busy ? "Checking…" : "Preview"}
          </button>
        </div>
        {file && <p className="text-xs text-gray-600 mt-2">{file.name} — {(file.size / 1024).toFixed(0)} KB</p>}
      </Card>

      {preview && (
        <Card title="Preview">
          {plan && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <PlanStat label="ItemMasters — new" value={plan.itemMastersToCreate} />
              <PlanStat label="ItemMasters — exist" value={plan.itemMastersAlreadyExist} muted />
              <PlanStat label="SubRecipes — new" value={plan.subRecipesToCreate} />
              <PlanStat label="SubRecipes — update" value={plan.subRecipesToUpdate} muted />
              <PlanStat label="MainRecipes — new" value={plan.mainRecipesToCreate} />
              <PlanStat label="MainRecipes — update" value={plan.mainRecipesToUpdate} muted />
            </div>
          )}

          {hasErrors && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-red-700 mb-1">{preview.errors.length} blocking error(s) — fix and preview again:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-red-700">
                {preview.errors.map((er, i) => <li key={i}>{er}</li>)}
              </ul>
            </div>
          )}

          {preview.warnings?.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-amber-700 mb-1">Warnings (non-blocking):</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-amber-700">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <button
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={commit}
            disabled={hasErrors || committing || !preview.confirmationToken}
          >
            {committing ? "Importing…" : "Confirm Import"}
          </button>
          {hasErrors && <span className="ml-3 text-xs text-gray-500">Resolve all errors to enable import.</span>}
        </Card>
      )}

      {result && (
        <Card title="Import complete">
          <ul className="text-sm text-gray-700 space-y-1">
            {(result.log || []).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <p className="text-xs text-gray-500 mt-3">Open the Recipes tab to verify the imported recipes.</p>
        </Card>
      )}
    </>
  );
}

function PlanStat({ label, value, muted }) {
  return (
    <div className={`rounded-xl border p-3 ${muted ? "border-gray-200 bg-gray-50" : "border-gray-300 bg-white"}`}>
      <div className={`text-2xl font-bold ${muted ? "text-gray-500" : "text-gray-900"}`}>{value ?? 0}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

/* ============================================================
 * 2/3. TRIALS / TRAINING — entry points + send-ingredient-list-to-POC
 * (the POC then makes the SKOPE_PROCURES vs CLIENT_PROCURES call)
 * ========================================================== */
function IterationsInfoView({ phase }) {
  const codes = phase === "TRIAL" ? TRIAL_CODES : TRAINING_CODES;
  const addLink = phase === "TRIAL" ? "/add-trial-recipe" : "/add-training-recipe";
  return (
    <Card title={`${phase === "TRIAL" ? "Trial" : "Training"} recipes`}>
      <p className="text-sm text-gray-600 mb-3">
        Build {phase === "TRIAL" ? "T1 → T2 → T3" : "TR1 → TR2 → TR3"} iterations using the builder.
        Keep the dish name spelled identically across iterations so the FCR view groups them. The cost
        timeline for every iteration lives under <span className="font-medium">FCR Iterations</span>.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <Link to={addLink} className={btn}>+ Add {phase === "TRIAL" ? "Trial" : "Training"} Recipe</Link>
      </div>
      <p className="text-xs text-gray-500">Codes: {codes.join(" · ")}. Send an iteration's ingredient list to the POC from the FCR Iterations view.</p>
    </Card>
  );
}

/* ============================================================
 * 4. PROMOTE TO FINAL
 * ========================================================== */
function PromoteView({ brandName }) {
  const [recipeName, setRecipeName] = useState("");
  const [sourceCode, setSourceCode] = useState("TR3");
  const [busy, setBusy] = useState(false);

  const promote = async () => {
    if (!recipeName.trim()) return toast.error("Recipe name is required");
    setBusy(true);
    try {
      const res = await api.post("/api/head-chef/promote-to-final", { brandName, recipeName: recipeName.trim(), sourceCode });
      toast.success(`Final recipe ${res.data?.data?.action === "UPDATED" ? "updated" : "created"} from ${sourceCode}`);
      setRecipeName("");
    } catch (e) {
      toast.error(errMsg(e, "Failed to promote"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Promote a training recipe to Final">
      <p className="text-sm text-gray-600 mb-3">
        Copies the chosen training iteration's BOM into the brand's Final (Main) recipe. The Final cost
        tile then appears automatically in everyone's FCR view.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input className={inputCls} placeholder="Dish / recipe name" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
        <select className={inputCls} value={sourceCode} onChange={(e) => setSourceCode(e.target.value)}>
          {TRAINING_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className={btn} disabled={busy} onClick={promote}>{busy ? "Promoting…" : "Promote to Final"}</button>
      </div>
    </Card>
  );
}

/* ============================================================
 * 5. PRODUCTION PLANNING
 * ========================================================== */
function PlanView({ brandName }) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/head-chef/production-plan", { params: { brandName, date } });
      setRows(res.data?.data || []);
      setMeta({ considered: res.data?.projectionsConsidered ?? 0 });
    } catch (e) {
      toast.error(errMsg(e, "Failed to build plan"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [brandName]);

  return (
    <Card title="What to cook in bulk" right={
      <div className="flex items-center gap-2">
        <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className={btnGhost} onClick={load}>Load</button>
      </div>
    }>
      {loading ? emptyP("Loading…") : rows.length === 0 ? emptyP(`No confirmed projections for ${fmtDate(date)}.`) : (
        <>
          {meta && <p className="text-xs text-gray-500 mb-2">{meta.considered} confirmed projection(s) considered.</p>}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">Sub-recipe</th><th className="py-2 pr-2">Total required</th><th className="py-2 pr-2">Per kitchen</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.subRecipeName} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-medium">{r.subRecipeName}</td>
                  <td className="py-2 pr-2">{r.totalRequiredQty} {r.uom}</td>
                  <td className="py-2 pr-2 text-gray-600">
                    {r.perKitchenBreakdown.map((k) => `${loc(k.branchCode)}: ${k.qty}`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

/* ============================================================
 * 6. SUB-RECIPE DISPATCH
 * ========================================================== */
function DispatchView({ brandName }) {
  const [form, setForm] = useState({ subRecipeName: "", qty: "", uom: "", toBranchCode: LOCAL_KITCHENS[0] });
  const [busy, setBusy] = useState(false);
  const [dispatches, setDispatches] = useState([]);
  const [requests, setRequests] = useState([]);
  const [discreps, setDiscreps] = useState([]);

  const load = useCallback(async () => {
    try {
      const [d, rq, dc] = await Promise.all([
        api.get("/api/head-chef/dispatches", { params: { brandName } }),
        api.get("/api/head-chef/requests", { params: { brandName } }),
        api.get("/api/head-chef/dispatches/discrepancies"),
      ]);
      setDispatches(d.data?.data || []);
      setRequests(rq.data?.data || []);
      setDiscreps((dc.data?.data || []).filter((x) => x.brandName?.toLowerCase() === brandName.toLowerCase()));
    } catch (e) {
      toast.error(errMsg(e, "Failed to load dispatches"));
    }
  }, [brandName]);
  useEffect(() => { load(); }, [load]);

  const dispatch = async (fulfillRequestId) => {
    if (!form.subRecipeName.trim() || !form.qty || !form.toBranchCode) return toast.error("Sub-recipe, qty and destination are required");
    setBusy(true);
    try {
      await api.post("/api/head-chef/dispatch", {
        brandName, subRecipeName: form.subRecipeName.trim(), qty: Number(form.qty),
        uom: form.uom.trim(), toBranchCode: form.toBranchCode, fulfillRequestId,
      });
      toast.success("Dispatched");
      setForm({ subRecipeName: "", qty: "", uom: "", toBranchCode: LOCAL_KITCHENS[0] });
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to dispatch"));
    } finally {
      setBusy(false);
    }
  };

  const statusPill = (s) => ({
    REQUESTED: "bg-amber-100 text-amber-800", DISPATCHED: "bg-blue-100 text-blue-800",
    RECEIVED: "bg-green-100 text-green-800", DISCREPANCY: "bg-red-100 text-red-700",
  }[s] || "bg-gray-100 text-gray-700");

  return (
    <>
      {requests.length > 0 && (
        <Card title={`Incoming requests from kitchens (${requests.length})`}>
          <table className="w-full text-sm">
            <tbody>
              {requests.map((r) => (
                <tr key={r._id} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-medium">{r.subRecipeName}</td>
                  <td className="py-2 pr-2">{r.qty} {r.uom}</td>
                  <td className="py-2 pr-2 text-gray-600">{loc(r.toBranchCode)}</td>
                  <td className="py-2 pr-2 text-right">
                    <button className={btnGhost} onClick={() => { setForm({ subRecipeName: r.subRecipeName, qty: String(r.qty || ""), uom: r.uom || "", toBranchCode: r.toBranchCode }); }}>
                      Prefill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Dispatch a sub-recipe">
        <p className="text-sm text-gray-600 mb-3">Deducts from the base-kitchen fridge (SEMI_FINISHED) now; the receiving kitchen's stock is credited when they acknowledge receipt.</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input className={inputCls} placeholder="Sub-recipe name" value={form.subRecipeName} onChange={(e) => setForm({ ...form, subRecipeName: e.target.value })} />
          <input className={inputCls} type="number" placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          <input className={inputCls} placeholder="UOM" value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
          <select className={inputCls} value={form.toBranchCode} onChange={(e) => setForm({ ...form, toBranchCode: e.target.value })}>
            {LOCAL_KITCHENS.map((b) => <option key={b} value={b}>{loc(b)}</option>)}
          </select>
        </div>
        <div className="mt-3"><button className={btn} disabled={busy} onClick={() => dispatch()}>{busy ? "Dispatching…" : "Dispatch"}</button></div>
      </Card>

      {discreps.length > 0 && (
        <Card title={`Discrepancies flagged by kitchens (${discreps.length})`}>
          {discreps.map((d) => (
            <div key={d._id} className="border-b border-gray-100 py-2 text-sm">
              <span className="font-medium">{d.subRecipeName}</span> · {d.qty} {d.uom} → {loc(d.toBranchCode)}
              <span className="text-red-600 ml-2">{d.discrepancyNote || "No note"}</span>
            </div>
          ))}
        </Card>
      )}

      <Card title="Recent dispatches">
        {dispatches.length === 0 ? emptyP("No dispatches yet.") : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">Sub-recipe</th><th className="py-2 pr-2">Qty</th><th className="py-2 pr-2">To</th>
              <th className="py-2 pr-2">Status</th><th className="py-2 pr-2">When</th>
            </tr></thead>
            <tbody>
              {dispatches.map((d) => (
                <tr key={d._id} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-medium">{d.subRecipeName}</td>
                  <td className="py-2 pr-2">{d.qty} {d.uom}</td>
                  <td className="py-2 pr-2">{loc(d.toBranchCode)}</td>
                  <td className="py-2 pr-2"><span className={pill(statusPill(d.status))}>{d.status}</span></td>
                  <td className="py-2 pr-2 text-gray-500">{fmtDate(d.dispatchedAt || d.createdAt)}</td>
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
 * 7. INDENTS
 * ========================================================== */
function IndentsView({ brandName }) {
  const [list, setList] = useState([]);
  const [rows, setRows] = useState([{ itemName: "", ingredientBrand: "", qty: "", uom: "" }]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/head-chef/indents", { params: { brandName } });
      setList(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load indents"));
    }
  }, [brandName]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const items = rows
      .map((r) => ({ itemName: r.itemName.trim(), ingredientBrand: r.ingredientBrand.trim(), qty: Number(r.qty || 0), uom: r.uom.trim() }))
      .filter((r) => r.itemName && r.ingredientBrand);
    if (items.length === 0) return toast.error("Each row needs item name + manufacturer brand");
    setBusy(true);
    try {
      await api.post("/api/head-chef/indents/custom", { brandName, items });
      toast.success("Indent raised to Store Manager");
      setRows([{ itemName: "", ingredientBrand: "", qty: "", uom: "" }]);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to raise indent"));
    } finally {
      setBusy(false);
    }
  };

  const statusPill = (s) => ({
    INDENT_PENDING: "bg-amber-100 text-amber-800", INDENT_VERIFIED: "bg-blue-100 text-blue-800",
    INDENT_ISSUING: "bg-purple-100 text-purple-800", ISSUED: "bg-green-100 text-green-800",
  }[s] || "bg-gray-100 text-gray-700");

  return (
    <>
      <Card title="Raise a custom indent">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
            <input className={inputCls} placeholder="Item name" value={r.itemName} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} />
            <input className={inputCls} placeholder="Manufacturer brand" value={r.ingredientBrand} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, ingredientBrand: e.target.value } : x))} />
            <input className={inputCls} type="number" placeholder="Qty" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
            <input className={inputCls} placeholder="UOM" value={r.uom} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, uom: e.target.value } : x))} />
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <button className={btnGhost} onClick={() => setRows([...rows, { itemName: "", ingredientBrand: "", qty: "", uom: "" }])}>+ Row</button>
          <button className={btn} disabled={busy} onClick={submit}>{busy ? "Raising…" : "Raise indent"}</button>
        </div>
      </Card>

      <Card title="Indent queue">
        {list.length === 0 ? emptyP("No indents.") : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">Item</th><th className="py-2 pr-2">Qty</th><th className="py-2 pr-2">Source</th>
              <th className="py-2 pr-2">In warehouse</th><th className="py-2 pr-2">Status</th>
            </tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d._id} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-medium">{d.itemName}</td>
                  <td className="py-2 pr-2">{d.qty} {d.uom}</td>
                  <td className="py-2 pr-2"><span className={pill("bg-gray-100 text-gray-700")}>{d.source}</span></td>
                  <td className="py-2 pr-2 text-gray-600">{d.warehouseStockAvailable != null ? `${d.warehouseStockAvailable} ${d.uom || ""}` : "—"}</td>
                  <td className="py-2 pr-2"><span className={pill(statusPill(d.status))}>{d.status}</span></td>
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
 * 8. QC FAILURES
 * ========================================================== */
function QcView({ brandName }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    api.get("/api/head-chef/qc-failures", { params: { brandName } })
      .then((r) => setList(r.data?.data || []))
      .catch((e) => toast.error(errMsg(e, "Failed to load QC failures")));
  }, [brandName]);

  return (
    <Card title="QC failures (from Store Manager)">
      {list.length === 0 ? emptyP("No QC failures.") : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-2">Item</th><th className="py-2 pr-2">Vendor</th><th className="py-2 pr-2">QC</th>
            <th className="py-2 pr-2">Planned/Recv</th><th className="py-2 pr-2">Note</th>
          </tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d._id} className="border-b border-gray-100">
                <td className="py-2 pr-2 font-medium">{d.itemName}</td>
                <td className="py-2 pr-2">{d.vendorName || "—"}</td>
                <td className="py-2 pr-2"><span className={pill("bg-red-100 text-red-700")}>{d.qcStatus}</span></td>
                <td className="py-2 pr-2 text-gray-600">{d.plannedQty}/{d.receivedQty} {d.uom}</td>
                <td className="py-2 pr-2 text-gray-600">{d.qcNote || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ============================================================
 * 9. VENDOR ALERTS (raise)
 * ========================================================== */
function AlertsView({ brandName }) {
  const [form, setForm] = useState({ ingredientName: "", note: "" });
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/head-chef/vendor-alerts", { params: { brandName } });
      setList(res.data?.data || []);
    } catch (e) { toast.error(errMsg(e, "Failed to load alerts")); }
  }, [brandName]);
  useEffect(() => { load(); }, [load]);

  const raise = async () => {
    if (!form.ingredientName.trim()) return toast.error("Ingredient name is required");
    setBusy(true);
    try {
      await api.post("/api/head-chef/vendor-alerts", { brandName, ...form });
      toast.success("Vendor alert raised");
      setForm({ ingredientName: "", note: "" });
      load();
    } catch (e) { toast.error(errMsg(e, "Failed to raise alert")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Card title="Raise a vendor alert">
        <p className="text-sm text-gray-600 mb-3">The Store Manager sees and resolves these in their Vendor Alerts view.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Ingredient" value={form.ingredientName} onChange={(e) => setForm({ ...form, ingredientName: e.target.value })} />
          <input className={inputCls} placeholder="Note (what's wrong)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="mt-3"><button className={btn} disabled={busy} onClick={raise}>{busy ? "Raising…" : "Raise alert"}</button></div>
      </Card>

      <Card title="My raised alerts">
        {list.length === 0 ? emptyP("None raised.") : list.map((a) => (
          <div key={a._id} className="border-b border-gray-100 py-2 text-sm flex items-center justify-between">
            <span><span className="font-medium">{a.ingredientName}</span> — {a.note || "no note"}</span>
            <span className={pill(a.status === "OPEN" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>{a.status}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ============================================================
 * 10. BASE KITCHEN AUDIT (SEMI_FINISHED)
 * ========================================================== */
function AuditView({ brandName }) {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/head-chef/audit/${encodeURIComponent(brandName)}`, { params: { date } });
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

  const save = async () => {
    try {
      await api.post(`/api/head-chef/audit/${encodeURIComponent(brandName)}`, { date, items: payload() });
      toast.success("Draft saved");
      load();
    } catch (e) { toast.error(errMsg(e, "Failed to save")); }
  };
  const lock = async (correction) => {
    try {
      await api.patch(`/api/head-chef/audit/${encodeURIComponent(brandName)}/lock`, { date, items: payload(), correction });
      toast.success(correction ? "Correction recorded" : "Audit locked");
      load();
    } catch (e) { toast.error(errMsg(e, "Failed to lock")); }
  };
  const payload = () => items.map((r) => ({
    itemName: r.itemName, uom: r.uom, expectedQty: Number(r.expectedQty || 0), actualQty: Number(r.actualQty || 0),
    varianceReason: r.varianceReason || undefined, reasonNote: r.reasonNote || "",
  }));

  return (
    <Card title="Base-kitchen SEMI_FINISHED audit" right={
      <div className="flex items-center gap-2">
        <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className={btnGhost} onClick={load}>Load</button>
      </div>
    }>
      {loading ? emptyP("Loading…") : items.length === 0 ? emptyP("No prepared (SEMI_FINISHED) stock to audit for this brand.") : (
        <>
          {locked && <p className="text-xs text-green-700 mb-2">Locked {fmtDate(locked)} — edits below are recorded as a correction.</p>}
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

/* ============================================================
 * 11. REORDER INSIGHTS
 * ========================================================== */
function ReorderView({ brandName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/head-chef/reorder-insights", { params: { brandName } });
      setRows(res.data?.data || []);
    } catch (e) { toast.error(errMsg(e, "Failed to load insights")); }
    finally { setLoading(false); }
  }, [brandName]);
  useEffect(() => { load(); }, [load]);

  const raise = async (r) => {
    try {
      await api.post("/api/head-chef/indents/custom", {
        brandName,
        items: [{ itemName: r.itemName, ingredientBrand: "Generic", qty: r.shortfall || r.requiredQty || 0, uom: r.uom }],
      });
      toast.success(`Indent raised for ${r.itemName}`);
    } catch (e) { toast.error(errMsg(e, "Failed to raise indent")); }
  };

  return (
    <Card title="Reorder insights" right={<button className={btnGhost} onClick={load}>Refresh</button>}>
      {loading ? emptyP("Loading…") : rows.length === 0 ? emptyP("Nothing to show.") : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-2">Item</th><th className="py-2 pr-2">On hand</th><th className="py-2 pr-2">Needed (next day)</th>
            <th className="py-2 pr-2">Shortfall</th><th className="py-2 pr-2"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemName} className="border-b border-gray-100">
                <td className="py-2 pr-2 font-medium">{r.itemName}</td>
                <td className="py-2 pr-2">{r.currentQty} {r.uom}</td>
                <td className="py-2 pr-2">{r.requiredQty} {r.uom}</td>
                <td className={`py-2 pr-2 ${r.shortfall > 0 ? "text-red-600 font-medium" : "text-gray-400"}`}>{r.shortfall} {r.uom}</td>
                <td className="py-2 pr-2 text-right">{r.shortfall > 0 && <button className={btnGhost} onClick={() => raise(r)}>Raise indent</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ============================================================
 * 12. STOCK (RISTA) RECONCILIATION
 * ========================================================== */
function RistaView({ brandName }) {
  const [branchCode, setBranchCode] = useState("JPNAGAR");
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/api/head-chef/rista-stock-comparison", { params: { brandName, branchCode } });
      setRes(r.data);
    } catch (e) { toast.error(errMsg(e, "Failed to load comparison")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [brandName]);

  return (
    <Card title="Purchase Register vs Rista POS" right={
      <div className="flex items-center gap-2">
        <select className={inputCls} value={branchCode} onChange={(e) => setBranchCode(e.target.value)}>
          {["JPNAGAR", "MARATHAHALLI", "KALYANNAGAR"].map((b) => <option key={b} value={b}>{loc(b)}</option>)}
        </select>
        <button className={btnGhost} onClick={load}>Compare</button>
      </div>
    }>
      {loading ? emptyP("Loading…") : !res ? emptyP("Run a comparison.") : !res.configured ? (
        <p className="text-sm text-amber-700">{res.message || "Rista not configured for this kitchen yet."}</p>
      ) : (res.rows || []).length === 0 ? emptyP("No items to compare.") : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-2">Item</th><th className="py-2 pr-2">Rista</th><th className="py-2 pr-2">Purchase Register</th>
            <th className="py-2 pr-2">Variance</th>
          </tr></thead>
          <tbody>
            {res.rows.map((r) => (
              <tr key={r.itemName} className="border-b border-gray-100">
                <td className="py-2 pr-2 font-medium">{r.itemName}</td>
                <td className="py-2 pr-2">{r.ristaQty} {r.uom}</td>
                <td className="py-2 pr-2">{r.purchaseRegisterQty} {r.uom}</td>
                <td className={`py-2 pr-2 ${Math.abs(r.variance) > 0 ? "text-red-600 font-medium" : "text-gray-400"}`}>
                  {r.variance} {r.variancePercent != null ? `(${r.variancePercent}%)` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ============================================================
 * 13. FCR ITERATIONS (read-only) + send ingredient list to POC
 * ========================================================== */
function FcrView({ brandName, clientId }) {
  const [dishes, setDishes] = useState([]);
  const [sendForm, setSendForm] = useState({ phase: "TRIAL", code: "T1", recipeName: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/api/head-chef/fcr/${encodeURIComponent(brandName)}`)
      .then((r) => setDishes(r.data?.data || []))
      .catch((e) => toast.error(errMsg(e, "Failed to load FCR")));
  }, [brandName]);

  const codes = sendForm.phase === "TRIAL" ? TRIAL_CODES : TRAINING_CODES;

  // Dishes that actually have an iteration at the selected phase + code — these
  // are the only valid recipes to send. Derived from the loaded FCR dishes
  // (getDishIterations), so no extra request and already brand-scoped.
  const recipeOptions = dishes
    .filter((d) => (d.iterations || []).some((it) => it.phase === sendForm.phase && it.code === sendForm.code))
    .map((d) => d.recipeName);

  // Keep the picked recipe valid whenever phase/code (and thus options) change.
  useEffect(() => {
    if (!recipeOptions.includes(sendForm.recipeName)) {
      setSendForm((f) => ({ ...f, recipeName: recipeOptions[0] || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendForm.phase, sendForm.code, dishes]);

  const sendList = async () => {
    if (!clientId) return toast.error("No client id for this brand");
    if (!sendForm.recipeName) return toast.error("Pick a recipe to send");
    setBusy(true);
    try {
      const res = await api.post(`/api/head-chef/clients/${clientId}/ingredient-list`, sendForm);
      toast.success(`Sent ${res.data?.data?.items?.length || 0} ingredients for "${sendForm.recipeName}" to POC`);
    } catch (e) { toast.error(errMsg(e, "Failed to send list")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Card title="Send an ingredient list to the POC">
        <p className="text-sm text-gray-600 mb-3">Pick a dish and its iteration; the ingredient list is generated from that recipe's BOM and sent to the POC for the procurement decision.</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select className={inputCls} value={sendForm.phase} onChange={(e) => setSendForm({ ...sendForm, phase: e.target.value, code: (e.target.value === "TRIAL" ? TRIAL_CODES : TRAINING_CODES)[0] })}>
            <option value="TRIAL">Trial</option>
            <option value="TRAINING">Training</option>
          </select>
          <select className={inputCls} value={sendForm.code} onChange={(e) => setSendForm({ ...sendForm, code: e.target.value })}>
            {codes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className={inputCls}
            value={sendForm.recipeName}
            onChange={(e) => setSendForm({ ...sendForm, recipeName: e.target.value })}
            disabled={recipeOptions.length === 0}
          >
            {recipeOptions.length === 0
              ? <option value="">No recipes</option>
              : <>
                  <option value="">Select a dish…</option>
                  {recipeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </>}
          </select>
          <button className={btn} disabled={busy || !sendForm.recipeName} onClick={sendList}>{busy ? "Sending…" : "Send to POC"}</button>
        </div>
        {recipeOptions.length === 0 && (
          <p className="text-sm text-amber-700 mt-3">
            No {sendForm.code} {sendForm.phase === "TRIAL" ? "trial" : "training"} recipes yet — create one in the {sendForm.phase === "TRIAL" ? "Trials" : "Training"} tab first.
          </p>
        )}
      </Card>

      <Card title="FCR iteration timeline">
        <p className="text-xs text-gray-500 mb-3">Final-recipe prices are edited via the recipe editor (Recipes → Open Recipe Editor). This view is read-only.</p>
        {dishes.length === 0 ? emptyP("No dishes yet.") : <FcrIterationTimeline dishes={dishes} showConfirmation={false} />}
      </Card>
    </>
  );
}

/* ============================================================
 * 14. MENU & PROJECTIONS (read-only)
 * ========================================================== */
function MenuProjectionsView({ brandName }) {
  const [menu, setMenu] = useState([]);
  const [projections, setProjections] = useState([]);

  useEffect(() => {
    api.get(`/api/head-chef/menu/${encodeURIComponent(brandName)}`).then((r) => setMenu(r.data?.data || [])).catch(() => {});
    api.get(`/api/head-chef/projections/${encodeURIComponent(brandName)}`).then((r) => setProjections(r.data?.data || [])).catch(() => {});
  }, [brandName]);

  return (
    <>
      <Card title="Submitted menu">
        {menu.length === 0 ? emptyP("No menu submitted.") : menu.map((m) => (
          <div key={m._id} className="border-b border-gray-100 py-2 text-sm">
            <span className="text-gray-500">{loc(m.branchCode)} · {fmtDate(m.createdAt)}</span>
            <div className="text-gray-800">{(m.items || []).map((it) => `${it.recipeName} ×${it.qty}`).join(", ")}</div>
          </div>
        ))}
      </Card>
      <Card title="Projections">
        {projections.length === 0 ? emptyP("No projections.") : projections.map((p) => (
          <div key={p._id} className="border-b border-gray-100 py-2 text-sm">
            <span className="text-gray-500">{loc(p.branchCode)} · {p.type} · for {fmtDate(p.forDate)} · {p.status}</span>
            <div className="text-gray-800">{(p.items || []).map((it) => `${it.recipeName} ×${it.targetQty}`).join(", ")}</div>
          </div>
        ))}
      </Card>
    </>
  );
}
