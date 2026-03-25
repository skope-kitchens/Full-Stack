// src/utils/api.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5002",
});

// Safe storage getter
function safeGetToken() {
  try {
    const s = sessionStorage.getItem("skope_auth_token")
    if (s) return s
  } catch {}

  try {
    const l = localStorage.getItem("skope_auth_token") || localStorage.getItem("token")
    if (l) return l
  } catch {}

  return null
}


// Attach token automatically to every request
api.interceptors.request.use((config) => {
  const token = safeGetToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
/* ---------- INVENTORY (Ingredients source) ---------- */
export const fetchInventoryItems = (branchCode) =>
  api.get("/api/inventory/items", {
    params: { branchCode },
  });

export const fetchClientInventory = (clientId) =>
  api.get(`/api/inventory/${clientId}`);

/* ---------- INGREDIENTS (optional if stored separately) ---------- */
export const fetchIngredients = () =>
  api.get("/api/inventory/items");

/* ---------- SUB RECIPES ---------- */
export const fetchSubRecipes = () =>
  api.get("/subrecipes");

export const createSubRecipe = (payload) =>
  api.post("/subrecipes", payload);

/* ---------- MAIN RECIPE ---------- */
export const createMainRecipe = (payload) =>
  api.post("/mainrecipes", payload);

export default api;
