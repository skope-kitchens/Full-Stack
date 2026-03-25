import React, { useState } from "react";
import { Upload, X, Plus } from "lucide-react";
import Layout from "../components/Layout";

export default function ProductUpload() {
  const [formData, setFormData] = useState({
    storeName: "Warehouse",
    grnNumber: "",
    grnDate: "",
    supplierCode: "",
    supplierName: "",
    supplierItemName: "",
    supplierSKU: "",
    category: "",
    supplierQty: "",
    supplierUnit: "Pcs",
    supplierUnitCost: "",
    discountAmount: "",
    chargeAmount: "",
    deliveryCharges: "",
    totalTax: "",
    totalITC: "",
    imageUrl: "",
  });

  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // convert safely to number
  const num = (v) => parseFloat(v) || 0;

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value, // store as string (prevents 0 and 020 issues)
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
      setFormData((prev) => ({ ...prev, imageUrl: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // calculations
  const baseCost = num(formData.supplierQty) * num(formData.supplierUnitCost);

  const totalCost =
    baseCost -
    num(formData.discountAmount) +
    num(formData.chargeAmount) +
    num(formData.deliveryCharges) +
    num(formData.totalTax);

  const validateForm = () => {
    const e = {};

    if (!formData.grnNumber.trim()) e.grnNumber = "GRN Number is required";
    if (!formData.grnDate) e.grnDate = "GRN Date is required";
    if (!formData.supplierCode.trim()) e.supplierCode = "Supplier Code is required";
    if (!formData.supplierName.trim()) e.supplierName = "Supplier Name is required";
    if (!formData.supplierItemName.trim()) e.supplierItemName = "Item Name is required";
    if (!formData.supplierSKU.trim()) e.supplierSKU = "SKU is required";
    if (!formData.category.trim()) e.category = "Category is required";

    if (!num(formData.supplierQty)) e.supplierQty = "Quantity must be greater than 0";
    if (!num(formData.supplierUnitCost)) e.supplierUnitCost = "Unit Cost must be greater than 0";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    try {
    const payload = {
        ...formData,
        baseCost,
        totalAmount: totalCost,
    };

    const res = await fetch("http://localhost:5002/api/products", {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Failed to upload");

    alert("Product uploaded successfully!");


      // reset
      setFormData({
        storeName: "Warehouse",
        grnNumber: "",
        grnDate: "",
        supplierCode: "",
        supplierName: "",
        supplierItemName: "",
        supplierSKU: "",
        category: "",
        supplierQty: "",
        supplierUnit: "Pcs",
        supplierUnitCost: "",
        discountAmount: "",
        chargeAmount: "",
        deliveryCharges: "",
        totalTax: "",
        totalITC: "",
        imageUrl: "",
      });

      setImagePreview(null);
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };




  return (
    <Layout>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-5xl  mx-auto">
        <div className="bg-[url('./assets/Main-bg.png')] bg-no-repeat bg-center bg-cover rounded-lg shadow-lg">
          {/* Header */}
          <div className=" px-8 py-6 rounded-t-lg">
            <h1 className="text-3xl font-bold text-black mb-2">Product Upload</h1>
            <p className="text-black">Add new products to warehouse inventory</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8">
            {/* Image Upload Section */}
            <div className="mb-8 pb-8 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Product Image</h2>
              <div className="flex gap-6">
                <div className="flex-1">
                  <label className="block w-full">
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-slate-400 transition-colors">
                      {imagePreview ? (
                        <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto object-contain" />
                      ) : (
                        <div className="py-4">
                          <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                          <p className="text-sm text-slate-600">Click to upload image</p>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </div>
                  </label>
                </div>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setFormData(prev => ({ ...prev, imageUrl: '' }));
                    }}
                    className="text-red-600 hover:text-red-700 self-start pt-2"
                  >
                    <X className="w-6 h-6" />
                  </button>
                )}
              </div>
            </div>

            {/* Store & GRN Info */}
            <div className="mb-8 pb-8 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Store & GRN Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Store Name</label>
                  <input
                    type="text"
                    name="storeName"
                    value={formData.storeName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">GRN Number *</label>
                  <input
                    type="text"
                    name="grnNumber"
                    value={formData.grnNumber}
                    onChange={handleInputChange}
                    placeholder="1263"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.grnNumber ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.grnNumber && <p className="text-red-600 text-sm mt-1">{errors.grnNumber}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">GRN Date *</label>
                  <input
                    type="date"
                    name="grnDate"
                    value={formData.grnDate}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.grnDate ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.grnDate && <p className="text-red-600 text-sm mt-1">{errors.grnDate}</p>}
                </div>
              </div>
            </div>

            {/* Supplier Information */}
            <div className="mb-8 pb-8 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Supplier Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Supplier Code *</label>
                  <input
                    type="text"
                    name="supplierCode"
                    value={formData.supplierCode}
                    onChange={handleInputChange}
                    placeholder="TS"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.supplierCode ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.supplierCode && <p className="text-red-600 text-sm mt-1">{errors.supplierCode}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Supplier Name *</label>
                  <input
                    type="text"
                    name="supplierName"
                    value={formData.supplierName}
                    onChange={handleInputChange}
                    placeholder="T S ENTERPRISES"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.supplierName ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.supplierName && <p className="text-red-600 text-sm mt-1">{errors.supplierName}</p>}
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div className="mb-8 pb-8 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Product Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Item Name *</label>
                  <input
                    type="text"
                    name="supplierItemName"
                    value={formData.supplierItemName}
                    onChange={handleInputChange}
                    placeholder="100 ML CONTAINER"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.supplierItemName ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.supplierItemName && <p className="text-red-600 text-sm mt-1">{errors.supplierItemName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">SKU *</label>
                  <input
                    type="text"
                    name="supplierSKU"
                    value={formData.supplierSKU}
                    onChange={handleInputChange}
                    placeholder="M316"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.supplierSKU ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.supplierSKU && <p className="text-red-600 text-sm mt-1">{errors.supplierSKU}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category *</label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    placeholder="PACKAGING"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.category ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.category && <p className="text-red-600 text-sm mt-1">{errors.category}</p>}
                </div>
              </div>
            </div>

            {/* Quantity & Pricing */}
            <div className="mb-8 pb-8 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Quantity & Pricing</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Quantity *</label>
                  <input
                    type="number"
                    name="supplierQty"
                    value={formData.supplierQty}
                    onChange={handleInputChange}
                    placeholder="1500"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.supplierQty ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.supplierQty && <p className="text-red-600 text-sm mt-1">{errors.supplierQty}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Unit</label>
                  <select
                    name="supplierUnit"
                    value={formData.supplierUnit}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                  >
                    <option>Pcs</option>
                    <option>Box</option>
                    <option>Kg</option>
                    <option>Ltr</option>
                    <option>Meters</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Unit Cost *</label>
                  <input
                    type="number"
                    name="supplierUnitCost"
                    value={formData.supplierUnitCost}
                    onChange={handleInputChange}
                    placeholder="2.55"
                    step="0.01"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-all ${
                      errors.supplierUnitCost ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-slate-500'
                    }`}
                  />
                  {errors.supplierUnitCost && <p className="text-red-600 text-sm mt-1">{errors.supplierUnitCost}</p>}
                </div>
              </div>
            </div>

            {/* Charges & Taxes */}
            <div className="mb-8 pb-8 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Charges & Taxes</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Discount Amount</label>
                  <input
                    type="number"
                    name="discountAmount"
                    value={formData.discountAmount}
                    onChange={handleInputChange}
                    placeholder="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Additional Charges</label>
                  <input
                    type="number"
                    name="chargeAmount"
                    value={formData.chargeAmount}
                    onChange={handleInputChange}
                    placeholder="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Delivery Charges</label>
                  <input
                    type="number"
                    name="deliveryCharges"
                    value={formData.deliveryCharges}
                    onChange={handleInputChange}
                    placeholder="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tax</label>
                  <input
                    type="number"
                    name="totalTax"
                    value={formData.totalTax}
                    onChange={handleInputChange}
                    placeholder="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">ITC</label>
                  <input
                    type="number"
                    name="totalITC"
                    value={formData.totalITC}
                    onChange={handleInputChange}
                    placeholder="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Cost Summary */}
            <div className="mb-8">
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg p-6 border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Cost Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Base Cost</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ₹{(num(formData.supplierQty) * num(formData.supplierUnitCost)).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Discount</p>
                    <p className="text-2xl font-bold text-red-600">-₹{num(formData.discountAmount).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Delivery</p>
                    <p className="text-2xl font-bold text-slate-900">+₹{num(formData.deliveryCharges).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Total Amount</p>
                    <p className="text-2xl font-bold text-emerald-600">₹{totalCost.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white font-semibold py-3 rounded-lg hover:from-slate-700 hover:to-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {loading ? 'Uploading...' : 'Upload Product'}
            </button>
          </form>
        </div>
      </div>
    </div>
    </Layout>
  );
}
