
import express from "express";
import { getStockItems } from "../controllers/stock.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.get("/stock/items", authMiddleware, getStockItems);

export default router;
