import mongoose from "mongoose";

const materialSchema = new mongoose.Schema(
  {
    product: String,
    purchaseSlab: String,
    price: String,
    priceLockPeriod: String
  },
  { _id: false }
);

const vendorEligibilitySchema = new mongoose.Schema(
  {
    // Meta
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    supplierName: String,
    storeName: String,
    email: String,

    // Company Details
    companyName: String,
    yearEstablished: String,
    address: String,
    postcode: String,
    phone: String,
    gstNumber: String,
    lastYearTurnover: String,

    // Bank Details
    bankName: String,
    accountName: String,
    bankAddress: String,
    accountNumber: String,
    ifsc: String,
    swiftCode: String,
    currency: {
      type: String,
      default: "INR"
    },

    // Goods & Services
    materials: [materialSchema],

    // Experience
    majorClients: String,
    legalDisputes: String,

    // Commercial
    paymentTerms: String,
    returnPolicy: String,

    // Workflow
    status: {
      type: String,
      enum: ["submitted", "under_review", "approved", "rejected"],
      default: "submitted"
    }
  },
  { timestamps: true }
);

export default mongoose.model("VendorEligibility", vendorEligibilitySchema);
