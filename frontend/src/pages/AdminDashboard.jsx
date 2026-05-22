import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import BrandList from "./BrandList";
import BrandDrawer from "./BrandDrawer";
import api from "../utils/api";
import { fetchFoodCost } from "../utils/costingapi";
import { authUtils } from "../utils/auth";
import toast from "../utils/toast";

const AdminDashboard = () => {
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRecipesModal, setShowRecipesModal] = useState(false);
  const [showMapIngredientsModal, setShowMapIngredientsModal] = useState(false);
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [showTrialTrainingModal, setShowTrialTrainingModal] = useState(false);
  const [showIngredientsModal, setShowIngredientsModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showIngredientInventoryModal, setShowIngredientInventoryModal] = useState(false);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRecipeInventoryModal, setShowRecipeInventoryModal] = useState(false);
  const [notifCounts, setNotifCounts] = useState(null);
  const [showFcrModal, setShowFcrModal] = useState(false);
  const [showCheckStockModal, setShowCheckStockModal] = useState(false);
  const [showStockUpdateModal, setShowStockUpdateModal] = useState(false);
  const navigate = useNavigate();
  const search = typeof window !== "undefined" ? window.location.search : "";

  // Role is derived from the JWT payload stored in sessionStorage.
  // This is the same role the backend will decode — guaranteed to be in sync.
  const adminRole = authUtils.getRole();

  const handleLogout = () => {
    authUtils.clearAuth();
    localStorage.removeItem("token");
    localStorage.removeItem("userType");
    navigate("/");
  };

  const isWalletManager = adminRole === "WALLET_MANAGER";
  const isRecipeManager = adminRole === "RECIPE_MANAGER";
  const isIngredientManager = adminRole === "INGREDIENT_MANAGER";

  const hasMenuOptions = isRecipeManager || isIngredientManager;
  const canManageBrand = isWalletManager || isRecipeManager;

  useEffect(() => {
    if (!isRecipeManager && !isIngredientManager) return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const res = await api.get("/api/admin/notification-counts");
        if (!cancelled) setNotifCounts(res.data?.data || null);
      } catch {
        if (!cancelled) setNotifCounts(null);
      }
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isRecipeManager, isIngredientManager]);

  useEffect(() => {
    if (!isRecipeManager) return;
    if (search.includes("indent=1")) {
      setShowMapIngredientsModal(true);
    }
  }, [isRecipeManager, search]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-8 relative">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>

          <div className="flex items-center gap-3 relative">
            {/* Role-based menu icon */}
            {hasMenuOptions && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMenu((prev) => !prev)}
                  className="bg-black text-white px-3 py-2 rounded-lg hover:bg-gray-800 transition flex items-center justify-center text-lg"
                  aria-haspopup="menu"
                  aria-expanded={showMenu}
                >
                  ≡
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    {isRecipeManager && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            navigate("/add-trial-recipe");
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          Add Trial Recipe
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            navigate("/add-training-recipe");
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          Add Training Recipe
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            navigate("/add-recipe");
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          Add Final Recipe
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            setShowTrialTrainingModal(true);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          View Trial & Training
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            setShowMapIngredientsModal(true);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          Indent Request
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            setShowRecipesModal(true);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          Update Recipe
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            setShowGrnModal(true);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          <span className="flex items-center justify-between">
                            <span>GRN</span>
                            {Number(notifCounts?.grn || 0) > 0 && (
                              <span className="h-2 w-2 rounded-full bg-red-500" />
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            setShowRecipeInventoryModal(true);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          Inventory
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            setShowFcrModal(true);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                          FCR
                        </button>
                        
                      </>
                    )}
                    {isIngredientManager && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setShowIngredientsModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Update Ingredients
                      </button>
                    )}
                    {isIngredientManager && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setShowIngredientInventoryModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        <span className="flex items-center justify-between">
                          <span>Inventory</span>
                          {Number(notifCounts?.indent || 0) > 0 && (
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                          )}
                        </span>
                      </button>
                    )}
                    {isIngredientManager && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setShowCreditNoteModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Credit Note
                      </button>
                    )}
                    {isIngredientManager && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setShowInventoryModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Stock (Rista)
                      </button>
                    )}
                    {isIngredientManager && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setShowCheckStockModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Check Stock
                      </button>
                    )}
                    {isIngredientManager && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setShowStockUpdateModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        Stock Update
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleLogout}
              className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Brand list visible to all admin roles; drawer only for wallet/order managers */}
        <BrandList
          key={refreshKey}
          onSelectBrand={canManageBrand ? setSelectedBrand : undefined}
          canManage={canManageBrand}
        />

        {canManageBrand && selectedBrand && (
          <BrandDrawer
            brand={selectedBrand}
            adminRole={adminRole}
            onClose={() => {
              setSelectedBrand(null);
              setRefreshKey((k) => k + 1);
            }}
          />
        )}

        {/* Warehouse Dispatch Queue — visible to Ingredient Manager only */}
        {isIngredientManager && <WarehouseDispatchSection />}

        {/* Recipe update modal only for recipe managers */}
        {isRecipeManager && showRecipesModal && (
          <RecipesModal onClose={() => setShowRecipesModal(false)} />
        )}

        {/* Map Ingredients modal only for recipe managers */}
        {isRecipeManager && showMapIngredientsModal && (
          <MapIngredientsModal onClose={() => setShowMapIngredientsModal(false)} />
        )}

        {/* Ingredient update modal only for ingredient managers */}
        {isIngredientManager && showIngredientsModal && (
          <IngredientsModal onClose={() => setShowIngredientsModal(false)} />
        )}

        {/* Inventory modal only for ingredient managers */}
        {isIngredientManager && showInventoryModal && (
          <InventoryModal onClose={() => setShowInventoryModal(false)} />
        )}

        {/* Ingredient inventory (Indent/Issue) */}
        {isIngredientManager && showIngredientInventoryModal && (
          <IngredientInventoryModal
            onClose={() => setShowIngredientInventoryModal(false)}
          />
        )}

        {/* Credit Note alerts for ingredient manager */}
        {isIngredientManager && showCreditNoteModal && (
          <CreditNoteModal onClose={() => setShowCreditNoteModal(false)} />
        )}

        {/* Recipe admin inventory */}
        {isRecipeManager && showRecipeInventoryModal && (
          <RecipeInventoryModal
            onClose={() => setShowRecipeInventoryModal(false)}
          />
        )}

        {/* Check Stock modal for ingredient manager */}
        {isIngredientManager && showCheckStockModal && (
          <CheckStockModal onClose={() => setShowCheckStockModal(false)} />
        )}

        {/* Stock Update modal for ingredient manager */}
        {isIngredientManager && showStockUpdateModal && (
          <StockUpdateModal onClose={() => setShowStockUpdateModal(false)} />
        )}

        {/* FCR breakdown modal */}
        {isRecipeManager && showFcrModal && (
          <FcrModal onClose={() => setShowFcrModal(false)} />
        )}

        {/* GRN modal for recipe manager */}
        {isRecipeManager && showGrnModal && (
          <GrnModal onClose={() => setShowGrnModal(false)} />
        )}

        {/* Trial & Training list modal */}
        {isRecipeManager && showTrialTrainingModal && (
          <TrialTrainingModal
            onClose={() => setShowTrialTrainingModal(false)}
          />
        )}
      </div>
    </Layout>
  );
};

