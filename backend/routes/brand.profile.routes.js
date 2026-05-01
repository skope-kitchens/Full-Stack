import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import Brand from "../models/brand.js";

const router = express.Router();

/**
 * GET /api/brand/profile
 * Returns brandName and chefName for the logged-in brand
 */
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const { brandName } = req.user || {};
    console.log("TOKEN USER =", req.user);
console.log("SEARCHING BRAND =", brandName);

    if (!brandName) {
      return res.status(400).json({
        message: "Brand name missing in token",
      });
    }

    const brand = await Brand.findOne({ brandName });

    if (!brand) {
      return res.status(404).json({
        message: "Brand not found",
      });
    }

    return res.json({
      brandName: brand.brandName,
      chefName: brand.chefName || "",
      ristaBranchCodes: brand.ristaBranchCodes || [],
      analyticsPeriod: brand.analyticsPeriod || null,
    });
  } catch (error) {
    console.error("[BRAND PROFILE]", error);
    return res.status(500).json({
      message: "Failed to load brand profile",
    });
  }
  
});

export default router;
