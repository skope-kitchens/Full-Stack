import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema(
  {
    supplierName: { 
      type: String, 
      required: true, 
      trim: true 
    },

    storeName: { 
      type: String, 
      required: true, 
      trim: true 
    },

    email: { 
      type: String, 
      required: true, 
      unique: true, 
      lowercase: true, 
      trim: true 
    },

    password: { 
      type: String, 
      required: true 
    },

    address: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
    },

    // FSSAI number (14 digits)
    fssai: { 
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: v => /^[0-9]{14}$/.test(v),
        message: "FSSAI must be a 14-digit number"
      }
    },

    // PAN number (ABCDE1234F)
    pan: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      validate: {
        validator: (v) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v),
        message: "Invalid PAN format",
      },
    },

    phoneNumber: { type: String, default: "", trim: true, index: true },
    phoneVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Vendor", vendorSchema);
