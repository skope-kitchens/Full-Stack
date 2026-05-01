import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const BASE_URL = "https://api.ristaapps.com/v1";

function createRistaToken() {
  return jwt.sign(
    {
      iss: process.env.RISTA_API_KEY,
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(), // 🔐 important
    },
    process.env.RISTA_SECRET_KEY
  );
}

const ristaApi = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

ristaApi.interceptors.request.use((config) => {
  const token = createRistaToken();

  config.headers = {
    ...config.headers,
    "x-api-key": process.env.RISTA_API_KEY,
    "x-api-token": token,
    "content-type": "application/json",
  };

  return config;
});

// -----------------------------
// Helpers
// -----------------------------
function handleNotFound(err, fallback) {
  if (err?.response?.data?.code === "ResourceNotFound") {
    return fallback;
  }
  throw err;
}

// -----------------------------
// Client
// -----------------------------
export const ristaClient = {
  // ✅ Revenue + No of sales
  async getAnalyticsSummary({ branch, period }) {
    try {
      const res = await ristaApi.get("/analytics/sales/summary", {
        params: { branch, period },
      });
      return res.data || {};
    } catch (err) {
      return handleNotFound(err, {});
    }
  },

  // ✅ Sales page (for KPT)
  // 🔁 Fetch ALL sales for given branch + day using /sales/page
// 🔁 Fetch ALL sales for given branch + day using /sales/page
async getSalesPage({ branch, day, status = "Closed" }) {
  let all = [];
  let lastKey = null;

  try {
    while (true) {
      const res = await ristaApi.get("/sales/page", {
        params: lastKey
          ? { branch, day, status, lastKey }
          : { branch, day, status }
      });

      const body = res.data || {};
      const page = body.data || [];

      // append page
      all = all.concat(page);

      // 🔍 DEBUG LOG (safe, small)
      page.slice(0, 3).forEach((sale) => {
        
      });

      if (!body.lastKey) break;
      lastKey = body.lastKey;
    }

    console.log("FINAL TOTAL SALES:", all.length);

    return all;
  } catch (err) {
    console.error("Error in getSalesPage()", err?.response?.data || err);
    return handleNotFound(err, []);
  }
},



  // ✅ Inventory
async getInventory(branchCode) {
  let all = [];
  let lastKey = null;

  try {
    while (true) {
      const res = await ristaApi.get("/inventory/store/items", {
        params: lastKey
          ? { branchCode, lastKey }
          : { branchCode }
      });

      const body = res.data || {};

      const pageItems = body.data || [];
      all = all.concat(pageItems);

      if (!body.lastKey) break;
      lastKey = body.lastKey;
    }

    return all;
  } catch (err) {
    console.error("Rista getInventory() error:", {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });
    return handleNotFound(err, []);
  }
},



  // ✅ Branch list
  async getOutlets() {
    const res = await ristaApi.get("/branch/list");
    return res.data || [];
  },
  // ✅ Store list (contains storeCode, storeName etc.)
// ✅ Store list (contains storeCode)
  async getStores() {
    const res = await ristaApi.get("/inventory/store/list");
    return res.data || [];
  }


};
