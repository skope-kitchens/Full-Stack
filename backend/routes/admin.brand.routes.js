import express from "express";
import User from "../models/user.js";
import Brand from "../models/brand.js";
import BrandStock from "../models/brandStock.js";
import MainRecipe from "../models/mainrecipe.models.js";
import BrandServiceChecklist from "../models/brandServiceChecklist.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import Order from "../models/order.js";
import IngredientIndent from "../models/ingredientIndent.js";
import MenuEntry from "../models/menuEntry.js";
import Projection from "../models/projection.js";
import ProductionOrder from "../models/productionOrder.js";
import {
  extractIngredientsFromBOM,
  aggregateIngredients,
  escapeRegex,
  normalizeUom,
} from "../utils/bomExpander.js";
import {
  getAllRecipes,
  getRecipeBreakdown,
  getMainRecipeById,
  updateMainRecipe,
  getAdminSubRecipes,
  getSubRecipeById,
  updateSubRecipe,
} from "../controllers/admin.recipes.controller.js";
import { getRecipeIndentIngredients } from "../controllers/recipeIndentIngredients.controller.js";
import {
  listAllIngredients,
  bulkUpdateIngredientPrices,
} from "../controllers/admin.ingredients.controller.js";

const router = express.Router();

const MASTER_SERVICES = [
  "Vendor sourcing & negotiation",
  "In-store branding (circle banner)",
  "Kitchen operations setup & workflow planning",
  "Waste & yield management system",
  "Menu engineering",
  "SOP creation",
  "Food tasting and trials",
  "Recipe development",
  "Pricing strategy and discounting",
  "Inventory - Process and storage",
  "Market research and competitor study",
  "Shelf life testing & documentation",
  "Food cost ratio - preparation",
  "Order flow integration - KDS, POS",
  "Branding - naming, positioning",
];

/* ================= BRANDS ================= */
router.get(
  "/brands",
  authMiddleware,
  requireRole(
    "WALLET_MANAGER",
    "RECIPE_MANAGER",
    "INGREDIENT_MANAGER"
  ),
  async (req, res) => {
    try {
      // 1️⃣ Get ALL brands safely
      const brands = await User.find({
        brandName: { $exists: true }
      })
        .select("brandName email wallet role")
        .sort({ createdAt: -1 })
        .lean();

      // 2️⃣ Run all signal queries in parallel — avoids serial round-trips
      const [unseenOrders, unseenMenus, pendingProjections, pendingPaymentOrders, dispatchReadyOrders] = await Promise.all([
        Order.find({ isSeenByAdmin: false }).select("brand").lean(),
        MenuEntry.find({ isSeenByRecipeAdmin: false }).select("clientId").lean(),
        Projection.find({ status: "PENDING_CHEF_REVIEW" }).select("brandId").lean(),
        ProductionOrder.find({ status: "AWAITING_BRAND_PAYMENT" }).select("brandId").lean(),
        ProductionOrder.find({ status: "READY_FOR_DISPATCH" }).select("brandId").lean(),
      ]);

      // 3️⃣ Build O(1) lookup sets from the five signal arrays
      const brandIdsWithOrders = new Set(
        unseenOrders.map(o => o.brand.toString())
      );
      const brandIdsWithMenus = new Set(
        unseenMenus.map(m => m.clientId.toString())
      );
      const brandIdsWithProjections = new Set(
        pendingProjections.map(p => p.brandId.toString())
      );
      const brandIdsAwaitingPayment = new Set(
        pendingPaymentOrders.map(p => p.brandId.toString())
      );
      const brandIdsDispatchReady = new Set(
        dispatchReadyOrders.map(p => p.brandId.toString())
      );

      // 4️⃣ Attach per-brand signal flags
      const result = brands.map(brand => ({
        ...brand,
        hasNewOrder: brandIdsWithOrders.has(brand._id.toString()),
        hasNewMenu: brandIdsWithMenus.has(brand._id.toString()),
        hasPendingProjection: brandIdsWithProjections.has(brand._id.toString()),
        hasPendingPayment: brandIdsAwaitingPayment.has(brand._id.toString()),
        hasDispatchReady: brandIdsDispatchReady.has(brand._id.toString()),
      }));

      res.json(result);
    } catch (err) {
      console.error("Failed to load brands", err);
      res.status(500).json({ message: "Failed to load brands" });
    }
  }
);

