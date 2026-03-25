import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    "Supplier Item Name": String,
    "Supplier SKU": String,
    "Supplier Name": String,
    "Category": String,
    "Supplier Qty": Number,
    "Supplier Unit Cost": Number,
    image_url: String
  },
  {
    strict: false,         
    timestamps: true,
    collection: "products"
  },{ timestamps: true }
);

export default mongoose.model("Products", ProductSchema, "products");
