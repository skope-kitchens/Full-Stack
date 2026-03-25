import VendorEligibility from "../models/vendorEligibility.js";
import { vendorMailer } from "../utils/vendorMailer.js";
const vendorEligibility = async (req, res) => {
  try {
    const user = req.user; // injected by authMiddleware
    // Vendor guard
    if (req.user.role !== "vendor") {
  return res.status(403).json({
    message: "Only vendors can submit vendor eligibility"
  });
}


    const payload = {
      ...req.body,
      vendorId: user._id,
      supplierName: user.supplierName,
      storeName: user.storeName,
      email: user.email
    };

    const submission = await VendorEligibility.create(payload);

    vendorMailer({
      vendorEmail: user.email,
      supplierName: user.supplierName,
      storeName: user.storeName,
      payload
    }).catch(console.error);

    return res.status(201).json({
      message: "Vendor eligibility submitted successfully",
      id: submission._id
    });
  } catch (error) {
    console.error("Vendor eligibility error:", error);
    return res.status(500).json({
      message: "Failed to submit vendor eligibility"
    });
  }
};

export default vendorEligibility;
