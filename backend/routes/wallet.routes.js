import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/user.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendWalletTransactionEmail } from "../utils/walletMailer.js";
import { sendOrderNotificationEmails } from "../utils/orderMailer.js";
import { requireRole } from "../middleware/requireAdmin.js";
import Order from "../models/order.js";
import KitchenInventory from "../models/kitchenInventory.js";
import ItemMaster from "../models/itemMaster.js";
import MinimumPackage from "../models/minimumPackage.js";

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("wallet");

    if (!user || !user.wallet) {
      return res.json({
        balance: 0,
        dueAmount: 0,
        dueReason: null,
        transactions: []
      });
    }

    res.json({
      balance: user.wallet.balance || 0,
      dueAmount: user.wallet.dueAmount || 0,
      dueReason: user.wallet.dueReason || null,
      transactions: user.wallet.transactions || []
    });
  } catch (err) {
    console.error("Wallet fetch error:", err);
    res.status(500).json({ message: "Wallet fetch failed" });
  }
});




/* ---------------- Create Razorpay order ---------------- */
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    let { amount } = req.body;
    amount = Number(amount);

    if (!amount || amount < 10) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `w${Date.now().toString().slice(-8)}`
    });

    res.json(order);
  } catch (err) {
    console.error("Razorpay order error:", err);
    res.status(500).json({ message: "Razorpay order failed" });
  }
});



/* ---------------- Verify payment & credit wallet ---------------- */
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      applyGst = false
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.error("Missing Razorpay fields");
      return res.status(400).json({ message: "Invalid Razorpay response" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");


    if (expected !== razorpay_signature) {
      console.error("Signature mismatch");
      return res.status(400).json({ message: "Payment verification failed" });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }


    if (!user.wallet) {
      user.wallet = { balance: 0, transactions: [] };
    }

    const enteredNet = Number(amount);
    const gstRate = 0.18;
    const paidTotal = applyGst ? enteredNet * (1 + gstRate) : enteredNet;

    user.wallet.balance += paidTotal;
    // ----------------- AUTO CLEAR DUE -----------------
    if (user.wallet.dueAmount > 0) {
      if (applyGst) {
        const dueNet = Math.min(user.wallet.dueAmount, enteredNet);
        const dueTotal = dueNet * (1 + gstRate);

        user.wallet.balance -= dueTotal;
        user.wallet.dueAmount -= dueNet;

        user.wallet.transactions.push({
          amount: dueTotal,
          type: "debit",
          source: "system",
          reason: "Due adjustment (incl GST)"
        });

        if (user.wallet.dueAmount === 0) {
          user.wallet.dueReason = null;
        }
      } else {
        const adjusted = Math.min(user.wallet.balance, user.wallet.dueAmount);

        user.wallet.balance -= adjusted;
        user.wallet.dueAmount -= adjusted;

        user.wallet.transactions.push({
          amount: adjusted,
          type: "debit",
          source: "system",
          reason: "Due adjustment"
        });

        if (user.wallet.dueAmount === 0) {
          user.wallet.dueReason = null;
        }
      }
    }

    user.wallet.transactions.push({
      amount: paidTotal,
      type: "credit",
      source: "razorpay",
      reason: "Wallet recharge"
    });

    await user.save();

    console.log("Wallet updated. Sending email…");

    await sendWalletTransactionEmail({
      to: user.email,
      amount: paidTotal,
      type: "credit",
      source: "razorpay",
      reason: "Wallet recharge",
      balance: user.wallet.balance,
      brandName: user.brandName
    });

    console.log("Email sent.");

    res.json({ success: true, balance: user.wallet.balance });

  } catch (err) {
    console.error("Wallet verify error:", err);
    res.status(500).json({ message: "Wallet update failed" });
  }
});