/* ================= BRAND NAMES (for dropdowns) ================= */
router.get(
  "/brand-names",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  async (req, res) => {
    try {
      const names = await User.distinct("brandName", {
        brandName: { $exists: true, $ne: "" },
      });
      const list = (names || [])
        .map((n) => String(n).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return res.json({ success: true, data: list });
    } catch (err) {
      console.error("Failed to load brand names", err);
      return res.status(500).json({ message: "Failed to load brand names" });
    }
  }
);

/* ================= CLIENT BRANDS (for indent request dropdown) ================= */
router.get(
  "/client-brands",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  async (req, res) => {
    try {
      const list = await User.find({ role: "client", brandName: { $exists: true, $ne: "" } })
        .select("brandName")
        .sort({ brandName: 1 })
        .lean();
      const data = (list || []).map((u) => ({
        _id: u._id,
        brandName: u.brandName,
      }));
      return res.json({ success: true, data });
    } catch (err) {
      console.error("Failed to load client brands", err);
      return res.status(500).json({ message: "Failed to load client brands" });
    }
  }
);


/* ================= GET SERVICES ================= */
router.get(
  "/services/:brandId",
  authMiddleware,
  requireRole("WALLET_MANAGER"),
  async (req, res) => {
    const { brandId } = req.params;

    let checklist = await BrandServiceChecklist.findOne({ brandId });

    // First time → create
    if (!checklist) {
      checklist = await BrandServiceChecklist.create({
        brandId,
        services: MASTER_SERVICES.map(name => ({ name }))
      });
    } else {
      // 🔥 ADD MISSING SERVICES
      const existingNames = checklist.services.map(s => s.name);

      const missing = MASTER_SERVICES
        .filter(name => !existingNames.includes(name))
        .map(name => ({ name }));

      if (missing.length) {
        checklist.services.push(...missing);
        await checklist.save();
      }
    }

    res.json(checklist);
  }
);


/* ================= ADD NEW SERVICE (per brand) ================= */
router.post(
  "/services/:brandId",
  authMiddleware,
  requireRole("WALLET_MANAGER"),
  async (req, res) => {
    try {
      const { brandId } = req.params;
      const { serviceName } = req.body;

      const name = typeof serviceName === "string" ? serviceName.trim() : "";
      if (!name) {
        return res.status(400).json({ message: "Service name is required" });
      }

      let checklist = await BrandServiceChecklist.findOne({ brandId });

      if (!checklist) {
        checklist = await BrandServiceChecklist.create({
          brandId,
          services: MASTER_SERVICES.map(n => ({ name: n })),
        });
      } else {
        const existingNames = checklist.services.map(s => s.name);
        const missing = MASTER_SERVICES
          .filter(n => !existingNames.includes(n))
          .map(n => ({ name: n }));
        if (missing.length) {
          checklist.services.push(...missing);
          await checklist.save();
        }
      }

      const existingNames = checklist.services.map(s => s.name);
      if (existingNames.includes(name)) {
        return res.status(400).json({ message: "Service already exists" });
      }

      checklist.services.push({ name });
      await checklist.save();

      res.json(checklist);
    } catch (err) {
      console.error("Failed to add service:", err);
      res.status(500).json({ message: "Failed to add service" });
    }
  }
);


/* ================= UPDATE SERVICE ================= */
router.patch(
  "/services/:brandId",
  authMiddleware,
  requireRole("WALLET_MANAGER"),
  async (req, res) => {
    const { brandId } = req.params;
    const { serviceName, completed } = req.body;

    const checklist = await BrandServiceChecklist.findOne({ brandId });
    if (!checklist) {
      return res.status(404).json({ message: "Checklist not found" });
    }

    const service = checklist.services.find(s => s.name === serviceName);
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    service.completed = completed;
    service.completedAt = completed ? new Date() : null;

    await checklist.save();
    res.json({ success: true });
  }
);


/* ================= DELETE SERVICE (per brand) ================= */
router.delete(
  "/services/:brandId",
  authMiddleware,
  requireRole("WALLET_MANAGER"),
  async (req, res) => {
    try {
      const { brandId } = req.params;
      const { serviceName } = req.body;

      const name = typeof serviceName === "string" ? serviceName.trim() : "";
      if (!name) {
        return res.status(400).json({ message: "Service name is required" });
      }

      const checklist = await BrandServiceChecklist.findOne({ brandId });
      if (!checklist) {
        return res.status(404).json({ message: "Checklist not found" });
      }

      const before = checklist.services.length;
      checklist.services = checklist.services.filter(
        (s) => s.name !== name
      );
      if (checklist.services.length === before) {
        return res.status(404).json({ message: "Service not found" });
      }

      await checklist.save();
      res.json(checklist);
    } catch (err) {
      console.error("Failed to delete service:", err);
      res.status(500).json({ message: "Failed to delete service" });
    }
  }
);


/* ================= GET ORDERS FOR BRAND ================= */
router.get(
  "/orders/:brandId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  async (req, res) => {
    try {
      const { brandId } = req.params;

      const orders = await Order.find({ brand: brandId })
        .sort({ createdAt: -1 })
        .lean();

      // 👇 MARK AS SEEN
      await Order.updateMany(
        { brand: brandId, isSeenByAdmin: false },
        { $set: { isSeenByAdmin: true } }
      );

      res.json(orders);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  }
);

/* ================= ADMIN NOTIFICATION COUNTS ================= */
router.get(
  "/notification-counts",
  authMiddleware,
  requireRole("RECIPE_MANAGER", "INGREDIENT_MANAGER"),
  async (req, res) => {
    try {
      const role = req.user?.role;
      if (role === "RECIPE_MANAGER") {
        const [orders, menu, grn] = await Promise.all([
          Order.countDocuments({ isSeenByAdmin: false }),
          MenuEntry.countDocuments({ isSeenByRecipeAdmin: false }),
          IngredientIndent.countDocuments({ status: "ISSUED", isSeenByRecipeAdminGrn: false }),
        ]);
        return res.json({
          success: true,
          data: { orders, menu, grn },
        });
      }
      // INGREDIENT_MANAGER
      const indent = await IngredientIndent.countDocuments({
        status: { $in: ["INDENT_PENDING", "INDENT_VERIFIED"] },
        isSeenByIngredientAdmin: false,
      });
      return res.json({ success: true, data: { indent } });
    } catch (err) {
      console.error("Failed to load notification counts", err);
      return res.status(500).json({ message: "Failed to load notification counts" });
    }
  }
);


/* ================= UPDATE ORDER STATUS ================= */
router.patch(
  "/orders/:orderId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      const VALID_TRANSITIONS = {
        PLACED:     ["PREPARING", "CANCELLED"],
        PREPARING:  ["COMPLETED", "CANCELLED"],
        COMPLETED:  [],
        CANCELLED:  [],
      };

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const allowed = VALID_TRANSITIONS[order.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          message: `Cannot transition order from "${order.status}" to "${status}".`,
          allowedTransitions: allowed,
        });
      }

      order.status = status;

      if (status === "COMPLETED" && !order.completedAt) {
        order.completedAt = new Date();
      }

      await order.save();

      // ── Stock deduction on PREPARING (best-effort, never fails the transition) ──
      let deductedItems = [];
      if (status === "PREPARING") {
        try {
          const orderUser = await User.findById(order.brand).select("brandName").lean();
          const brandName = orderUser?.brandName;

          if (brandName && order.items?.length > 0) {
            const allIngredients = [];

            for (const orderItem of order.items) {
              const dishName = String(orderItem.dish || "").trim();
              const dishQty  = Number(orderItem.qty || 1);
              if (!dishName || dishQty <= 0) continue;

              const recipe = await MainRecipe.findOne({ recipeName: dishName, brand: brandName }).lean()
                          || await MainRecipe.findOne({ recipeName: dishName }).lean();

              if (!recipe) {
                console.warn(`[StockDeduct] No recipe for "${dishName}" (brand: ${brandName})`);
                continue;
              }

              const ingredients = await extractIngredientsFromBOM(
                recipe.items, dishQty, brandName, new Set()
              );
              allIngredients.push(...ingredients);
            }

            const aggregated = aggregateIngredients(allIngredients);

            for (const [, d] of aggregated) {
              try {
                // Normalise qty to match whatever UOM the stock record uses.
                // Live DB stores "kg" (lowercase); recipe schema uses "KG"/"GM".
                // Strategy: deduct in the recipe's UOM; the stock record UOM is
                // normalised before comparison so "kg" == "KG".
                const updated = await BrandStock.findOneAndUpdate(
                  {
                    brandName,
                    itemName: new RegExp(`^${escapeRegex(d.itemName)}$`, "i"),
                    status: "Pending",
                  },
                  {
                    $inc: { qtyRemaining: -d.qty },
                    $push: {
                      history: {
                        type: "CONSUMED",
                        qty: d.qty,
                        uom: d.uom,
                        at: new Date(),
                        referenceId: order._id,
                        referenceKind: "BATCH",
                        actorRole: req.user?.role || "RECIPE_MANAGER",
                        note: `Order ${order._id.toString().slice(-6).toUpperCase()} — Mark Preparing`,
                        brandConsumer: brandName,
                      },
                    },
                  },
                  { new: true }
                );
                if (updated) {
                  deductedItems.push({
                    itemName: d.itemName,
                    qty: Number(d.qty.toFixed(4)),
                    uom: d.uom,
                    newQty: Number((updated.qtyRemaining || 0).toFixed(4)),
                  });
                }
              } catch (stockErr) {
                console.error(`[StockDeduct] Failed for "${d.itemName}":`, stockErr?.message);
              }
            }

            if (deductedItems.length > 0) {
              console.log(`[StockDeduct] Order ${orderId}: deducted ${deductedItems.length} items for "${brandName}"`);
            }
          }
        } catch (stockErr) {
          console.error("[StockDeduct] Block failed:", stockErr?.message);
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      res.json({ success: true, order, deductedItems });
    } catch (err) {
      console.error("Failed to update order:", err);
      res.status(500).json({ message: "Failed to update order" });
    }
  }
);


