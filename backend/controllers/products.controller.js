import Products from "../models/products.js";
import mongoose from "mongoose";

export const getProducts = async (req, res) => {
  try {
    const { supplierName } = req.query;

    const matchStage = {};

    if (supplierName) {
      matchStage["Supplier Name"] = supplierName;
    }

    const products = await Products.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            name: "$Supplier Item Name",
            unit: "$Supplier Unit",
            unitCost: "$Supplier Unit Cost",
            category: "$Category",
            image: "$image_url",
            supplier: "$Supplier Name"
          },
          totalQty: { $sum: "$Supplier Qty" }
        }
      },
      {
        $project: {
          _id: 0,
          supplierName: "$_id.supplier",
          itemName: "$_id.name",
          category: "$_id.category",
          image_url: "$_id.image",
          unit: "$_id.unit",
          unitCost: "$_id.unitCost",
          totalQty: 1
        }
      }

    ]);

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



export const createProduct = async (req, res) => {
  try {
    const data = req.body;

    // image should be optional — do NOT fail if missing
    const newProduct = new Products({
      "Store Name": data.storeName,
      "GRN Number": data.grnNumber,
      "GRN Date": data.grnDate,
      "Supplier Code": data.supplierCode,
      "Supplier Name": data.supplierName,
      "Supplier Item Name": data.supplierItemName,
      "Supplier SKU": data.supplierSKU,
      Category: data.category,
      "Supplier Qty": data.supplierQty,
      "Supplier Unit": data.supplierUnit,
      "Supplier Unit Cost": data.supplierUnitCost,
      "Discount Amount": data.discountAmount,
      "Charge Amount": data.chargeAmount,
      "Delivery Charges": data.deliveryCharges,
      "Total Cost": data.baseCost,
      "Total Tax": data.totalTax,
      "Total ITC": data.totalITC,
      "Total Amount": data.totalAmount,

      // optional
      image_url: data.imageUrl || null
    });

    await newProduct.save();

    res.status(201).json({
      success: true,
      product: newProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

export const checkoutProducts = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items } = req.body;

    /**
     * items = [
     *  { supplierName: "ABC Foods", itemName: "Paneer", qty: 5 }
     * ]
     */

    for (const item of items) {
      const { supplierName, itemName, qty } = item;

      if (!qty || qty <= 0) throw new Error("Invalid checkout quantity");

      // 1️⃣ Check total available stock
      const stock = await Products.aggregate([
        {
          $match: {
            "Supplier Name": supplierName,
            "Supplier Item Name": itemName
          }
        },
        {
          $group: {
            _id: null,
            totalQty: { $sum: "$Supplier Qty" }
          }
        }
      ]);

      const available = stock[0]?.totalQty || 0;

      if (available < qty) {
        throw new Error(
          `Not enough stock for ${itemName}. Available: ${available}, Requested: ${qty}`
        );
      }

      // 2️⃣ Deduct from oldest entries first (FIFO)
      let remaining = qty;

      const batches = await Products.find({
        "Supplier Name": supplierName,
        "Supplier Item Name": itemName,
        "Supplier Qty": { $gt: 0 }
      }).sort({ createdAt: 1 }).session(session);

      for (const b of batches) {
        if (remaining <= 0) break;

        if (b["Supplier Qty"] <= remaining) {
          remaining -= b["Supplier Qty"];
          b["Supplier Qty"] = 0;
        } else {
          b["Supplier Qty"] -= remaining;
          remaining = 0;
        }

        await b.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: "Checkout completed and stock updated" });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: err.message });
  }
};