/*-----------------Admin Wallet Deduction-----------------*/
router.post(
  "/admin/deduct",
  authMiddleware,
  requireRole("WALLET_MANAGER"),
  async (req, res) => {
    const { userId, amount, reason } = req.body;

    const enteredNet = Number(amount);
    if (!enteredNet || enteredNet <= 0 || !reason) {
      return res.status(400).json({ message: "Amount and reason required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Brand not found" });
    }

    if (!user.wallet) {
      user.wallet = { balance: 0, transactions: [] };
    }

    const gstRate = 0.18;
    const totalToDeduct = enteredNet * (1 + gstRate);

    if (user.wallet.balance < totalToDeduct) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    user.wallet.balance -= totalToDeduct;

    // Apply wallet deduction against due first (net), so client due alert updates correctly.
    if (Number(user.wallet.dueAmount || 0) > 0) {
      const dueNet = Math.min(Number(user.wallet.dueAmount || 0), enteredNet);
      user.wallet.dueAmount = Number(user.wallet.dueAmount || 0) - dueNet;
      if (user.wallet.dueAmount === 0) {
        user.wallet.dueReason = null;
      }
    }

    user.wallet.transactions.push({
      type: "debit",
      amount: totalToDeduct,
      reason,
      source: "admin"
    });

    await user.save();

    res.json({
      message: "Wallet deducted",
      balance: user.wallet.balance
    });
  }
);

