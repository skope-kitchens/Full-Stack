// src/utils/api.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://full-stack-8ug9.onrender.com",
});

/**
 * Token resolution order:
 *   1. sessionStorage["skope_auth_token"] — primary, written by authUtils.setAuth()
 *   2. localStorage["token"] — fallback for sessions started before the auth migration
 *
 * Note: localStorage["skope_auth_token"] is no longer written by the app.
 * The fallback to localStorage["token"] handles old sessions during the transition
 * period. It can be removed once all active sessions have been refreshed post-deploy.
 */
function safeGetToken() {
  try {
    const fromSession = sessionStorage.getItem("skope_auth_token");
    if (fromSession) return fromSession;
  } catch {}

  try {
    const fromLocal = localStorage.getItem("token");
    if (fromLocal) return fromLocal;
  } catch {}

  return null;
}

// Attach token automatically to every request
api.interceptors.request.use((config) => {
  const token = safeGetToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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
