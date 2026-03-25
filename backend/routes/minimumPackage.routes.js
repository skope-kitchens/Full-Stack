import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { lookupMinimumPackages } from "../controllers/minimumPackage.controller.js";

const router = express.Router();

// POST /api/minimumpackage/lookup
router.post("/lookup", authMiddleware, lookupMinimumPackages);

export default router;

