import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api.js";
import RecipeItem from "../components/RecipeItem.jsx";

const EMPTY_NODE = () => ({
  type: "INGREDIENT", // INGREDIENT | SUBRECIPE
  category: "Food",
  refId: null,
  yield: "",           
  itemBrand: "",      
  specification: "", 
  quantity: "",
  uom: "PC",
  netPrice: "",
});



export default function AddRecipe() {
  const [recipeType, setRecipeType] = useState("MAIN"); 
  const [branchCode, setBranchCode] = useState("");
  const [brand, setBrand] = useState("");
  const [brandOptions, setBrandOptions] = useState([]);
  const [recipeName, setRecipeName] = useState("");
  const [trainingNameOptions, setTrainingNameOptions] = useState([]);
  const [sopLink, setSopLink] = useState("");
  const [items, setItems] = useState([EMPTY_NODE()]);
  const [subRecipes, setSubRecipes] = useState([]);
  const navigate = useNavigate();

  // Frontend guard: only RECIPE_MANAGER admins should access this page
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
        // Load all subrecipes from collection (no brand filtering)
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

  // Strict sequential selection: MAIN recipeName dropdown only from Training TR3
  useEffect(() => {
    const loadTrainingNames = async () => {
      try {
        const res = await api.get("/api/training-recipes");
        const list = res.data?.data || [];
        const names = list
          .filter((r) => r.trainingCode === "TR3")
          .map((r) => r.recipeName)
          .filter(Boolean);
        const opts = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
        setTrainingNameOptions(opts);
      } catch (e) {
        console.error("Failed to load training recipes", e);
        setTrainingNameOptions([]);
      }
    };
    loadTrainingNames();
  }, []);

  // Sequential versioning prefill: MAIN prefill from Training TR3 (same recipeName)
  useEffect(() => {
    const prefill = async () => {
      const name = String(recipeName || "").trim();
      if (!name) return;
      if (recipeType !== "MAIN") return;
      try {
        const res = await api.get("/api/training-recipes");
        const list = res.data?.data || [];
        const prev = list.find((r) => r.recipeName === name && r.trainingCode === "TR3");
        if (prev?.items?.length) {
          setItems(prev.items.map((i) => ({ ...i })));
        }
        if (typeof prev?.sopLink === "string") {
          setSopLink(prev.sopLink);
        }
      } catch {
        // ignore
      }
    };
    prefill();
  }, [recipeName, recipeType]);




  const saveRecipe = async () => {
  const payload = {
    brand,
    recipeName,
    sopLink: recipeType === "MAIN" ? sopLink : "",
    items,
  };

  if (recipeType === "MAIN") {
    await api.post("/api/mainrecipes", payload);
  } else {
    await api.post("/api/subrecipes", payload);
  }

  alert("Recipe saved");
};


  return (
    <div className="min-h-screen min-w-screen px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* HEADER CARD */}
        <div className="rounded-2xl bg-[url('/assets/Main-bg.png')] bg-no-repeat bg-cover p-6 shadow">
          <h1 className="text-2xl font-semibold mb-6">Add Recipe</h1>

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
                <label className="block text-sm text-gray-600 mb-1">Branch Code</label>
                <input
                    value={branchCode}
                    onChange={e => setBranchCode(e.target.value.toUpperCase())}
                    placeholder="e.g. AMSJ"
                    className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>

            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Recipe Name
              </label>
              <select
                value={recipeName}
                onChange={e => setRecipeName(e.target.value)}
                className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                {trainingNameOptions.length === 0 ? (
                  <option value="">Create Training recipes first</option>
                ) : (
                  trainingNameOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Recipe Type
              </label>

              <select
                value={recipeType}
                onChange={(e) => {
                  setRecipeType(e.target.value);
                  setItems([EMPTY_NODE()]); // reset items when switching
                }}
                className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                <option value="MAIN">Main Recipe</option>
                <option value="SUB">Sub Recipe</option>
              </select>
            </div>

          </div>

          {recipeType === "MAIN" && (
            <div className="mt-4">
              <label className="block text-sm text-gray-600 mb-1">
                SOP Link (Google Drive)
              </label>
              <input
                type="url"
                value={sopLink}
                onChange={(e) => setSopLink(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
          )}
        </div>

        {/* INGREDIENTS CARD */}
        <div className="bg-[url('/assets/Main-bg.png')] bg-no-repeat bg-cover rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Ingredients</h2>

          {/* TABLE HEADER */}
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


          {/* ITEMS */}
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

        {/* SAVE BUTTON */}
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
