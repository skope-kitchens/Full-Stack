import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import vendorEligibility from "../controllers/vendorEligibility.controller.js";

const router = express.Router();

router.post("/", authMiddleware, vendorEligibility);

export default router;
