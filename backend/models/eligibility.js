import mongoose from 'mongoose'

const eligibilitySchema = new mongoose.Schema(
  {
    // Meta
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedByEmail: { type: String, default: null },

    // Mapping (simplified v2)
    brandName: { type: String, required: true },
    menuList: { type: [String], default: [] },
    equipmentsList: { type: [String], default: [] },
    smallwareList: { type: [String], default: [] },
    averageOrderValue: { type: Number, default: 0 },
    ordersPerDay: { type: Number, default: 0 },
    staffRequired: { type: mongoose.Schema.Types.Mixed, default: null }, // shift-wise breakdown
    operationalHours: { type: String, default: "" },

    // Legacy fields (kept for backward compatibility; no longer required)
    locationMapping: { type: String, default: "" },
    brandStrength: { type: String, default: "" },
    socialMediaEngagement: { type: String, default: "" },
    ristaOutletId: { type: String, default: null },

    swiggyRating: { type: Number, default: null },
    zomatoRating: { type: Number, default: null },
    dspRatings: { type: String, default: null },

    // Operating (legacy)
    bmDeliverySales: { type: String, default: "" },
    deliveryAOV: { type: Number, default: 0 },
    cogsAnalysis: { type: String, default: "" },

    dspRateType: { type: String, default: "" },
    dspRatePercent: { type: String, default: null },

    wastageRisk: { type: String, default: "" },

    numberOfMenuItems: { type: Number, default: 0 },
    packagingType: { type: String, default: "" },

    menuSupplyChainComplexity: { type: [String], default: [] },

    launchCapex: { type: String, default: "" },
    launchCapexPieces: { type: String, default: null },

    smallwaresNeeded: { type: String, default: null },
    smallwaresCost: { type: String, default: "" },

    // Expansion
    activationOpportunities: { type: [String], default: [] },
    domesticOpportunities: { type: [String], default: [] },
    dspMarketingCommitment: { type: String, default: "" },

    // Special Conditions
    retrofittingNeeded: { type: String, default: "" },
    additionalSpaceRequired: { type: String, default: "" },
    procurementSuppliers: { type: String, default: "" },
    multipleDeliveries: { type: String, default: "" },
    additionalTrainingTravel: { type: String, default: "" },
    launchTravelCosts: { type: String, default: "" },
    specialReportingIntegrations: { type: String, default: "" },
    equipmentAvailability: { type: String, default: "" },
    howDidYouHear: { type: String, default: "" },

    // ✅ NEW — Cloudinary Excel uploads
    attachments: [
      {
        type: String, // secure_url
      },
    ],

    // Scoring + AI
    totalScore: { type: Number },
    meetsThreshold: { type: Boolean },
    decision: { type: String },

    sectionScores: {
      mapping: { raw: Number, normalized: Number },
      operating: { raw: Number, normalized: Number },
      expansion: { raw: Number, normalized: Number },
      special_conditions: { raw: Number, normalized: Number },
    },

    aiAnalysisSummary: { type: String },
  },
  { timestamps: true }
)

export default mongoose.model('EligibilitySubmission', eligibilitySchema)
