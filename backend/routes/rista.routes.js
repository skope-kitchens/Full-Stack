import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import { listRistaStores } from "../controllers/rista.controller.js";
import { ristaClient } from "../ristaClient.js";
import { resolveStoreCodeFromStock } from "../utils/branchStoreMapper.js";

const router = express.Router();

// GET /api/rista/stores
router.get(
  "/stores",
  authMiddleware,
  requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"),
  listRistaStores
);

// GET /api/rista/connection-test
// Verifies Rista API keys work and branch-store mapping resolves correctly.
// Run this immediately after adding RISTA_API_KEY and RISTA_SECRET_KEY to environment.
router.get(
  "/connection-test",
  authMiddleware,
  requireRole("WALLET_MANAGER", "INGREDIENT_MANAGER"),
  async (req, res) => {
    try {
      const keysConfigured = !!(process.env.RISTA_API_KEY && process.env.RISTA_SECRET_KEY);
      if (!keysConfigured) {
        return res.status(503).json({
          ok: false,
          message: "RISTA_API_KEY or RISTA_SECRET_KEY not set in environment",
        });
      }

      const stores = await ristaClient.getStores();

      // Validate branch-store resolution for the two active branches.
      const branchTests = [
        { brandName: "Al Mashawi Shawarma", branchLabel: "jp nagar" },
        { brandName: "Al Mashawi Shawarma", branchLabel: "marathahalli" },
        { brandName: "Kochi Kurry Klub", branchLabel: "jp nagar" },
      ];

      const resolutions = branchTests.map(({ brandName, branchLabel }) => ({
        brandName,
        branchLabel,
        storeCode: resolveStoreCodeFromStock(stores, brandName, branchLabel) || "NOT_RESOLVED",
      }));

      return res.json({
        ok: true,
        storeCount: stores?.length || 0,
        branchResolutions: resolutions,
        // Full store list for manual inspection — log this to configure branchStoreMapper.js if needed.
        stores: (stores || []).map(s => ({
          storeCode: s.storeCode || s.id,
          branchName: s.branchName || s.name,
          accountNames: s.accountNames || [],
        })),
      });
    } catch (err) {
      console.error("[Rista] connection-test failed:", err?.message || err);
      return res.status(500).json({
        ok: false,
        message: err?.message || "Connection test failed",
      });
    }
  }
);

export default router;