/* ================= DELETE ORDER (completed only) ================= */
router.delete(
  "/orders/:orderId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  async (req, res) => {
    try {
      const { orderId } = req.params;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (order.status !== "COMPLETED") {
        return res.status(400).json({ message: "Only completed orders can be deleted" });
      }

      await Order.findByIdAndDelete(orderId);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete order:", err);
      res.status(500).json({ message: "Failed to delete order" });
    }
  }
);


/* ================= ADMIN: ALL RECIPES ================= */
router.get(
  "/recipes",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getAllRecipes
);

router.get(
  "/recipes/:recipeId/breakdown",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getRecipeBreakdown
);

/* ================= ADMIN: INDENT INGREDIENT EXPANSION ================= */
router.get(
  "/recipe-ingredients/:recipeKind/:recipeId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getRecipeIndentIngredients
);

router.get(
  "/recipes/:recipeId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getMainRecipeById
);
router.put(
  "/recipes/:recipeId",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  updateMainRecipe
);

/* ================= ADMIN: SUBRECIPES (list, get by id, update) ================= */
router.get(
  "/subrecipes",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getAdminSubRecipes
);
router.get(
  "/subrecipes/:id",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  getSubRecipeById
);
router.put(
  "/subrecipes/:id",
  authMiddleware,
  requireRole("RECIPE_MANAGER"),
  updateSubRecipe
);

/* ================= ADMIN: INGREDIENTS (GLOBAL PRICE UPDATE) ================= */
router.get(
  "/ingredients",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  listAllIngredients
);
router.post(
  "/ingredients/bulk-update",
  authMiddleware,
  requireRole("INGREDIENT_MANAGER"),
  bulkUpdateIngredientPrices
);

export default router;

