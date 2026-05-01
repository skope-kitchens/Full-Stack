import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import Order from "../models/order.js";

const router = express.Router();

/* ================= GET CLIENT ORDERS ================= */
router.get("/client/orders", authMiddleware, async (req, res) => {
  try {
    // Only clients can access their orders
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Access denied" });
    }

    const orders = await Order.find({ brand: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (err) {
    console.error("Failed to fetch client orders:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

/* ================= MARK ORDER AS RECEIVED ================= */
router.patch("/client/orders/:orderId/receive", authMiddleware, async (req, res) => {
  try {
    // Only clients can mark orders as received
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify order belongs to this client
    if (order.brand.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Only allow marking as received if order is COMPLETED
    if (order.status !== "COMPLETED") {
      return res.status(400).json({ 
        message: "Order must be completed before marking as received" 
      });
    }

    order.isReceived = true;
    order.receivedAt = new Date();
    await order.save();

    res.json({ success: true, order });
  } catch (err) {
    console.error("Failed to mark order as received:", err);
    res.status(500).json({ message: "Failed to update order" });
  }
});

export default router;