/* ---------- INVENTORY MODAL ---------- */
function InventoryModal({ onClose }) {
  const [branchCode, setBranchCode] = useState("AMSJ");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchInventory = async (code) => {
    if (!code) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/inventory/items", {
        params: { branchCode: code },
      });
      setItems(res.data?.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to fetch inventory items"
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory(branchCode);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Inventory</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="p-6 border-b flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Branch Code
            </label>
            <input
              type="text"
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="e.g. AMSJ"
            />
          </div>
          <button
            type="button"
            onClick={() => fetchInventory(branchCode)}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-black text-white text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Avg Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-4 text-center text-gray-500"
                      >
                        Loading inventory...
                      </td>
                    </tr>
                  )}
                  {!loading && items.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-4 text-center text-gray-500"
                      >
                        No items found.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    items.map((item) => (
                      <tr key={item.skuCode} className="border-t">
                        <td className="px-3 py-2">{item.skuCode}</td>
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.categoryName}</td>
                        <td className="px-3 py-2">{item.measuringUnit}</td>
                        <td className="px-3 py-2 text-right">
                          {Number(item.itemQty || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ₹{Number(item.averageCost || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- INGREDIENTS BULK UPDATE MODAL ---------- */
function IngredientsModal({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchIngredients = async () => {
      try {
        setLoading(true);
        const res = await api.get("/api/admin/ingredients");
        const list = res.data?.ingredients || [];
        setRows(
          list.map((ing) => ({
            ...ing,
            percent: "",
            newPrice: ing.currentPrice,
          }))
        );
      } catch (err) {
        console.error("Failed to load ingredients", err);
      } finally {
        setLoading(false);
      }
    };
    fetchIngredients();
  }, []);

  const handlePercentChange = (index, value) => {
    setRows((prev) => {
      const next = [...prev];
      const row = next[index];
      if (!row) return prev;
      const pct = Number(value) || 0;
      const base = Number(row.currentPrice) || 0;
      const newPrice = base + (base * pct) / 100;
      next[index] = {
        ...row,
        percent: value,
        newPrice: Number(newPrice.toFixed(2)),
      };
      return next;
    });
  };

  const handleNewPriceChange = (index, value) => {
    setRows((prev) => {
      const next = [...prev];
      const row = next[index];
      if (!row) return prev;
      const price = Number(value);
      next[index] = {
        ...row,
        newPrice: Number.isFinite(price) ? price : row.newPrice,
        percent: "",
      };
      return next;
    });
  };

  const handleSave = async () => {
    const updates = rows
      .filter(
        (r) =>
          typeof r.newPrice === "number" &&
          r.newPrice >= 0 &&
          r.newPrice !== r.currentPrice
      )
      .map((r) => ({
        refId: r.refId,
        uom: r.uom,
        newPrice: r.newPrice,
      }));

    if (updates.length === 0) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api.post("/api/admin/ingredients/bulk-update", { updates });
      onClose();
    } catch (err) {
      console.error("Failed to update ingredients", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Update Ingredients</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading ingredients...</p>
          ) : rows.length === 0 ? (
            <p className="text-gray-500 text-sm">No ingredients found.</p>
          ) : (
            <table className="w-full text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Ingredient</th>
                  <th className="p-2 text-center">UOM</th>
                  <th className="p-2 text-right">Current Price</th>
                  <th className="p-2 text-center w-32">% Increase</th>
                  <th className="p-2 text-right w-32">New Price</th>
                  <th className="p-2 text-center w-28">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{row.refId}</div>
                    </td>
                    <td className="p-2 text-center">{row.uom || "-"}</td>
                    <td className="p-2 text-right">
                      ₹{Number(row.currentPrice || 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        className="w-20 border rounded px-1 py-0.5 text-right"
                        value={row.percent}
                        onChange={(e) =>
                          handlePercentChange(index, e.target.value)
                        }
                        placeholder="%"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        className="w-24 border rounded px-1 py-0.5 text-right"
                        value={row.newPrice}
                        onChange={(e) =>
                          handleNewPriceChange(index, e.target.value)
                        }
                      />
                    </td>
                    <td className="p-2 text-center text-xs text-gray-500">
                      {row.pricesVary ? "Varies across recipes" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-black text-white disabled:opacity-50 hover:bg-gray-800"
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- RECIPES MODAL ---------- */
const TAB_MAIN = "main";
const TAB_SUB = "sub";

function RecipesModal({ onClose }) {
  const [tab, setTab] = useState(TAB_MAIN);
  const [mainList, setMainList] = useState([]);
  const [subList, setSubList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [items, setItems] = useState([]);
  const [sopLink, setSopLink] = useState("");
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoadingList(true);
      try {
        const [mainRes, subRes] = await Promise.all([
          api.get("/api/admin/recipes"),
          api.get("/api/admin/subrecipes"),
        ]);
        setMainList(mainRes.data || []);
        setSubList(subRes.data || []);
      } catch (err) {
        console.error("Failed to load recipe lists", err);
      } finally {
        setLoadingList(false);
      }
    };
    fetch();
  }, []);

  const loadMainRecipe = async (recipeId) => {
    setSelectedRecipe(null);
    setItems([]);
    setSopLink("");
    setLoadingRecipe(true);
    try {
      const res = await api.get(`/api/admin/recipes/${recipeId}`);
      const doc = res.data;
      setSelectedRecipe({ _id: doc._id, recipeName: doc.recipeName, brand: doc.brand, kind: TAB_MAIN });
      setItems(Array.isArray(doc.items) ? doc.items.map((i) => ({ ...i })) : []);
      setSopLink(doc.sopLink || "");
    } catch (err) {
      console.error("Failed to load main recipe", err);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const loadSubRecipe = async (id) => {
    setSelectedRecipe(null);
    setItems([]);
    setSopLink("");
    setLoadingRecipe(true);
    try {
      const res = await api.get(`/api/admin/subrecipes/${id}`);
      const doc = res.data;
      setSelectedRecipe({ _id: doc._id, recipeName: doc.recipeName, brand: doc.brand, kind: TAB_SUB });
      setItems(Array.isArray(doc.items) ? doc.items.map((i) => ({ ...i })) : []);
    } catch (err) {
      console.error("Failed to load sub recipe", err);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        type: "INGREDIENT",
        category: "Food",
        refId: "",
        quantity: 0,
        uom: "GM",
        netPrice: 0,
      },
    ]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedRecipe) return;
    setSaving(true);
    try {
      const payload = selectedRecipe.kind === TAB_MAIN ? { items, sopLink } : { items };
      if (selectedRecipe.kind === TAB_MAIN) {
        await api.put(`/api/admin/recipes/${selectedRecipe._id}`, payload);
      } else {
        await api.put(`/api/admin/subrecipes/${selectedRecipe._id}`, payload);
      }
      setSelectedRecipe(null);
      setItems([]);
      setSopLink("");
    } catch (err) {
      console.error("Failed to save recipe", err);
    } finally {
      setSaving(false);
    }
  };

  const list = tab === TAB_MAIN ? mainList : subList;
  const onSelect = tab === TAB_MAIN ? loadMainRecipe : loadSubRecipe;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Update Recipe</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => { setTab(TAB_MAIN); setSelectedRecipe(null); setItems([]); }}
            className={`px-6 py-3 font-medium ${tab === TAB_MAIN ? "border-b-2 border-black text-black" : "text-gray-500"}`}
          >
            Main Recipes
          </button>
          <button
            onClick={() => { setTab(TAB_SUB); setSelectedRecipe(null); setItems([]); }}
            className={`px-6 py-3 font-medium ${tab === TAB_SUB ? "border-b-2 border-black text-black" : "text-gray-500"}`}
          >
            Sub Recipes
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          <div className="w-72 border-r overflow-y-auto p-4">
            {loadingList ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : list.length === 0 ? (
              <p className="text-gray-500 text-sm">No recipes</p>
            ) : (
              <ul className="space-y-1">
                {list.map((r) => (
                  <li key={r._id}>
                    <button
                      onClick={() => onSelect(r._id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedRecipe?._id === r._id ? "bg-black text-white" : "hover:bg-gray-100"}`}
                    >
                      {r.recipeName}
                      {r.brand && <span className="opacity-80 ml-1">({r.brand})</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loadingRecipe ? (
              <p className="text-gray-500">Loading recipe...</p>
            ) : selectedRecipe ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    {selectedRecipe.recipeName}
                    {selectedRecipe.brand && <span className="text-gray-500 font-normal ml-2">({selectedRecipe.brand})</span>}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={addItem}
                      className="bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded text-sm"
                    >
                      Add ingredient
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-black text-white px-4 py-1.5 rounded text-sm disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
                {selectedRecipe.kind === TAB_MAIN && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SOP Link (Google Drive)
                    </label>
                    <input
                      type="url"
                      value={sopLink}
                      onChange={(e) => setSopLink(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <UpdateRecipeItemsTable
                  items={items}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                  isSubRecipe={selectedRecipe.kind === TAB_SUB}
                />
              </>
            ) : (
              <p className="text-gray-500">Select a recipe to edit.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- EDITABLE ITEMS TABLE FOR UPDATE RECIPE ---------- */
function UpdateRecipeItemsTable({ items, onUpdate, onRemove, isSubRecipe }) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            {!isSubRecipe && <th className="p-2 text-left w-28">Type</th>}
            <th className="p-2 text-left">Item</th>
            <th className="p-2 w-24">Qty</th>
            <th className="p-2 w-20">UOM</th>
            <th className="p-2 w-28">Price (₹)</th>
            <th className="p-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-t">
              {!isSubRecipe && (
                <td className="p-2">
                  <select
                    value={item.type || "INGREDIENT"}
                    onChange={(e) => onUpdate(index, "type", e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    <option value="INGREDIENT">INGREDIENT</option>
                    <option value="SUBRECIPE">SUBRECIPE</option>
                  </select>
                </td>
              )}
              <td className="p-2">
                <input
                  type="text"
                  value={item.refId ?? ""}
                  onChange={(e) => onUpdate(index, "refId", e.target.value)}
                  placeholder="Name"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={item.quantity ?? ""}
                  onChange={(e) => onUpdate(index, "quantity", parseFloat(e.target.value) || 0)}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </td>
              <td className="p-2">
                <select
                  value={item.uom || "GM"}
                  onChange={(e) => onUpdate(index, "uom", e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                >
                  <option value="PC">PC</option>
                  <option value="GM">GM</option>
                  <option value="KG">KG</option>
                </select>
              </td>
              <td className="p-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.netPrice ?? ""}
                  onChange={(e) => onUpdate(index, "netPrice", parseFloat(e.target.value) || 0)}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </td>
              <td className="p-2">
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- MAP INGREDIENTS MODAL ---------- */
const MAP_TAB_MAIN = "main";
const MAP_TAB_SUB = "sub";
const MAP_TAB_TRIAL = "trial";
const MAP_TAB_TRAINING = "training";

function MapIngredientsModal({ onClose }) {
  const [tab, setTab] = useState(MAP_TAB_MAIN);
  const [mainList, setMainList] = useState([]);
  const [subList, setSubList] = useState([]);
  const [trialList, setTrialList] = useState([]);
  const [trainingList, setTrainingList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [loadingAutoIngredients, setLoadingAutoIngredients] = useState(false);

  const [stores, setStores] = useState([]);
  const [branchCode, setBranchCode] = useState("");
  const [clientBrands, setClientBrands] = useState([]);
  const [clientBrandId, setClientBrandId] = useState("");
  const [clientBrandName, setClientBrandName] = useState("");
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  const emptyRow = () => ({
    skuCode: "",
    itemName: "",
    customItemName: "",
    ingredientBrand: "",
    categoryName: "",
    uom: "",
    qty: "",
  });

  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchLists = async () => {
      setLoadingList(true);
      try {
        const [mainRes, subRes, trialRes, trainingRes] = await Promise.all([
          api.get("/api/admin/recipes"),
          api.get("/api/admin/subrecipes"),
          api.get("/api/trial-recipes"),
          api.get("/api/training-recipes"),
        ]);
        setMainList(mainRes.data || []);
        setSubList(subRes.data || []);
        setTrialList(trialRes.data?.data || []);
        setTrainingList(trainingRes.data?.data || []);
      } catch (err) {
        console.error("Failed to load recipe lists", err);
      } finally {
        setLoadingList(false);
      }
    };
    fetchLists();
  }, []);

  useEffect(() => {
    const loadStores = async () => {
      try {
        const res = await api.get("/api/rista/stores");
        setStores(res.data?.stores || []);
      } catch (err) {
        console.error("Failed to load Rista stores", err);
        setStores([]);
      }
    };
    loadStores();
  }, []);

  useEffect(() => {
  const loadBrands = async () => {
    try {
      const res = await api.get("/api/admin/brand-names");
      const list = res.data?.data || [];
      setClientBrands(list);

      if (!clientBrandName && list.length) {
        setClientBrandName(list[0]);
      }
    } catch (err) {
      console.error("Failed to load brand names", err);
      setClientBrands([]);
    }
  };
  loadBrands();
}, []);

  useEffect(() => {
    const fetchInventory = async () => {
      if (!branchCode) {
        setInventoryItems([]);
        return;
      }
      setLoadingInventory(true);
      try {
        const res = await api.get("/api/inventory/items", {
          params: { branchCode },
        });
        setInventoryItems(res.data?.data || []);
      } catch (err) {
        console.error("Failed to load inventory items", err);
        setInventoryItems([]);
      } finally {
        setLoadingInventory(false);
      }
    };
    fetchInventory();
  }, [branchCode]);

  const list =
    tab === MAP_TAB_MAIN
      ? mainList
      : tab === MAP_TAB_SUB
      ? subList
      : tab === MAP_TAB_TRIAL
      ? trialList
      : trainingList;
  const recipeKind =
    tab === MAP_TAB_MAIN
      ? "main"
      : tab === MAP_TAB_SUB
      ? "sub"
      : tab === MAP_TAB_TRIAL
      ? "trial"
      : "training";

  const updateRow = (index, patch) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const onSelectIngredient = (index, itemName) => {
    if (itemName === "__CUSTOM__") {
      updateRow(index, {
        itemName: "",
        skuCode: "",
        categoryName: "",
        uom: "",
      });
      return;
    }
    const match = inventoryItems.find((it) => it.name === itemName);
    updateRow(index, {
      itemName,
      customItemName: "",
      skuCode: match?.skuCode || "",
      categoryName: match?.categoryName || "",
      uom: match?.measuringUnit || "",
    });
  };

  const addIngredientRow = () => setRows((prev) => [...prev, emptyRow()]);

  useEffect(() => {
    const autofill = async () => {
      if (!selectedRecipe?._id) return;
      try {
        setLoadingAutoIngredients(true);
        const res = await api.get(
          `/api/admin/recipe-ingredients/${recipeKind}/${selectedRecipe._id}`
        );
        const ingredients = res.data?.ingredients || [];

        const nextRows = ingredients.length
          ? ingredients.map((ing) => {
              const invMatch = inventoryItems.find(
                (it) =>
                  it?.name === ing.itemName || it?.skuCode === ing.itemName
              );

              if (invMatch) {
                return {
                  skuCode: invMatch.skuCode || "",
                  itemName: invMatch.name || ing.itemName || "",
                  customItemName: "",
                  ingredientBrand: ing.ingredientBrand || "",
                  categoryName:
                    ing.categoryName || invMatch.categoryName || "",
                  uom: ing.uom || invMatch.measuringUnit || "",
                  qty: ing.qty,
                };
              }

              // Fall back to custom ingredient if not present in Rista inventory list
              return {
                skuCode: "",
                itemName: "",
                customItemName: ing.itemName || "",
                ingredientBrand: ing.ingredientBrand || "",
                categoryName: ing.categoryName || "",
                uom: ing.uom || "",
                qty: ing.qty,
              };
            })
          : [emptyRow()];

        setRows(nextRows);
      } catch (err) {
        console.error("Failed to auto-fill indent ingredients:", err);
      } finally {
        setLoadingAutoIngredients(false);
      }
    };

    autofill();
    // Re-run when inventory list for the selected branch becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipe, recipeKind, branchCode, inventoryItems, loadingInventory]);

  const handleSave = async () => {
    if (!selectedRecipe?._id) return;
    if (!branchCode) return;
    if (!clientBrandName.trim()) return;
    const items = rows
      .map((r) => ({
        skuCode: r.skuCode,
        itemName: (r.itemName || r.customItemName || "").trim(),
        ingredientBrand: String(r.ingredientBrand || "").trim(),
        categoryName: r.categoryName,
        uom: r.uom,
        qty: Number(r.qty || 0),
      }))
      .filter((r) => r.itemName && r.ingredientBrand && r.uom && r.categoryName);

    setSaving(true);
    try {
      await api.post("/api/mapped-ingredients", {
        recipeId: selectedRecipe._id,
        recipeKind,
        branchCode,
        items,
      });

      // Send to Ingredient Admin (Indent)
      await api.post("/api/ingredient-indent", {
        recipeId: selectedRecipe._id,
        recipeKind,
        recipeName: selectedRecipe.recipeName,
        branchCode,
        clientBrandName: clientBrandName.trim(),
        items,
      });
      onClose();
    } catch (err) {
      console.error("Failed to save mapped ingredients", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Map Ingredients</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => { setTab(MAP_TAB_MAIN); setSelectedRecipe(null); }}
            className={`px-6 py-3 font-medium ${tab === MAP_TAB_MAIN ? "border-b-2 border-black text-black" : "text-gray-500"}`}
          >
            Main Recipes
          </button>
          <button
            onClick={() => { setTab(MAP_TAB_SUB); setSelectedRecipe(null); }}
            className={`px-6 py-3 font-medium ${tab === MAP_TAB_SUB ? "border-b-2 border-black text-black" : "text-gray-500"}`}
          >
            Sub Recipes
          </button>
          <button
            onClick={() => { setTab(MAP_TAB_TRIAL); setSelectedRecipe(null); }}
            className={`px-6 py-3 font-medium ${tab === MAP_TAB_TRIAL ? "border-b-2 border-black text-black" : "text-gray-500"}`}
          >
            Trial Recipes
          </button>
          <button
            onClick={() => { setTab(MAP_TAB_TRAINING); setSelectedRecipe(null); }}
            className={`px-6 py-3 font-medium ${tab === MAP_TAB_TRAINING ? "border-b-2 border-black text-black" : "text-gray-500"}`}
          >
            Training Recipes
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          <div className="w-72 border-r overflow-y-auto p-4">
            {loadingList ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : list.length === 0 ? (
              <p className="text-gray-500 text-sm">No recipes</p>
            ) : (
              <ul className="space-y-1">
                {list.map((r) => (
                  <li key={r._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRecipe(r)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                        selectedRecipe?._id === r._id
                          ? "bg-black text-white"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      {r.recipeName}
                      {r.brand && <span className="opacity-80 ml-1">({r.brand})</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!selectedRecipe ? (
              <p className="text-gray-500">Select a recipe to map ingredients.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Branch Code
                    </label>
                    <select
                      value={branchCode}
                      onChange={(e) => setBranchCode(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Select branch</option>
                      {stores.map((s) => (
                        <option key={s.storeCode} value={s.storeCode}>
                          {s.storeCode}{s.storeName ? ` — ${s.storeName}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client Brand (required)
                    </label>
                    <select
                      value={clientBrandName}
                      onChange={(e) => setClientBrandName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      {clientBrands.length === 0 ? (
                        <option value="">No brands</option>
                      ) : (
                        clientBrands.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="text-sm text-gray-500 flex items-end">
                    {loadingInventory && branchCode ? "Loading inventory..." : ""}
                  </div>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Ingredient</th>
                        <th className="p-2 text-left">Category</th>
                        <th className="p-2 text-left">Ing Brand</th>
                        <th className="p-2 text-left">UOM</th>
                        <th className="p-2 text-right w-28">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">
                            <select
                              value={r.itemName || (r.customItemName ? "__CUSTOM__" : "")}
                              onChange={(e) => onSelectIngredient(idx, e.target.value)}
                              className="w-full border rounded px-2 py-1 text-sm"
                              disabled={!branchCode}
                            >
                              <option value="">
                                {branchCode ? "Select ingredient" : "Select branch first"}
                              </option>
                              <option value="__CUSTOM__">Custom ingredient...</option>
                              {inventoryItems.map((it) => (
                                <option key={it.skuCode || it.name} value={it.name}>
                                  {it.name}
                                </option>
                              ))}
                            </select>
                            {!r.itemName && (
                              <input
                                type="text"
                                value={r.customItemName}
                                onChange={(e) =>
                                  updateRow(idx, { customItemName: e.target.value })
                                }
                                placeholder="Enter ingredient name"
                                className="mt-2 w-full border rounded px-2 py-1 text-sm"
                              />
                            )}
                          </td>
                          <td className="p-2">
                            <select
                              value={r.categoryName || ""}
                              onChange={(e) =>
                                updateRow(idx, { categoryName: e.target.value })
                              }
                              className="w-full border rounded px-2 py-1 text-sm"
                            >
                              <option value="">Select</option>
                              <option value="Food">Food</option>
                              <option value="Packaging">Packaging</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={r.ingredientBrand}
                              onChange={(e) =>
                                updateRow(idx, { ingredientBrand: e.target.value })
                              }
                              placeholder="e.g. Tata"
                              className="w-full border rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={r.uom || ""}
                              onChange={(e) => updateRow(idx, { uom: e.target.value })}
                              className="w-full border rounded px-2 py-1 text-sm"
                            >
                              <option value="">Select</option>
                              <option value="ML">ml</option>
                              <option value="GM">gm</option>
                              <option value="PC">piece</option>
                              <option value="KG">KG</option>
                            </select>
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              className="w-24 border rounded px-2 py-1 text-right text-sm"
                              value={r.qty}
                              onChange={(e) => updateRow(idx, { qty: e.target.value })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <button
                    type="button"
                    onClick={addIngredientRow}
                    className="text-blue-600 text-sm font-medium hover:underline"
                  >
                    + Add Ingredient
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={
                      saving ||
                      !branchCode ||
                      !clientBrandName.trim()
                    }
                    className="bg-black text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                  >
                    {saving ? "Sending..." : "Send Request to Store"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- INGREDIENT INVENTORY MODAL (Indent/Issue) ---------- */
function IngredientInventoryModal({ onClose }) {
  const [tab, setTab] = useState("indent"); // indent | issue
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifyCosts, setVerifyCosts] = useState({});

  const fetchRows = async (activeTab) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/ingredient-indent", {
        params:
          activeTab === "issue"
            ? { status: "ISSUED" }
            : undefined,
      });
      let list = res.data?.data || [];
      if (activeTab === "indent") {
        list = list.filter((r) => r.status !== "ISSUED");
      }
      setRows(list);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows(tab);
  }, [tab]);

  const verify = async (id) => {
    try {
      const cost = verifyCosts[id];
      await api.patch(`/api/ingredient-indent/${id}/verify`, { cost });
      await fetchRows("indent");
    } catch (err) {
      toast.error(err.response?.data?.message || "Verify failed");
    }
  };

  const issue = async (id) => {
    try {
      await api.patch(`/api/ingredient-indent/${id}/issue`);
      await fetchRows("indent");
      toast.success("Item issued successfully");
    } catch (err) {
      toast.error(err.response?.data?.message || "Issue failed");
    }
  };

  const deleteIssued = async (id) => {
    if (!window.confirm("Delete this issued item? This cannot be undone.")) return;
    try {
      await api.delete(`/api/ingredient-indent/${id}`);
      setRows((prev) => prev.filter((r) => r._id !== id));
      await fetchRows("issue");
    } catch (err) {
      toast.error(err.response?.data?.message || "Delete failed");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Inventory</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setTab("indent")}
            className={`px-6 py-3 font-medium ${
              tab === "indent"
                ? "border-b-2 border-black text-black"
                : "text-gray-500"
            }`}
          >
            Indent
          </button>
          <button
            type="button"
            onClick={() => setTab("issue")}
            className={`px-6 py-3 font-medium ${
              tab === "issue"
                ? "border-b-2 border-black text-black"
                : "text-gray-500"
            }`}
          >
            Issue
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Brand</th>
                  <th className="p-2 text-left">Client</th>
                  <th className="p-2 text-left">Recipe</th>
                  <th className="p-2 text-left">Ingredient</th>
                  <th className="p-2 text-left">Ing Brand</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-left">UOM</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Cost</th>
                  <th className="p-2 text-center w-56">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-gray-500">
                      No records.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r._id} className="border-t">
                      <td className="p-2">{r.requestBrandName || "—"}</td>
                      <td className="p-2">{r.clientBrandName || "—"}</td>
                      <td className="p-2">
                        <div className="font-medium">{r.recipeName || "—"}</div>
                        <div className="text-xs text-gray-500">{r.branchCode}</div>
                      </td>
                      <td className="p-2">{r.itemName}</td>
                      <td className="p-2">{r.ingredientBrand || "—"}</td>
                      <td className="p-2">{r.categoryName || "—"}</td>
                      <td className="p-2">{r.uom || "—"}</td>
                      <td className="p-2 text-right">{Number(r.qty || 0)}</td>
                      <td className="p-2 text-right">₹{Number(r.cost || 0).toFixed(2)}</td>
                      <td className="p-2 text-center">
                        {tab === "issue" ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
                              Issued
                            </span>
                            <button
                              type="button"
                              onClick={() => deleteIssued(r._id)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        ) : r.status === "INDENT_PENDING" ? (
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Cost"
                              value={verifyCosts[r._id] ?? ""}
                              onChange={(e) =>
                                setVerifyCosts((prev) => ({
                                  ...prev,
                                  [r._id]: e.target.value,
                                }))
                              }
                              className="w-24 border rounded px-2 py-1 text-xs text-right"
                            />
                            <button
                              type="button"
                              onClick={() => verify(r._id)}
                              className="bg-black text-white px-3 py-1.5 rounded text-xs hover:bg-gray-800"
                            >
                              Verify
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded">
                              Verified
                            </span>
                            <button
                              type="button"
                              onClick={() => issue(r._id)}
                              className="bg-green-600 text-white px-3 py-1.5 rounded text-xs hover:bg-green-700"
                            >
                              Issue
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- GRN MODAL (Recipe admin view of issued items) ---------- */
function GrnModal({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ingredientName, setIngredientName] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get("/api/ingredient-indent", {
          params: { status: "ISSUED" },
        });
        setRows(res.data?.data || []);
      } catch (err) {
        console.error("Failed to load GRN", err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">GRN</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Credit note alert (ingredient not issued on time)
              </label>
              <input
                type="text"
                value={ingredientName}
                onChange={(e) => setIngredientName(e.target.value)}
                placeholder="Enter ingredient name"
                className="border rounded-lg px-3 py-2 text-sm w-80"
              />
            </div>
            <button
              type="button"
              disabled={sending || !ingredientName.trim()}
              onClick={async () => {
                try {
                  setSending(true);
                  await api.post("/api/credit-notes", {
                    ingredientName: ingredientName.trim(),
                  });
                  setIngredientName("");
                  toast.success("Credit note alert sent to Ingredient Admin");
                } catch (err) {
                  toast.error(err.response?.data?.message || "Failed to send credit note");
                } finally {
                  setSending(false);
                }
              }}
              className="bg-black text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Brand</th>
                  <th className="p-2 text-left">Recipe</th>
                  <th className="p-2 text-left">Ingredient</th>
                  <th className="p-2 text-left">Ing Brand</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-left">UOM</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Cost</th>
                  <th className="p-2 text-left">Issued At</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-gray-500">
                      No issued ingredients.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r._id} className="border-t">
                      <td className="p-2">{r.requestBrandName || "—"}</td>
                      <td className="p-2">
                        <div className="font-medium">{r.recipeName || "—"}</div>
                        <div className="text-xs text-gray-500">{r.branchCode}</div>
                      </td>
                      <td className="p-2">{r.itemName}</td>
                      <td className="p-2">{r.ingredientBrand || "—"}</td>
                      <td className="p-2">{r.categoryName || "—"}</td>
                      <td className="p-2">{r.uom || "—"}</td>
                      <td className="p-2 text-right">{Number(r.qty || 0)}</td>
                      <td className="p-2 text-right">₹{Number(r.cost || 0).toFixed(2)}</td>
                      <td className="p-2 text-left">
                        {r.issuedAt ? new Date(r.issuedAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- CREDIT NOTE MODAL (Ingredient admin alerts) ---------- */
function CreditNoteModal({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/credit-notes");
      setRows(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load credit notes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    if (!window.confirm("Delete this credit note alert?")) return;
    try {
      await api.delete(`/api/credit-notes/${id}`);
      setRows((prev) => prev.filter((r) => r._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete credit note");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Credit Note</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Ingredient</th>
                  <th className="p-2 text-left">Created At</th>
                  <th className="p-2 text-center w-32">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-gray-500">
                      No credit note alerts.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r._id} className="border-t">
                      <td className="p-2">{r.ingredientName}</td>
                      <td className="p-2">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => remove(r._id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- TRIAL & TRAINING RECIPES MODAL ---------- */
function TrialTrainingModal({ onClose }) {
  const TAB_TRIAL = "TRIAL";
  const TAB_TRAINING = "TRAINING";

  const [tab, setTab] = useState(TAB_TRIAL);
  const [trialList, setTrialList] = useState([]);
  const [trainingList, setTrainingList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [items, setItems] = useState([]);
  const [trainingSopLink, setTrainingSopLink] = useState("");
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadLists = async () => {
      setLoadingList(true);
      try {
        const [trialRes, trainingRes] = await Promise.all([
          api.get("/api/trial-recipes"),
          api.get("/api/training-recipes"),
        ]);
        setTrialList(trialRes.data?.data || []);
        setTrainingList(trainingRes.data?.data || []);
      } catch (err) {
        console.error("Failed to load trial/training lists", err);
        setTrialList([]);
        setTrainingList([]);
      } finally {
        setLoadingList(false);
      }
    };
    loadLists();
  }, []);

  const loadTrialRecipe = async (id) => {
    setSelectedRecipe(null);
    setItems([]);
    setTrainingSopLink("");
    setLoadingRecipe(true);
    try {
      const res = await api.get(`/api/trial-recipes/${id}`);
      const doc = res.data?.data || res.data;
      setSelectedRecipe({
        _id: doc._id,
        recipeName: doc.recipeName,
        brand: doc.brand,
        kind: TAB_TRIAL,
      });
      setItems(Array.isArray(doc.items) ? doc.items.map((i) => ({ ...i })) : []);
    } catch (err) {
      console.error("Failed to load trial recipe", err);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const loadTrainingRecipe = async (id) => {
    setSelectedRecipe(null);
    setItems([]);
    setTrainingSopLink("");
    setLoadingRecipe(true);
    try {
      const res = await api.get(`/api/training-recipes/${id}`);
      const doc = res.data?.data || res.data;
      setSelectedRecipe({
        _id: doc._id,
        recipeName: doc.recipeName,
        brand: doc.brand,
        kind: TAB_TRAINING,
      });
      setItems(Array.isArray(doc.items) ? doc.items.map((i) => ({ ...i })) : []);
      setTrainingSopLink(doc.sopLink || "");
    } catch (err) {
      console.error("Failed to load training recipe", err);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const deleteTrial = async (id) => {
    if (!window.confirm("Delete this trial recipe? This cannot be undone.")) return;
    try {
      await api.delete(`/api/trial-recipes/${id}`);
      setTrialList((prev) => prev.filter((r) => r._id !== id));
      if (selectedRecipe?._id === id) {
        setSelectedRecipe(null);
        setItems([]);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete trial recipe");
    }
  };

  const deleteTraining = async (id) => {
    if (!window.confirm("Delete this training recipe? This cannot be undone.")) return;
    try {
      await api.delete(`/api/training-recipes/${id}`);
      setTrainingList((prev) => prev.filter((r) => r._id !== id));
      if (selectedRecipe?._id === id) {
        setSelectedRecipe(null);
        setItems([]);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete training recipe");
    }
  };

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        type: "INGREDIENT",
        category: "Food",
        refId: "",
        quantity: 0,
        uom: "GM",
        netPrice: 0,
      },
    ]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedRecipe) return;
    setSaving(true);
    try {
      const payload = { items };
      if (selectedRecipe.kind === TAB_TRIAL) {
        await api.put(`/api/trial-recipes/${selectedRecipe._id}`, payload);
      } else {
        await api.put(`/api/training-recipes/${selectedRecipe._id}`, {
          ...payload,
          sopLink: trainingSopLink,
        });
      }
      setSelectedRecipe(null);
      setItems([]);
      setTrainingSopLink("");
    } catch (err) {
      console.error("Failed to save trial/training recipe", err);
    } finally {
      setSaving(false);
    }
  };

  const list = tab === TAB_TRIAL ? trialList : trainingList;
  const onSelect = tab === TAB_TRIAL ? loadTrialRecipe : loadTrainingRecipe;
  const onDelete = tab === TAB_TRIAL ? deleteTrial : deleteTraining;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Trial & Training Recipes</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => {
              setTab(TAB_TRIAL);
              setSelectedRecipe(null);
              setItems([]);
            }}
            className={`px-6 py-3 font-medium ${
              tab === TAB_TRIAL
                ? "border-b-2 border-black text-black"
                : "text-gray-500"
            }`}
          >
            Trial Recipes
          </button>
          <button
            onClick={() => {
              setTab(TAB_TRAINING);
              setSelectedRecipe(null);
              setItems([]);
            }}
            className={`px-6 py-3 font-medium ${
              tab === TAB_TRAINING
                ? "border-b-2 border-black text-black"
                : "text-gray-500"
            }`}
          >
            Training Recipes
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          <div className="w-72 border-r overflow-y-auto p-4">
            {loadingList ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : list.length === 0 ? (
              <p className="text-gray-500 text-sm">No recipes</p>
            ) : (
              <ul className="space-y-1">
                {list.map((r) => (
                  <li key={r._id}>
                    <div
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${
                        selectedRecipe?._id === r._id
                          ? "bg-black text-white"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(r._id)}
                        className="flex-1 text-left"
                      >
                        {r.recipeName}
                        {r.brand && (
                          <span className="opacity-80 ml-1">({r.brand})</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(r._id);
                        }}
                        className={`text-xs hover:underline ${
                          selectedRecipe?._id === r._id
                            ? "text-red-200"
                            : "text-red-600"
                        }`}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loadingRecipe ? (
              <p className="text-gray-500">Loading recipe...</p>
            ) : selectedRecipe ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    {selectedRecipe.recipeName}
                    {selectedRecipe.brand && (
                      <span className="text-gray-500 font-normal ml-2">
                        ({selectedRecipe.brand})
                      </span>
                    )}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={addItem}
                      className="bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded text-sm"
                    >
                      Add ingredient
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-black text-white px-4 py-1.5 rounded text-sm disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
                {selectedRecipe.kind === TAB_TRAINING && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SOP Link (Google Drive)
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="url"
                        value={trainingSopLink}
                        onChange={(e) => setTrainingSopLink(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        className="flex-1 min-w-[260px] border rounded-lg px-3 py-2 text-sm"
                      />
                      {trainingSopLink?.trim() && (
                        <a
                          href={trainingSopLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Open SOP
                        </a>
                      )}
                    </div>
                  </div>
                )}
                <UpdateRecipeItemsTable
                  items={items}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                  isSubRecipe={false}
                />
              </>
            ) : (
              <p className="text-gray-500">Select a recipe to edit.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- RECIPE ADMIN INVENTORY MODAL ---------- */
function RecipeInventoryModal({ onClose }) {
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [markingUsedId, setMarkingUsedId] = useState(null);
  const [reconcilingId, setReconcilingId] = useState(null);
  const [reconcileQty, setReconcileQty] = useState("");
  const [reconcileNote, setReconcileNote] = useState("");
  const [submittingReconcile, setSubmittingReconcile] = useState(false);
  const [transfer, setTransfer] = useState({
    fromBrandName: "",
    toBrandName: "",
    itemName: "",
    ingredientBrand: "",
    uom: "",
    qty: "",
  });

  useEffect(() => {
    const loadBrands = async () => {
      try {
        const res = await api.get("/api/admin/brand-names");
        const list = res.data?.data || [];
        setBrands(list);
        if (!selectedBrand && list.length) setSelectedBrand(list[0]);
      } catch {
        setBrands([]);
      }
    };
    loadBrands();
  }, []);

  const loadStock = async (brandName) => {
    if (!brandName) return;
    setLoading(true);
    try {
      const res = await api.get("/api/brand-stock", { params: { brandName } });
      setRows(res.data?.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock(selectedBrand);
  }, [selectedBrand]);

  useEffect(() => {
    setTransfer((p) => ({
      ...p,
      fromBrandName: selectedBrand,
      itemName: "",
      ingredientBrand: "",
      uom: "",
      qty: "",
    }));
  }, [selectedBrand]);

  const handleDeleteRow = async (rowId) => {
    if (!rowId) return;
    const ok = window.confirm("Delete this inventory row?");
    if (!ok) return;
    setDeletingId(rowId);
    try {
      await api.delete(`/api/brand-stock/${rowId}`);
      await loadStock(selectedBrand);
      setTransfer((p) => ({ ...p, itemName: "", ingredientBrand: "", uom: "", qty: "" }));
    } catch (err) {
      toast.error(err.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleMarkUsed = async (rowId) => {
    if (!rowId) return;
    const ok = window.confirm("Mark this ingredient as Used?");
    if (!ok) return;
    setMarkingUsedId(rowId);
    try {
      await api.patch(`/api/brand-stock/${rowId}/used`);
      await loadStock(selectedBrand);
      setTransfer((p) => ({ ...p, itemName: "", ingredientBrand: "", uom: "", qty: "" }));
      toast.success("Item marked as Used");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to mark used");
    } finally {
      setMarkingUsedId(null);
    }
  };

  const handleReconcile = async (rowId) => {
    const qty = Number(reconcileQty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Enter a valid quantity (0 or greater).");
      return;
    }
    setSubmittingReconcile(true);
    try {
      await api.patch(`/api/brand-stock/${rowId}/reconcile`, {
        qtyRemaining: qty,
        note: reconcileNote.trim() || "Manual reconciliation",
      });
      setReconcilingId(null);
      setReconcileQty("");
      setReconcileNote("");
      await loadStock(selectedBrand);
      toast.success("Stock reconciled");
    } catch (err) {
      toast.error(err.response?.data?.message || "Reconcile failed");
    } finally {
      setSubmittingReconcile(false);
    }
  };

  const downloadCsv = (allRows) => {
    const headers = [
      "Brand Name",
      "Item Name",
      "Ingredient Brand",
      "UOM",
      "Quantity Remaining",
      "Status",
    ];

    const escape = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const sorted = [...allRows].sort((a, b) => {
      const brandA = String(a.brandName || "");
      const brandB = String(b.brandName || "");
      if (brandA !== brandB) return brandA.localeCompare(brandB);
      const itemA = String(a.itemName || "");
      const itemB = String(b.itemName || "");
      if (itemA !== itemB) return itemA.localeCompare(itemB);
      const ingA = String(a.ingredientBrand || "");
      const ingB = String(b.ingredientBrand || "");
      return ingA.localeCompare(ingB);
    });

    const lines = [
      headers.join(","),
      ...sorted.map((r) =>
        [
          r.brandName || "",
          r.itemName || "",
          r.ingredientBrand || "",
          r.uom || "",
          Number(r.qtyRemaining || 0),
          r.status || "Pending",
        ]
          .map(escape)
          .join(",")
      ),
    ];

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brand-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const res = await api.get("/api/brand-stock/all");
      const allRows = res.data?.data || [];
      downloadCsv(allRows);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to download inventory");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Inventory</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={downloading}
              className="bg-black text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {downloading ? "Downloading..." : "Download"}
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-black text-2xl"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="p-6 border-b flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand
            </label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-left">Ing Brand</th>
                  <th className="p-2 text-left">UOM</th>
                  <th className="p-2 text-right">Remaining</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      No stock.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r._id} className="border-t">
                      <td className="p-2">{r.itemName}</td>
                      <td className="p-2">{r.ingredientBrand || "—"}</td>
                      <td className="p-2">{r.uom || "—"}</td>
                      <td className="p-2 text-right">
                        {Number(r.qtyRemaining || 0)}
                      </td>
                      <td className="p-2">
                        <span
                          className={`inline-block text-xs px-2 py-1 rounded ${
                            (r.status || "Pending") === "Used"
                              ? "bg-gray-100 text-gray-700"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {r.status || "Pending"}
                        </span>
                      </td>
                      <td className="p-2 space-y-1">
                        <div className="flex gap-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(r._id)}
                            disabled={deletingId === r._id}
                            className="text-red-600 text-xs hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>

                          {(r.status || "Pending") === "Pending" && (
                            <button
                              type="button"
                              onClick={() => handleMarkUsed(r._id)}
                              disabled={markingUsedId === r._id}
                              className="text-blue-700 text-xs hover:underline disabled:opacity-50"
                            >
                              {markingUsedId === r._id ? "Marking..." : "Mark Used"}
                            </button>
                          )}

                          {(r.status || "Pending") === "Pending" && (
                            <button
                              type="button"
                              onClick={() => {
                                setReconcilingId(reconcilingId === r._id ? null : r._id);
                                setReconcileQty(String(r.qtyRemaining ?? ""));
                                setReconcileNote("");
                              }}
                              className="text-orange-600 text-xs hover:underline"
                            >
                              Reconcile
                            </button>
                          )}
                        </div>

                        {reconcilingId === r._id && (
                          <div className="mt-1 flex gap-2 items-center flex-wrap">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={reconcileQty}
                              onChange={(e) => setReconcileQty(e.target.value)}
                              placeholder="New qty"
                              className="border rounded px-2 py-1 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-orange-400"
                            />
                            <input
                              type="text"
                              value={reconcileNote}
                              onChange={(e) => setReconcileNote(e.target.value)}
                              placeholder="Note (optional)"
                              className="border rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-orange-400"
                            />
                            <button
                              type="button"
                              onClick={() => handleReconcile(r._id)}
                              disabled={submittingReconcile}
                              className="bg-orange-600 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
                            >
                              {submittingReconcile ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setReconcilingId(null)}
                              className="text-gray-500 text-xs hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Transfer Stock</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={selectedBrand}
                disabled
                className="border rounded px-3 py-2 text-sm bg-gray-50 text-gray-700"
              />
              <select
                value={transfer.toBrandName}
                onChange={(e) =>
                  setTransfer((p) => ({ ...p, toBrandName: e.target.value }))
                }
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="">To brand</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select
                value={transfer.itemName ? `${transfer.itemName}|${transfer.ingredientBrand}|${transfer.uom}` : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const [itemName, ingredientBrand, uom] = val.split("|");
                  setTransfer((p) => ({
                    ...p,
                    itemName: itemName || "",
                    ingredientBrand: ingredientBrand || "",
                    uom: uom || "",
                  }));
                }}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="">Select pending ingredient</option>
                {rows
                  .filter((rr) => (rr.status || "Pending") === "Pending")
                  .map((r) => (
                    <option
                      key={r._id}
                      value={`${r.itemName || ""}|${r.ingredientBrand || ""}|${r.uom || ""}`}
                    >
                      {r.itemName} {r.ingredientBrand ? `(${r.ingredientBrand})` : ""} — {r.uom || "—"}
                    </option>
                  ))}
              </select>
              <input
                value={transfer.ingredientBrand}
                disabled
                className="border rounded px-3 py-2 text-sm bg-gray-50 text-gray-700"
                placeholder="Ing brand"
              />
              <input
                value={transfer.uom}
                disabled
                className="border rounded px-3 py-2 text-sm bg-gray-50 text-gray-700"
                placeholder="UOM"
              />
              <input
                type="number"
                value={transfer.qty}
                onChange={(e) =>
                  setTransfer((p) => ({ ...p, qty: e.target.value }))
                }
                className="border rounded px-3 py-2 text-sm"
                placeholder="Qty"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="bg-black text-white px-4 py-2 rounded-lg text-sm"
                onClick={async () => {
                  try {
                    await api.post("/api/brand-stock/transfer", {
                      ...transfer,
                      qty: Number(transfer.qty || 0),
                    });
                    toast.success("Stock transferred successfully");
                    setTransfer({
                      fromBrandName: selectedBrand,
                      toBrandName: "",
                      itemName: "",
                      ingredientBrand: "",
                      uom: "",
                      qty: "",
                    });
                    await loadStock(selectedBrand);
                  } catch (err) {
                    toast.error(err.response?.data?.message || "Transfer failed");
                  }
                }}
                disabled={
                  !transfer.toBrandName ||
                  !transfer.itemName ||
                  !transfer.uom ||
                  !transfer.ingredientBrand ||
                  !Number(transfer.qty || 0)
                }
              >
                Transfer
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- FCR (Food Cost Review) MODAL ---------- */
function CostRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold">₹{value}</span>
    </div>
  );
}

function FcrRecipeCostBreakdown({ data, loading }) {
  const [expandedNodes, setExpandedNodes] = useState({});

  const toggleNode = (path) => {
    setExpandedNodes((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t">
        <p className="text-sm text-gray-500">Loading breakdown...</p>
      </div>
    );
  }

  if (!data || !data.breakdown || data.breakdown.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t">
        <p className="text-sm text-gray-500">
          No breakdown available for this recipe.
        </p>
      </div>
    );
  }

  const tree = (() => {
    const root = { level: -1, type: "ROOT", children: [] };
    const stack = [root];

    for (const row of data.breakdown || []) {
      const rowLevel = Number(row.level || 0);
      while (stack.length > 0 && stack[stack.length - 1].level >= rowLevel) {
        stack.pop();
      }
      const parent = stack[stack.length - 1] || root;
      const node = {
        ...row,
        level: rowLevel,
        children: [],
      };
      parent.children.push(node);
      if (node.type === "SUBRECIPE") {
        stack.push(node);
      }
    }

    return root.children;
  })();

  const renderNode = (node, depth, path) => {
    const indent = depth * 18;
    const isSub = node.type === "SUBRECIPE";
    const isExpanded = expandedNodes[path] ?? false;

    return (
      <div key={path}>
        <div
          className="flex items-center justify-between gap-3 py-2"
          style={{ paddingLeft: indent }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isSub && (
              <button
                type="button"
                onClick={() => toggleNode(path)}
                className="text-xs font-bold text-gray-700"
                aria-expanded={isExpanded}
              >
                {isExpanded ? "−" : "+"}
              </button>
            )}
            <span className="font-medium truncate">{node.item}</span>
            <span className="text-xs text-gray-500">
              ({node.type})
            </span>
          </div>
          <div className="text-right whitespace-nowrap text-sm text-gray-800">
            <div className="text-xs text-gray-500">
              {node.qty} {node.uom}
            </div>
            <div className="font-semibold">₹{node.cost}</div>
          </div>
        </div>

        {isSub && isExpanded && (
          <div className="mt-1 border-l border-gray-200 pl-3">
            {(node.children || []).map((ch, idx) =>
              renderNode(ch, depth + 1, `${path}.${idx}`)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid md:grid-cols-3 gap-6 mt-4">
      <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow">
        <h2 className="text-xl font-semibold mb-4">Hierarchical Breakdown</h2>
        <div className="space-y-0">
          {tree.length === 0 ? (
            <p className="text-gray-500">No breakdown items found.</p>
          ) : (
            tree.map((n, idx) => renderNode(n, 0, `n.${idx}`))
          )}
        </div>
      </div>

      <div className="bg-[#111] text-white p-6 rounded-2xl flex flex-col gap-1">
        <CostRow label="Food Cost" value={Number(data.foodCost || 0).toFixed(2)} />
        <CostRow label="Packaging Cost" value={Number(data.packagingCost || 0).toFixed(2)} />
        <CostRow
          label="Production Variance (5%)"
          value={Number(data.productionVariance || 0).toFixed(2)}
        />
        <div className="border-t border-white/20 mt-3 pt-3 flex justify-between font-bold text-lg">
          <span>Total Cost</span>
          <span>₹{Number(data.total || 0).toFixed(2)}</span>
        </div>
        <div className="border-t border-white/10 mt-3 pt-3 space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-wide">FCR Analysis (target 32%)</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Suggested Price</span>
            <span className="font-bold text-green-400">
              ₹{(Number(data.total || 0) / 0.32).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">FCR at suggested</span>
            <span className="font-semibold text-green-400">32.0%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FcrModal({ onClose }) {
  const [mainRecipes, setMainRecipes] = useState([]);
  const [expandedRecipeId, setExpandedRecipeId] = useState(null);
  const [breakdownCache, setBreakdownCache] = useState({});
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [loadingRecipeId, setLoadingRecipeId] = useState(null);

  useEffect(() => {
    const loadRecipes = async () => {
      setLoadingRecipes(true);
      try {
        const res = await api.get("/api/admin/recipes");
        setMainRecipes(res.data || []);
      } catch {
        setMainRecipes([]);
      } finally {
        setExpandedRecipeId(null);
        setBreakdownCache({});
        setLoadingRecipes(false);
      }
    };

    loadRecipes();
  }, []);

  const toggleMainRecipe = async (recipe) => {
    if (!recipe?._id) return;
    const isOpen = expandedRecipeId === recipe._id;
    const nextId = isOpen ? null : recipe._id;
    setExpandedRecipeId(nextId);

    if (!nextId) return;
    if (breakdownCache[recipe._id]) return;

    setLoadingRecipeId(recipe._id);
    try {
      const breakdown = await fetchFoodCost(
        recipe.recipeName,
        5,
        recipe.brand
      );
      setBreakdownCache((prev) => ({ ...prev, [recipe._id]: breakdown }));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load breakdown");
    } finally {
      setLoadingRecipeId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">FCR</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loadingRecipes ? (
            <p className="text-gray-500">Loading recipes...</p>
          ) : mainRecipes.length === 0 ? (
            <p className="text-gray-500">No main recipes found.</p>
          ) : (
            <div className="space-y-3">
              {mainRecipes.map((recipe) => {
                const isExpanded = expandedRecipeId === recipe._id;
                const breakdown = breakdownCache[recipe._id];
                const loading = loadingRecipeId === recipe._id;

                return (
                  <div key={recipe._id} className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleMainRecipe(recipe)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                    >
                      <span className="font-semibold">
                        {recipe.recipeName}
                        {recipe.brand && (
                          <span className="text-gray-500 font-normal ml-2">
                            ({recipe.brand})
                          </span>
                        )}
                      </span>
                      <span className="text-gray-500">
                        {isExpanded ? "−" : "+"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="p-4 border-t">
                        <FcrRecipeCostBreakdown
                          data={breakdown}
                          loading={loading || !breakdown}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- CHECK STOCK MODAL ---------- */
function CheckStockModal({ onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/stock-updates/all");
      setRecords(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch stock data");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const filtered = records.filter(
    (r) =>
      !search ||
      r.brandName?.toLowerCase().includes(search.toLowerCase()) ||
      r.date?.includes(search)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Check Stock</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-black text-2xl">✕</button>
        </div>

        <div className="p-4 border-b flex gap-3 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by brand or date (YYYY-MM-DD)"
            className="border rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button
            type="button"
            onClick={fetchAll}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {loading && (
            <p className="text-center text-gray-500 py-8">Loading stock records...</p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-500 py-8">No stock records found.</p>
          )}

          {!loading && filtered.map((record) => (
            <div key={record._id} className="border rounded-xl mb-3 overflow-hidden">
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
                      <tr>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-left">UOM</th>
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
          ))}
        </div>

        <div className="flex justify-end p-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- STOCK UPDATE MODAL ---------- */
function StockUpdateModal({ onClose }) {
  const emptyItem = { itemName: "", uom: "", issueQty: "", usedQty: "", wastageQty: "", remainingQty: "" };

  const [brands, setBrands] = useState([]);
  const [brandId, setBrandId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/admin/brands")
      .then((res) => {
        const list = res.data?.data || [];
        setBrands(list);
        if (list.length) setBrandId(list[0]._id);
      })
      .catch(() => setBrands([]));
  }, []);

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems((prev) => [...prev, { ...emptyItem }]);

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!brandId) return setError("Brand is required.");
    if (!date) return setError("Date is required.");
    if (items.length === 0) return setError("Add at least one item.");

    const parsedItems = items.map((it) => ({
      itemName: it.itemName.trim(),
      uom: it.uom.trim(),
      issueQty: Number(it.issueQty),
      usedQty: Number(it.usedQty),
      wastageQty: Number(it.wastageQty),
      remainingQty: Number(it.remainingQty),
    }));

    const invalid = parsedItems.find(
      (it) => !it.itemName || !it.uom || [it.issueQty, it.usedQty, it.wastageQty, it.remainingQty].some((n) => isNaN(n) || n < 0)
    );
    if (invalid) return setError("All item fields are required and quantities must be ≥ 0.");

    setSubmitting(true);
    try {
      await api.post("/api/stock-updates", { brandId, date, items: parsedItems });
      toast.success("Stock updated successfully");
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit stock update.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Stock Update</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-black text-2xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-5">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                {brands.length === 0 && <option value="">Loading brands...</option>}
                {brands.map((b) => (
                  <option key={b._id} value={b._id}>{b.brandName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Items</span>
              <button
                type="button"
                onClick={addItem}
                className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 border"
              >
                + Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="border rounded-xl p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 items-end">
                  <div className="col-span-2 md:col-span-1 lg:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Item Name</label>
                    <input
                      type="text"
                      value={item.itemName}
                      onChange={(e) => updateItem(idx, "itemName", e.target.value)}
                      placeholder="e.g. Tomato"
                      className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">UOM</label>
                    <input
                      type="text"
                      value={item.uom}
                      onChange={(e) => updateItem(idx, "uom", e.target.value)}
                      placeholder="KG"
                      className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </div>
                  {["issueQty", "usedQty", "wastageQty", "remainingQty"].map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-500 mb-1 capitalize">
                        {field.replace("Qty", " Qty")}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item[field]}
                        onChange={(e) => updateItem(idx, field, e.target.value)}
                        placeholder="0"
                        className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                      />
                    </div>
                  ))}
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="text-red-500 hover:text-red-700 text-lg disabled:opacity-30"
                      title="Remove item"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- WAREHOUSE DISPATCH QUEUE SECTION (Ingredient Manager) ---------- */
function WarehouseDispatchSection() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispatchingId, setDispatchingId] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await api.get("/api/production-orders/ready-for-dispatch");
        setOrders(res.data?.data || []);
      } catch (err) {
        console.error("Failed to load dispatch queue", err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const handleDispatch = async (orderId) => {
    try {
      setDispatchingId(orderId);
      await api.patch(`/api/production-orders/${orderId}/dispatch`);
      setOrders((prev) => prev.filter((o) => o._id !== orderId));
      toast.success("Cargo dispatched — production order is now IN_PREPARATION.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Dispatch failed. Please try again.");
    } finally {
      setDispatchingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Warehouse Dispatch Queue</h2>
        <p className="text-gray-500 text-sm">Loading dispatch queue...</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold">Warehouse Dispatch Queue</h2>
        {orders.length > 0 && (
          <span className="text-sm font-semibold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
            {orders.length} pending
          </span>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
          <p className="font-medium text-gray-600">No orders awaiting dispatch</p>
          <p className="text-sm text-gray-400 mt-1">
            Production orders approved for dispatch will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order._id}
              className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold">{order.brandName}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Order #{order._id.toString().slice(-6).toUpperCase()} &middot; Created{" "}
                    {new Date(order.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-sm font-semibold text-green-700 mt-1">
                    Payment Confirmed &mdash; ₹
                    {Number(order.financials?.totalIngredientCost || 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDispatch(order._id)}
                  disabled={dispatchingId === order._id}
                  className="bg-black text-white px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-800 transition disabled:opacity-50 whitespace-nowrap"
                >
                  {dispatchingId === order._id
                    ? "Dispatching..."
                    : "Confirm & Dispatch Cargo Crate"}
                </button>
              </div>

              {/* Ingredient cargo table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-700">
                        Item Name
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-700">
                        Required Qty
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-700">
                        UOM
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.warehouseIngredientsToDispatch || []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-4 text-center text-gray-400 text-xs"
                        >
                          No warehouse ingredients listed for this order.
                        </td>
                      </tr>
                    ) : (
                      (order.warehouseIngredientsToDispatch || []).map((item, idx) => (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                        >
                          <td className="px-4 py-2.5 font-medium">{item.itemName}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {Number(item.requiredQty || 0).toFixed(3)}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 uppercase text-xs">
                            {item.uom || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;


