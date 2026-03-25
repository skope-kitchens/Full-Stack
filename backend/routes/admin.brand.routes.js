import express from "express";
import User from "../models/user.js";
import BrandServiceChecklist from "../models/brandServiceChecklist.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireAdmin.js";
import Order from "../models/order.js";
import IngredientIndent from "../models/ingredientIndent.js";
import MenuEntry from "../models/menuEntry.js";
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

      // 2️⃣ Get unseen orders
      const unseenOrders = await Order.find({
        isSeenByAdmin: false
      }).select("brand");

      // 2️⃣b Get unseen menu entries
      const unseenMenus = await MenuEntry.find({
        isSeenByRecipeAdmin: false
      }).select("clientId");

      // 3️⃣ Build lookup set
      const brandIdsWithOrders = new Set(
        unseenOrders.map(o => o.brand.toString())
      );
      const brandIdsWithMenus = new Set(
        unseenMenus.map(m => m.clientId.toString())
      );

      // 4️⃣ Attach hasNewOrder flag
      const result = brands.map(brand => ({
        ...brand,
        hasNewOrder: brandIdsWithOrders.has(
          brand._id.toString()
        ),
        hasNewMenu: brandIdsWithMenus.has(brand._id.toString()),
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

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      order.status = status;
      
      // Set completedAt timestamp when marking as COMPLETED
      if (status === "COMPLETED" && !order.completedAt) {
        order.completedAt = new Date();
      }
      
      await order.save();

      res.json({ success: true, order });
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

