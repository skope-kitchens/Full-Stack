import mongoose from "mongoose";

/**
 * AdminUser — database-backed admin identity for the Skope ERP.
 *
 * Why this exists:
 *   The previous env-var admin system had no database record, no _id, and no
 *   audit capability. Every ERP workflow that needs to attribute an action to a
 *   specific admin (inventory mutations, indent approvals, reconciliations) requires
 *   a real identity with a persistent _id. This model provides that.
 *
 * Roles map directly to the role strings already enforced by requireRole middleware.
 * No change to middleware is required — role strings are identical.
 */
const adminUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["WALLET_MANAGER", "RECIPE_MANAGER", "INGREDIENT_MANAGER"],
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("AdminUser", adminUserSchema, "admin_users");
