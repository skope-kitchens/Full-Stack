import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { authUtils } from "../utils/auth";
import api from "../utils/api";

export default function EligibilityForm() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    brandName: "",
    menuList: "",
    equipmentsList: "",
    smallwareList: "",
    averageOrderValue: "",
    ordersPerDay: "",
    staffMorning: "",
    staffEvening: "",
    staffNight: "",
    operationalHours: "",
    document: null,
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const next = {};
    if (!formData.brandName.trim()) next.brandName = "Brand name is required";
    if (!formData.menuList.trim()) next.menuList = "Menu list is required";
    if (!formData.equipmentsList.trim())
      next.equipmentsList = "Equipments list is required";
    if (!formData.smallwareList.trim())
      next.smallwareList = "Smallware list is required";
    if (!Number(formData.averageOrderValue) || Number(formData.averageOrderValue) <= 0)
      next.averageOrderValue = "Average order value is required";
    if (!Number(formData.ordersPerDay) || Number(formData.ordersPerDay) <= 0)
      next.ordersPerDay = "Orders per day is required";
    if (!formData.operationalHours.trim())
      next.operationalHours = "Operational hours is required";
    if (!formData.document) next.document = "Please upload a document";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setStatus({ type: "", message: "" });

    try {
      const user = authUtils.getUser();
      const fd = new FormData();

      fd.append("brandName", formData.brandName.trim());
      fd.append("menuList", formData.menuList);
      fd.append("equipmentsList", formData.equipmentsList);
      fd.append("smallwareList", formData.smallwareList);
      fd.append("averageOrderValue", String(formData.averageOrderValue));
      fd.append("ordersPerDay", String(formData.ordersPerDay));
      fd.append(
        "staffRequired",
        JSON.stringify({
          morning: Number(formData.staffMorning || 0),
          evening: Number(formData.staffEvening || 0),
          night: Number(formData.staffNight || 0),
        })
      );
      fd.append("operationalHours", formData.operationalHours.trim());

      fd.append("submittedBy", user?.id || "");
      fd.append("submittedByEmail", user?.email || "");

      fd.append("document", formData.document);

      const response = await api.post("/api/eligibility", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      try {
        localStorage.setItem("selectedBrandName", formData.brandName.trim());
        localStorage.setItem(
          "eligibilityScore",
          JSON.stringify({
            score: response.data.score,
            decision: response.data.decision,
            meetsThreshold: response.data.meetsThreshold,
            sectionScores: response.data.sectionScores,
            brandName: formData.brandName.trim(),
            aiAnalysisSummary: response.data.aiAnalysisSummary,
          })
        );
      } catch (err) {
        console.error("Unable to cache score or brand name", err);
      }

      setStatus({ type: "success", message: "Submission received! Analyzing..." });
      setTimeout(() => navigate("/analyzing"), 600);
    } catch (error) {
      console.error(error);
      const message =
        error.response?.data?.message ||
        "Unable to submit the eligibility form. Please try again.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Client Eligibility Form
            </h1>
            <p className="text-gray-600">
              Submit the required brand and operations details.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-6 bg-white rounded-2xl shadow p-6"
          >
            {status.message && (
              <div
                className={`px-4 py-3 rounded-lg text-sm ${
                  status.type === "success"
                    ? "bg-green-50 border border-green-200 text-green-700"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}
              >
                {status.message}
              </div>
            )}

            <Field label="Brand Name" error={errors.brandName}>
              <input
                type="text"
                name="brandName"
                value={formData.brandName}
                onChange={handleChange}
                className={`w-full border rounded-lg px-3 py-2 ${
                  errors.brandName ? "border-red-500" : ""
                }`}
              />
            </Field>

            <Field label="Menu List" hint="Comma separated" error={errors.menuList}>
              <textarea
                name="menuList"
                value={formData.menuList}
                onChange={handleChange}
                className={`w-full border rounded-lg px-3 py-2 ${
                  errors.menuList ? "border-red-500" : ""
                }`}
                rows={3}
              />
            </Field>

            <Field
              label="Equipments List"
              hint="Comma separated"
              error={errors.equipmentsList}
            >
              <textarea
                name="equipmentsList"
                value={formData.equipmentsList}
                onChange={handleChange}
                className={`w-full border rounded-lg px-3 py-2 ${
                  errors.equipmentsList ? "border-red-500" : ""
                }`}
                rows={3}
              />
            </Field>

            <Field
              label="Smallware List"
              hint="Comma separated"
              error={errors.smallwareList}
            >
              <textarea
                name="smallwareList"
                value={formData.smallwareList}
                onChange={handleChange}
                className={`w-full border rounded-lg px-3 py-2 ${
                  errors.smallwareList ? "border-red-500" : ""
                }`}
                rows={3}
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Average Order Value" error={errors.averageOrderValue}>
                <input
                  type="number"
                  name="averageOrderValue"
                  value={formData.averageOrderValue}
                  onChange={handleChange}
                  className={`w-full border rounded-lg px-3 py-2 ${
                    errors.averageOrderValue ? "border-red-500" : ""
                  }`}
                />
              </Field>
              <Field label="Orders per Day" error={errors.ordersPerDay}>
                <input
                  type="number"
                  name="ordersPerDay"
                  value={formData.ordersPerDay}
                  onChange={handleChange}
                  className={`w-full border rounded-lg px-3 py-2 ${
                    errors.ordersPerDay ? "border-red-500" : ""
                  }`}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Staff Required (Morning)">
                <input
                  type="number"
                  name="staffMorning"
                  value={formData.staffMorning}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>
              <Field label="Staff Required (Evening)">
                <input
                  type="number"
                  name="staffEvening"
                  value={formData.staffEvening}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>
              <Field label="Staff Required (Night)">
                <input
                  type="number"
                  name="staffNight"
                  value={formData.staffNight}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>
            </div>

            <Field
              label="Operational Hours"
              hint='Example: "10 AM - 11 PM"'
              error={errors.operationalHours}
            >
              <input
                type="text"
                name="operationalHours"
                value={formData.operationalHours}
                onChange={handleChange}
                className={`w-full border rounded-lg px-3 py-2 ${
                  errors.operationalHours ? "border-red-500" : ""
                }`}
              />
            </Field>

            <Field label="Document Upload" error={errors.document}>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setFormData((prev) => ({ ...prev, document: file }));
                  if (errors.document) setErrors((prev) => ({ ...prev, document: "" }));
                }}
              />
            </Field>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="px-6 py-2 rounded-lg border border-gray-300 text-gray-900 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-black text-white px-6 py-2 rounded-lg disabled:opacity-50 hover:bg-gray-800"
              >
                {loading ? "Submitting..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900 mb-1">
        {label}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-1">{hint}</p>}
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

