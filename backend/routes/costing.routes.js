import express from "express";
import {
  getMainRecipes,
  calculateFoodCost,
  getSummary,
} from "../controllers/costing.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.get("/recipes", authMiddleware, getMainRecipes);
router.post("/calculate",authMiddleware, calculateFoodCost);
// routes/costing.routes.js
router.get("/summary",authMiddleware, getSummary);


export default router;
