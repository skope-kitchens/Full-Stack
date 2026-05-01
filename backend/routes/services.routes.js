import express from "express";
import BrandServiceChecklist from "../models/brandServiceChecklist.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * CLIENT: fetch checklist for logged-in brand
 */
router.get("/client", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Client access only" });
    }

    const checklist = await BrandServiceChecklist.findOne({
      brandId: req.user._id
    }).lean();

    if (!checklist) {
      return res.json({ services: [] });
    }

    res.json({ services: checklist.services });
  } catch (err) {
    console.error("Client services error:", err);
    res.status(500).json({ message: "Failed to load services" });
  }
});

export default router;
