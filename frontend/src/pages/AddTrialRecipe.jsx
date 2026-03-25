import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api.js";
import RecipeItem from "../components/RecipeItem.jsx";

const EMPTY_NODE = () => ({
  type: "INGREDIENT",
  category: "Food",
  refId: null,
  yield: "",
  itemBrand: "",
  specification: "",
  quantity: "",
  uom: "PC",
  netPrice: "",
});

export default function AddTrialRecipe() {
  const [recipeType, setRecipeType] = useState("MAIN");
  const [trialCode, setTrialCode] = useState("T1");
  const [brand, setBrand] = useState("");
  const [brandOptions, setBrandOptions] = useState([]);
  const [recipeName, setRecipeName] = useState("");
  const [trialNameOptions, setTrialNameOptions] = useState([]);
  const [items, setItems] = useState([EMPTY_NODE()]);
  const [subRecipes, setSubRecipes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const userType = localStorage.getItem("userType");
    const adminRole = localStorage.getItem("adminRole");
    if (userType === "admin" && adminRole !== "RECIPE_MANAGER") {
      navigate("/admin-dashboard");
    }
  }, [navigate]);

  useEffect(() => {
    const loadSubRecipes = async () => {
      try {
        const res = await api.get("/api/subrecipes");
        setSubRecipes(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        console.error("Failed to load subrecipes", e);
        setSubRecipes([]);
      }
    };
    loadSubRecipes();
  }, []);

  useEffect(() => {
    const loadBrands = async () => {
      try {
        const res = await api.get("/api/admin/brand-names");
        const list = res.data?.data || [];
        setBrandOptions(list);
        if (!brand && list.length) setBrand(list[0]);
      } catch (e) {
        console.error("Failed to load brand names", e);
        setBrandOptions([]);
      }
    };
    loadBrands();
  }, []);

  // Strict sequential selection:
  // T1 => new recipe name (manual)
  // T2 => recipeName dropdown from T1
  // T3 => recipeName dropdown from T2
  useEffect(() => {
    const prefill = async () => {
      try {
        const res = await api.get("/api/trial-recipes");
        const list = res.data?.data || [];
        if (trialCode === "T1") {
          setTrialNameOptions([]);
          return;
        }
        const want = trialCode === "T2" ? "T1" : "T2";
        const names = list
          .filter((r) => r.trialCode === want)
          .map((r) => r.recipeName)
          .filter(Boolean);
        setTrialNameOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));

        const name = String(recipeName || "").trim();
        if (!name) return;
        const prev = list.find((r) => r.recipeName === name && r.trialCode === want);
        if (prev?.items?.length) setItems(prev.items.map((i) => ({ ...i })));
      } catch (e) {
        // ignore
      }
    };
    prefill();
  }, [trialCode, recipeName]);

  const saveRecipe = async () => {
    const payload = {
      brand,
      trialCode,
      recipeName,
      items,
      recipeType,
    };

    await api.post("/api/trial-recipes", payload);
    alert("Trial recipe saved");
  };

  return (
    <div className="min-h-screen min-w-screen px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="rounded-2xl bg-[url('/assets/Main-bg.png')] bg-no-repeat bg-cover p-6 shadow">
          <h1 className="text-2xl font-semibold mb-6">Add Trial Recipe</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Brand</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                {brandOptions.length === 0 ? (
                  <option value="">No brands</option>
                ) : (
                  brandOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))
                )}
              </select>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Trials</label>
                <select
                  value={trialCode}
                  onChange={(e) => setTrialCode(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  <option value="T1">T1</option>
                  <option value="T2">T2</option>
                  <option value="T3">T3</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Recipe Name
              </label>
              {trialCode === "T1" ? (
                <input
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              ) : (
                <select
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  <option value="">Select recipe</option>
                  {trialNameOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Recipe Type
              </label>
              <select
                value={recipeType}
                onChange={(e) => {
                  setRecipeType(e.target.value);
                  setItems([EMPTY_NODE()]);
                }}
                className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                <option value="MAIN">Main Recipe</option>
                <option value="SUB">Sub Recipe</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[url('/assets/Main-bg.png')] bg-no-repeat bg-cover rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Ingredients</h2>

          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600 border-b pb-2">
            <div>Type</div>
            <div>Yield</div>
            <div>Cat</div>
            <div className="col-span-2">Item</div>
            <div className="col-span-2">Spec</div>
            <div>Brand</div>
            <div>Qty</div>
            <div>UOM</div>
            <div>Price</div>
            <div className="text-right">Total</div>
          </div>

          <div className="space-y-3 mt-3">
            {items.map((item, i) => (
              <RecipeItem
                key={i}
                node={item}
                subRecipes={subRecipes}
                onChange={(updated) => {
                  const arr = [...items];
                  arr[i] = updated;
                  setItems(arr);
                }}
              />
            ))}
          </div>

          <button
            onClick={() => setItems([...items, EMPTY_NODE()])}
            className="mt-4 text-blue-600 text-sm hover:underline"
          >
            + Add Item
          </button>
        </div>

        <div className="flex justify-end">
          <button
            onClick={saveRecipe}
            className="bg-black text-white px-8 py-3 rounded-lg hover:bg-gray-800 transition"
          >
            Save Recipe
          </button>
        </div>
      </div>
    </div>
  );
}

