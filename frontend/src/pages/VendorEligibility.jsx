import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api from "../utils/api";

const VendorEligibility = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    // Company
    companyName: "",
    yearEstablished: "",
    address: "",
    postcode: "",
    phone: "",
    accountManagerEmail: "",
    creditControlEmail: "",
    gstNumber: "",
    lastYearTurnover: "",

    // Bank
    bankName: "",
    accountName: "",
    bankAddress: "",
    accountNumber: "",
    ifsc: "",
    swiftCode: "",
    currency: "INR",

    // Goods & Services
    materials: [
      { product: "", purchaseSlab: "", price: "", priceLockPeriod: "" }
    ],

    // Experience
    majorClients: "",
    legalDisputes: "",

    // Commercial
    paymentTerms: "",
    returnPolicy: ""
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const handleMaterialChange = (index, field, value) => {
    const updated = [...formData.materials];
    updated[index][field] = value;
    setFormData((p) => ({ ...p, materials: updated }));
  };

  const addMaterialRow = () => {
    setFormData((p) => ({
      ...p,
      materials: [
        ...p.materials,
        { product: "", purchaseSlab: "", price: "", priceLockPeriod: "" }
      ]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post("/api/vendor-eligibility", formData);
      navigate("/dashboard");
    } catch (err) {
  console.log("API ERROR:", err.response?.status, err.response?.data);
}
 finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Vendor Onboarding Form
            </h1>
            <p className="text-gray-600">
              Please provide accurate vendor and commercial details
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">

            {/* Company Details */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-6 border-b pb-3">
                Company Details
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <input className="input-field" name="companyName" placeholder="Company Name *" onChange={handleChange} />
                <input className="input-field" name="yearEstablished" placeholder="Year Established" onChange={handleChange} />
                <input className="input-field md:col-span-2" name="address" placeholder="Address" onChange={handleChange} />
                <input className="input-field" name="postcode" placeholder="Postcode" onChange={handleChange} />
                <input className="input-field" name="phone" placeholder="Phone Number" onChange={handleChange} />
                <input className="input-field" name="accountManagerEmail" placeholder="Account Manager Email" onChange={handleChange} />
                <input className="input-field" name="creditControlEmail" placeholder="Credit Control Email" onChange={handleChange} />
                <input className="input-field" name="gstNumber" placeholder="GST Number" onChange={handleChange} />
                <input className="input-field" name="lastYearTurnover" placeholder="Last Year Turnover" onChange={handleChange} />
              </div>
            </div>

            {/* Bank Details */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-6 border-b pb-3">
                Bank Details
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <input className="input-field" name="bankName" placeholder="Bank Name" onChange={handleChange} />
                <input className="input-field" name="accountName" placeholder="Account Name" onChange={handleChange} />
                <input className="input-field md:col-span-2" name="bankAddress" placeholder="Bank Address" onChange={handleChange} />
                <input className="input-field" name="accountNumber" placeholder="Account Number" onChange={handleChange} />
                <input className="input-field" name="ifsc" placeholder="IFSC Code" onChange={handleChange} />
                <input className="input-field" name="swiftCode" placeholder="SWIFT Code (optional)" onChange={handleChange} />
              </div>
            </div>

            {/* Goods & Services */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-6 border-b pb-3">
                Goods & Services Supplied
              </h2>

              {formData.materials.map((item, idx) => (
                <div key={idx} className="grid md:grid-cols-4 gap-4 mb-4">
                  <input className="input-field" placeholder="Product" onChange={(e) => handleMaterialChange(idx, "product", e.target.value)} />
                  <input className="input-field" placeholder="Purchase Slab" onChange={(e) => handleMaterialChange(idx, "purchaseSlab", e.target.value)} />
                  <input className="input-field" placeholder="Price" onChange={(e) => handleMaterialChange(idx, "price", e.target.value)} />
                  <input className="input-field" placeholder="Price Lock Period" onChange={(e) => handleMaterialChange(idx, "priceLockPeriod", e.target.value)} />
                </div>
              ))}

              <button type="button" onClick={addMaterialRow} className="text-sm text-primary-600">
                + Add another item
              </button>
            </div>

            {/* Experience */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-6 border-b pb-3">
                Experience & References
              </h2>

              <textarea
                className="input-field"
                rows="3"
                name="majorClients"
                placeholder="Major clients / references"
                onChange={handleChange}
              />

              <textarea
                className="input-field mt-4"
                rows="3"
                name="legalDisputes"
                placeholder="Any legal disputes?"
                onChange={handleChange}
              />
            </div>

            {/* Commercial */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-6 border-b pb-3">
                Commercial Terms
              </h2>

              <textarea
                className="input-field"
                rows="2"
                name="paymentTerms"
                placeholder="Payment Terms"
                onChange={handleChange}
              />

              <textarea
                className="input-field mt-4"
                rows="2"
                name="returnPolicy"
                placeholder="Return & Refund Policy"
                onChange={handleChange}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-4">
              <button type="button" onClick={() => navigate(-1)} className="px-6 py-3 border rounded-lg">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn-primary bg-black">
                {loading ? "Submitting..." : "Submit Vendor"}
              </button>
            </div>

          </form>
        </div>
      </div>
    </Layout>
  );
};

export default VendorEligibility;
