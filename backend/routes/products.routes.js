import express from "express";
import { getProducts, createProduct, checkoutProducts } from "../controllers/products.controller.js";

const router = express.Router();

router.get("/", getProducts);
router.post("/", createProduct)
router.post("/checkout", checkoutProducts);

export default router;
