import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import Brand from "../models/brand.js";

const router = express.Router();

/**
 * POST /api/brand/settings
 * Save dashboard analytics filters (branchCodes[] + period)
 */
router.post("/settings", authMiddleware, async (req, res) => {
  try {
    const { branchCodes, period } = req.body || {};

    if (!Array.isArray(branchCodes) || branchCodes.length === 0) {
      return res.status(400).json({
        message: "branchCodes must be a non-empty array",
      });
    }

    if (!period) {
      return res.status(400).json({
        message: "period is required",
      });
    }

    const brandId = req.brand?._id;

    if (!brandId) {
      return res.status(401).json({
        message: "Brand not found in request context",
      });
    }

    const updatedBrand = await Brand.findByIdAndUpdate(
      brandId,
      {
        ristaBranchCodes: branchCodes.map((b) => b.trim()),
        analyticsPeriod: period.trim(),
      },
      { new: true }
    );

    return res.json({
      success: true,
      branchCodes: updatedBrand.ristaBranchCodes,
      period: updatedBrand.analyticsPeriod,
    });
  } catch (error) {
    console.error("[BRAND SETTINGS]", error);
    return res.status(500).json({
      message: "Failed to save brand settings",
    });
  }
});

export default router;
