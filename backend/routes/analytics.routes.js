import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import User from "../models/user.js";
import { computeBrandSalesSummary } from "../utils/salesSummary.js";

const router = express.Router();

router.get("/sales/summary", authMiddleware, async (req, res) => {
  try {
    // 🔐 Only clients can access analytics
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Analytics allowed only for clients" });
    }

    const { day, branches: queryBranches } = req.query || {};

    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({
        message: "day is required in YYYY-MM-DD format"
      });
    }

    // Get brandName from logged-in client
    const user = await User.findById(req.user._id).select("brandName");
    if (!user || !user.brandName) {
      return res.status(404).json({ message: "Brand not linked to this account" });
    }

    const summary = await computeBrandSalesSummary({
      brandName: user.brandName,
      day,
      branches: queryBranches,
    });

    return res.json(summary);
  } catch (err) {
    console.error("[SALES SUMMARY]", err);
    return res.status(500).json({
      message: "Failed to load sales summary",
      details: err?.message
    });
  }
});

export default router;
