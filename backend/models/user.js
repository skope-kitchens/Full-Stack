import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    brandName: {
      type: String,
      default: null,
      index: true,
    },

    phoneNumber: { type: String, default: "", trim: true, index: true },
    phoneVerified: { type: Boolean, default: false },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: { type: String, required: true },

    // 🖼️ Brand logo (Cloudinary URL) — shown on the client dashboard home
    logoUrl: { type: String, default: "" },

    // 🏬 Kitchen branches this client is allowed to operate from.
    // Default for now; the POC dashboard will manage this later.
    assignedBranches: {
      type: [String],
      default: ["JPNAGAR", "TESTBRANCH"],
    },

    // 🔄 Stage-gated client lifecycle.
    // AWAITING_MENU → (menu submitted) → IN_TRIAL → (POC sets go-live) → LIVE
    lifecycleStage: {
      type: String,
      enum: ["AWAITING_MENU", "IN_TRIAL", "LIVE"],
      default: "AWAITING_MENU",
    },

    // 🏷️ Skope-internal operating flag, set ONLY by a POC. NEVER returned to the
    // client dashboard and never collected at signup. Default B2C (the flow being
    // built). See CLAUDE.md "Operating Model".
    clientType: {
      type: String,
      enum: ["B2C", "B2B"],
      default: "B2C",
    },

    // 📄 SOP document links recorded by the POC; the client views these read-only.
    // Links only — not structured step data.
    sopDocuments: [
      {
        title: { type: String, default: "", trim: true },
        link: { type: String, default: "", trim: true },
        updatedAt: { type: Date, default: Date.now },
      },
    ],

    // 🛒 Procurement responsibility per phase, set by the POC. Default both
    // SKOPE_PROCURES (B2C = Skope buys). On CLIENT_PROCURES the POC first sends
    // the generated ingredient list, then enters actual prices after the client
    // purchases. The ingredientList is a read-only snapshot taken from the
    // brand's trial/training recipe BOMs at "send" time.
    procurement: {
      trial: {
        mode: {
          type: String,
          enum: ["SKOPE_PROCURES", "CLIENT_PROCURES"],
          default: "SKOPE_PROCURES",
        },
        ingredientList: [
          {
            itemName: { type: String, default: "" },
            uom: { type: String, default: "" },
            qty: { type: Number, default: 0 },
            // Procurement (vendor) price the POC enters — separate from FCR/recipe pricing.
            unitPrice: { type: Number, default: null },
            totalPrice: { type: Number, default: null },
          },
        ],
        listSentAt: { type: Date, default: null },
        grandTotal: { type: Number, default: null },
        pricingStatus: { type: String, enum: ["AWAITING_PRICING", "PRICED"], default: "AWAITING_PRICING" },
      },
      training: {
        mode: {
          type: String,
          enum: ["SKOPE_PROCURES", "CLIENT_PROCURES"],
          default: "SKOPE_PROCURES",
        },
        ingredientList: [
          {
            itemName: { type: String, default: "" },
            uom: { type: String, default: "" },
            qty: { type: Number, default: 0 },
            unitPrice: { type: Number, default: null },
            totalPrice: { type: Number, default: null },
          },
        ],
        listSentAt: { type: Date, default: null },
        grandTotal: { type: Number, default: null },
        pricingStatus: { type: String, enum: ["AWAITING_PRICING", "PRICED"], default: "AWAITING_PRICING" },
      },
    },

    // 🧾 Non-production invoices created by the POC and paid from the wallet.
    // PRODUCTION invoices live on ProductionOrder and are merged in the view only.
    invoices: [
      {
        type: {
          type: String,
          enum: [
            "ONBOARDING",
            "PROCUREMENT",
            "SUBSCRIPTION",
            "PRODUCTION",
            "REIMBURSEMENT",
          ],
          required: true,
        },
        amount: { type: Number, required: true },
        status: { type: String, enum: ["UNPAID", "PAID"], default: "UNPAID" },
        branchCode: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },

        // ── Wallet → Razorpay-direct redesign (CLAUDE.md §24) ──────────────
        // Optional extra charge (POC-only invoice types). Procurement = 0.
        commission: { type: Number, default: 0 },
        notes: { type: String, default: "" },

        // Cloudinary-hosted supporting document (PDF/DOC/DOCX), if any.
        attachmentUrl: { type: String, default: null },
        attachmentName: { type: String, default: null },

        // Razorpay order is created at raise time so the client can pay; the
        // payment id + signature land on verify.
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null },
        paidAt: { type: Date, default: null },
        // RAZORPAY for every new payment. WALLET_LEGACY is for historical
        // records only and is NEVER written by any new code path.
        paidVia: { type: String, enum: ["RAZORPAY", "WALLET_LEGACY"], default: null },

        // Supplementary procurement invoice → its parent (same client).
        parentInvoiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        supplementaryReason: { type: String, default: "" },

        // Source indent (procurement invoices) — lets a GRN find which invoices
        // gate its client visibility.
        indentId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
    ],

    address: {
      line1: { type: String, required: true },
      line2: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true }
    },
    // 💳 Paid wallet
    wallet: {
      balance: { type: Number, default: 0 },
      dueAmount: {
        type: Number,
        default: 0
      },

      dueReason: {
        type: String,
        default: null
      },
      transactions: [
        {
          amount: Number,
          type: { type: String, enum: ["credit", "debit"], required: true },

          source: {
            type: String,
            enum: ["razorpay", "system", "admin","order"], // ✅ ADD admin
            required: true
          },

          reason: String,

          createdAt: {
            type: Date,
            default: Date.now
          }
        }
      ]

    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
