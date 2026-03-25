import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  getDashboardStats,
  getLowStock,
} from "../controllers/dashboard.controller.js";

const router = express.Router();

router.get("/stats", authMiddleware, getDashboardStats);

router.get("/low-stock", authMiddleware, getLowStock);

export default router;
