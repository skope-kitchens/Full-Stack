import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Layout from "../components/Layout"
import { authUtils } from "../utils/auth"
import api from "../utils/api"

const SignUp = () => {
  const navigate = useNavigate()

  // client | vendor | consumer (locked until selected)
  const [mode, setMode] = useState("")

  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

  const [phoneNumber, setPhoneNumber] = useState("")

  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    email: "",
    password: "",
    confirmPassword: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    fssai: "",
    pan: ""
  })

  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState({ type: "", message: "" })

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: "" })
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.name.trim()) newErrors.name = "Name is required"

    if (mode !== "consumer" && !formData.companyName.trim())
      newErrors.companyName =
        mode === "client" ? "Company name is required" : "Store name is required"

    if (!formData.email.trim()) newErrors.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      newErrors.email = "Enter valid email"

    if (!formData.password) newErrors.password = "Password is required"
    else if (formData.password.length < 6)
      newErrors.password = "Minimum 6 characters"

    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match"

    if (!termsAccepted) newErrors.termsAccepted = "Please accept Terms and Conditions"
    if (!phoneNumber.trim()) newErrors.phoneNumber = "Mobile number is required"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!mode || !validate()) return
    setLoading(true)

    try {
      const payload = {
        userType: mode,
        name: formData.name,
        email: formData.email,
        password: formData.password,
        address: {
          line1: formData.addressLine1,
          line2: formData.addressLine2,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode
        }
      }

      if (mode !== "consumer") payload.brandName = formData.companyName
      if (mode === "vendor") {
        payload.fssai = formData.fssai
        payload.pan = formData.pan
      }

      payload.phoneNumber = phoneNumber.trim()
      payload.termsAccepted = termsAccepted

      const { data } = await api.post("/api/auth/signup", payload)

      authUtils.setAuth(data.token, data.user)
      setStatus({ type: "success", message: "Account created successfully!" })
      setTimeout(() => navigate("/login"), 600)
    } catch (err) {
      setStatus({
        type: "error",
        message: err.response?.data?.message || "Signup failed"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <div className="max-w-4xl w-full">

          {/* HEADING */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Skope Kitchens</h1>
            <h2 className="text-xl font-semibold text-gray-800">
              {mode === "" && "Select User Type"}
              {mode === "client" && "Create Client Account"}
              {mode === "vendor" && "Create Vendor Account"}
              {mode === "consumer" && "Create Consumer Account"}
            </h2>
          </div>

          {/* USER TYPE SELECT */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Signup As</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">-- Select User Type --</option>
              <option value="client">Client</option>
              <option value="vendor">Vendor</option>
              <option value="consumer">Consumer</option>
            </select>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ x: 80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -80, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-cover bg-[url('/assets/Main-bg.png')] bg-center bg-no-repeat card p-6 rounded-2xl w-full shadow-lg"
            >
              {status.message && (
                <div
                  className={`px-4 py-3 rounded-lg text-sm mb-4 ${
                    status.type === "success"
                      ? "bg-green-50 border border-green-200 text-green-700"
                      : "bg-red-50 border border-red-200 text-red-700"
                  }`}
                >
                  {status.message}
                </div>
              )}

              <form onSubmit={handleSubmit} className="relative space-y-5">

                {/* LOCK OVERLAY */}
                {!mode && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                    <p className="text-lg font-semibold">
                      Please select a user type above
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* LEFT */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input name="name" value={formData.name} onChange={handleChange} className="input-field mb-3" />

                    {mode !== "consumer" && (
                      <>
                        <label className="block text-sm font-medium mb-1">
                          {mode === "client" ? "Company Name" : "Store Name"}
                        </label>
                        <input name="companyName" value={formData.companyName} onChange={handleChange} className="input-field mb-3" />
                      </>
                    )}

                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input name="email" value={formData.email} onChange={handleChange} className="input-field mb-3" />

                    <label className="block text-sm font-medium mb-1">Mobile Number</label>
                    <input
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value)
                      }}
                      className="input-field mb-3"
                      placeholder="Enter mobile number"
                    />
                    {errors.phoneNumber && (
                      <div className="text-sm text-red-700">{errors.phoneNumber}</div>
                    )}

                    <label className="block text-sm font-medium mb-1">Password</label>
                    <input type="password" name="password" value={formData.password} onChange={handleChange} className="input-field mb-3" />

                    <label className="block text-sm font-medium mb-1">Confirm Password</label>
                    <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} className="input-field" />
                  </div>

                  {/* RIGHT */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Address Line 1</label>
                    <input name="addressLine1" value={formData.addressLine1} onChange={handleChange} className="input-field mb-3" />

                    <label className="block text-sm font-medium mb-1">Address Line 2</label>
                    <input name="addressLine2" value={formData.addressLine2} onChange={handleChange} className="input-field mb-3" />

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">City</label>
                        <input name="city" value={formData.city} onChange={handleChange} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">State</label>
                        <input name="state" value={formData.state} onChange={handleChange} className="input-field" />
                      </div>
                    </div>

                    <label className="block text-sm font-medium mb-1">Pincode</label>
                    <input name="pincode" value={formData.pincode} onChange={handleChange} className="input-field mb-3" />

                    {mode === "vendor" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">FSSAI</label>
                          <input name="fssai" value={formData.fssai} onChange={handleChange} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">PAN</label>
                          <input name="pan" value={formData.pan} onChange={handleChange} className="input-field" />
                        </div>
                      </div>
                    )}
                  </div>

                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      I agree to{" "}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="text-black underline font-medium"
                      >
                        Terms and Conditions
                      </button>
                    </span>
                  </label>
                  {errors.termsAccepted && (
                    <div className="text-sm text-red-700">{errors.termsAccepted}</div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !mode || !termsAccepted}
                  className="w-full bg-black text-white py-3 rounded-lg disabled:opacity-40"
                >
                  {loading ? "Creating Account..." : "Create Account"}
                </button>

              </form>

              {showTermsModal && (
                <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                    <div className="p-6 border-b flex justify-between items-center">
                      <h3 className="text-xl font-bold">Terms and Conditions</h3>
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(false)}
                        className="text-gray-500 hover:text-black text-2xl"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="p-6 overflow-auto text-sm text-gray-800 space-y-3">
                      <div className="space-y-3">
                        <p><strong>SKOPE OS – TERMS AND CONDITIONS OF USE</strong></p>
                        <p><strong>(Client Acceptance Agreement)</strong></p>

                        <p>
                          By accessing, registering, or using Skope OS ("Platform"), you ("Client", "User") agree to be bound by the following Terms and Conditions. If you do not agree, you must not use the Platform.
                        </p>

                        <p><strong>1. About Skope OS</strong></p>
                        <p>
                          Skope OS is a proprietary software platform designed to manage, track, and optimize operational workflows for businesses.
                        </p>

                        <p><strong>2. User Access and Account Responsibility</strong></p>
                        <p>
                          You agree to provide accurate information, maintain confidentiality of login credentials, and accept responsibility for all account activity.
                        </p>

                        <p><strong>3. Permitted Use</strong></p>
                        <p>
                          You shall not copy, modify, distribute, reverse engineer, or misuse the platform or build competing products.
                        </p>

                        <p><strong>4. Confidentiality</strong></p>
                        <p>
                          You may access confidential information including software logic, workflows, and business information. You agree not to disclose or misuse it.
                        </p>

                        <p><strong>5. Intellectual Property</strong></p>
                        <p>
                          All rights remain with the Company. No ownership or license is transferred except limited usage.
                        </p>

                        <p><strong>6. Data Usage and Privacy</strong></p>
                        <p>
                          You retain ownership of your data and allow Skope OS to process it to provide services.
                        </p>

                        <p><strong>7. Service Availability</strong></p>
                        <p>
                          The platform is provided as-is. We do not guarantee uninterrupted service.
                        </p>

                        <p><strong>8. Termination of Access</strong></p>
                        <p>
                          Access may be suspended or terminated for violations or misuse.
                        </p>

                        <p><strong>9. Limitation of Liability</strong></p>
                        <p>
                          Skope OS is not liable for indirect damages. Liability is limited to fees paid.
                        </p>

                        <p><strong>10. Confidentiality Duration</strong></p>
                        <p>
                          Confidentiality obligations continue as long as you have access to the platform and its confidential information.
                        </p>

                        <p><strong>11. Governing Law</strong></p>
                        <p>
                          These terms are governed by the laws of India.
                        </p>

                        <p><strong>12. Updates to Terms</strong></p>
                        <p>
                          Continued use of the platform implies acceptance of updated terms.
                        </p>

                        <p><strong>13. Acceptance</strong></p>
                        <p>
                          By clicking 'I Agree', you accept these terms.
                        </p>
                      </div>
                    </div>
                    <div className="p-6 border-t flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(false)}
                        className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 text-center text-sm">
                Already have an account?{" "}
                <Link to="/login" className="text-black underline">
                  Login
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>

        </div>
      </div>
    </Layout>
  )
}

export { SignUp }