router.post("/pay", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, items } = req.body;

    const payAmount = Number(amount);

    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.wallet) {
      user.wallet = { balance: 0, transactions: [] };
    }

    if (user.wallet.balance < payAmount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    /* ================= WALLET DEDUCTION ================= */
    user.wallet.balance -= payAmount;

    user.wallet.transactions.push({
      type: "debit",
      amount: payAmount,
      source: "admin", // MUST match enum
      reason: "ORDER_PAYMENT"
    });

    await user.save();

    /* ================= CREATE ORDER ================= */
    /* ================= NORMALIZE ITEMS FROM BREAKDOWN ================= */
    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const normalizedItems = items.map((item) => {

      let breakdown = item.breakdown;

      // 🔥 FORCE SAFE OBJECT CONVERSION
      if (typeof breakdown === "string") {
        try {
          breakdown = JSON.parse(breakdown);
        } catch {
          breakdown = [];
        }
      }

      if (!Array.isArray(breakdown)) breakdown = [];

      breakdown = breakdown.map((r) => ({
        item: String(r.item || ""),
        type: String(r.type || ""),
        qty: Number(r.qty || 0),
        uom: String(r.uom || ""),
        cost: Number(r.cost || 0),
        level: Number(r.level || 0),
      }));

      // Procurement rows are used for inventory updates after payment.
      // They may include nested SUBRECIPE rows; we only act on INGREDIENT rows.
      let procurement = item.procurement;
      if (typeof procurement === "string") {
        try {
          procurement = JSON.parse(procurement);
        } catch {
          procurement = [];
        }
      }
      if (!Array.isArray(procurement)) procurement = [];

      procurement = procurement.map((r) => ({
        itemName: String(r.itemName || r.item || "").trim(),
        type: String(r.type || ""),
        requiredQty: toNum(r.requiredQty),
        inventoryQty: toNum(r.inventoryQty),
        procureQty: toNum(r.procureQty),
        uom: String(r.uom || ""),
        level: toNum(r.level),
      }));

      return {
        dish: item.dish,
        qty: Number(item.qty || 1), // TRUST FRONTEND
        price: Number(item.price) || 0,
        total: Number(item.total) || 0,
        breakdown,
        procurement,
      };
    });



normalizedItems.forEach((item, i) => {
  
  if (item.breakdown)
    item.breakdown.forEach((b, j) =>
      console.log("  row", j, typeof b, b)
    );
});
console.log("================================");
const order = await Order.create({
  brand: user._id,
  items: normalizedItems,
  amount: payAmount,
  paymentMethod: "wallet",
  status: "PLACED",
  isSeenByAdmin: false
});

    /* ================= INVENTORY LEDGER UPDATE (PAYMENT SUCCESS) ================= */
    try {
      // We MUST compute inventory updates from latest DB availableQty inside a transaction.
      // Procurement payload can be used only to get requiredQty totals.
      const normalizeName = (raw) =>
        String(raw || "")
          .replace("SR:", "")
          .trim()
          .toLowerCase();

      // keyLower -> { ingredientName, requiredQty }
      const requiredByIngredient = new Map();

      // 1) Prefer procurement payload (backward compatible fallback below).
      let hasProcurement = false;
      for (const line of normalizedItems) {
        for (const row of line.procurement || []) {
          if (!row || row.type !== "INGREDIENT") continue;
          hasProcurement = true;

          const ingredientNameRaw = row.itemName || row.item || "";
          const ingredientNameNorm = normalizeName(ingredientNameRaw);
          if (!ingredientNameNorm) continue;

          const entry =
            requiredByIngredient.get(ingredientNameNorm) || {
              // Keep a normalized display name so ItemMaster lookup is consistent
              ingredientName: String(ingredientNameRaw || "").replace("SR:", "").trim(),
              requiredQty: 0,
            };

          entry.requiredQty += Number(row.requiredQty || 0);
          requiredByIngredient.set(ingredientNameNorm, entry);
        }
      }

      // 2) Backward compatibility: if no procurement payload, derive requiredQty from breakdown.
      if (!hasProcurement || requiredByIngredient.size === 0) {
        for (const line of normalizedItems) {
          for (const row of line.breakdown || []) {
            if (!row || row.type !== "INGREDIENT") continue;
            const ingredientNameNorm = normalizeName(row.item);
            if (!ingredientNameNorm) continue;

            const entry =
              requiredByIngredient.get(ingredientNameNorm) || {
                ingredientName: String(row.item || "").replace("SR:", "").trim(),
                requiredQty: 0,
              };

            // row.qty is for 1x recipe; multiply by ordered dish qty
            entry.requiredQty += Number(row.qty || 0) * Number(line.qty || 1);
            requiredByIngredient.set(ingredientNameNorm, entry);
          }
        }
      }

      if (requiredByIngredient.size > 0) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          const keys = [...requiredByIngredient.keys()]; // normalized names
          const ingredientNames = keys
            .map((k) => requiredByIngredient.get(k)?.ingredientName)
            .filter(Boolean);

          // Resolve ItemMaster by itemName (to get ingredientId)
          const itemDocs = await ItemMaster.find({
            itemName: {
              $in: ingredientNames.map((n) =>
                new RegExp(`^${escapeRegex(String(n))}$`, "i")
              ),
            },
          }).lean();

          const byNameKey = new Map();
          itemDocs.forEach((doc) => {
            const key = normalizeName(doc.itemName);
            if (!key) return;
            byNameKey.set(key, doc);
          });

          // Resolve minPackQty per ingredientName
          const minPkgDocs = await MinimumPackage.find({
            itemName: {
              $in: ingredientNames.map((n) =>
                new RegExp(`^${escapeRegex(String(n))}$`, "i")
              ),
            },
          })
            .select("itemName minPackQty")
            .lean();

          const minPackByNameKey = new Map();
          minPkgDocs.forEach((doc) => {
            const key = normalizeName(doc.itemName);
            if (!key) return;
            minPackByNameKey.set(key, Number(doc.minPackQty || 0));
          });

          console.log("==== [InventoryLedger] Update Start ====");
          console.log(
            "[InventoryLedger] requiredByIngredient:",
            [...requiredByIngredient.entries()]
          );

          for (const [nameKey, agg] of requiredByIngredient.entries()) {
            const itemDoc = byNameKey.get(nameKey);
            if (!itemDoc) {
              console.warn(
                "[InventoryLedger] Ingredient not found in ItemMaster:",
                agg.ingredientName
              );
              continue;
            }

            const ingredientId = itemDoc._id;
            const requiredQty = Math.max(Number(agg.requiredQty || 0), 0);
            if (requiredQty === 0) continue;

            const minPackQtyRaw = minPackByNameKey.get(nameKey);
            const minPackQty = Number(minPackQtyRaw || 0) || 1;

            // IMPORTANT: read latest availableQty from DB (inside transaction)
            const invDoc = await KitchenInventory.findOne(
              { clientId: user._id, ingredientId },
              { availableQty: 1 }
            ).session(session);

            const availableQty = Math.max(Number(invDoc?.availableQty || 0), 0);

            // Ledger flow:
            // stockUsed = min(requiredQty, availableQty)
            // remainingAfterUse = availableQty - stockUsed
            // netRequired = requiredQty - stockUsed
            // packets = ceil(netRequired / minPackQty)
            // procureQty = packets * minPackQty
            // finalInventory = remainingAfterUse + (procureQty - netRequired)
            const stockUsed = Math.min(requiredQty, availableQty);
            const remainingAfterUse = availableQty - stockUsed; // >= 0
            const netRequired = requiredQty - stockUsed; // >= 0
            const packets = netRequired <= 0 ? 0 : Math.ceil(netRequired / minPackQty);
            const procureQty = packets * minPackQty;
            // Purchased quantity (procureQty) is consumed to fulfill netRequired.
            // Leftover stored back into inventory is (procureQty - netRequired).
            const leftoverAfterPurchase = procureQty - netRequired; // >= 0
            const finalInventory = remainingAfterUse + leftoverAfterPurchase;

            if (finalInventory < 0) {
              throw new Error(
                `[InventoryLedger] Negative finalInventory for ${agg.ingredientName}`
              );
            }

            console.log("[InventoryLedger] ingredient update:", {
              ingredientName: agg.ingredientName,
              requiredQty,
              availableQty,
              minPackQty,
              stockUsed,
              netRequired,
              packets,
              procureQty,
              leftoverAfterPurchase,
              finalInventory,
            });

            await KitchenInventory.updateOne(
              { clientId: user._id, ingredientId },
              { $set: { availableQty: finalInventory }, $setOnInsert: { clientId: user._id, ingredientId } },
              { upsert: true, session }
            );
          }

          await session.commitTransaction();
        } catch (invTxErr) {
          await session.abortTransaction();
          throw invTxErr;
        } finally {
          session.endSession();
        }
      }
    } catch (invErr) {
      console.error("Inventory update after pay failed:", invErr);
      // do not fail payment response; just log the error
    }

    /* ================= SEND ORDER NOTIFICATION EMAILS ================= */
    try {
      await sendOrderNotificationEmails({
        order,
        userEmail: user.email,
        brandName: user.brandName,
      });
    } catch (emailErr) {
      console.error("Order notification email error:", emailErr);
    }

    res.json({
      success: true,
      orderId: order._id,
      remainingBalance: user.wallet.balance
    });

  } catch (err) {
  console.log("====== REAL ERROR START ======");
  console.log(err);
  console.log(err.message);
  console.log(err.errors);
  console.log("====== REAL ERROR END ======");
  res.status(500).json({ message: err.message });
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
});

// ----------------- Admin: Add Due Amount -----------------
router.post(
  "/admin/wallet/due",
  authMiddleware,
  requireRole("WALLET_MANAGER"),
  async (req, res) => {
    try {
      const { userId, amount, reason } = req.body;

      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid input" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "Brand not found" });
      }

      if (!user.wallet) {
        user.wallet = { balance: 0, transactions: [] };
      }

      user.wallet.dueAmount =
        Number(user.wallet.dueAmount || 0) + Number(amount);

      user.wallet.dueReason = reason || "Pending payment";

      await user.save();

      res.json({
        success: true,
        dueAmount: user.wallet.dueAmount
      });
    } catch (err) {
      console.error("Add due error:", err);
      res.status(500).json({ message: "Failed to add due" });
    }
  }
);


export default router;
