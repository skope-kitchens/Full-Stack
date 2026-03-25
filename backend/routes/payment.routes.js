import express from "express";
import Razorpay from "razorpay";
import {payment} from "../controllers/payment.controller.js";

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

router.post("/create-order", payment);

export default router;
