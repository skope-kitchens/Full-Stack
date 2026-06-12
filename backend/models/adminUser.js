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
    // Recipe Managers are scoped to a single kitchen branch (e.g. "JPNAGAR").
    // Operational data (projections, kitchen inventory, fridge stock) for that
    // branch is visible only to its branch's Recipe Manager. Recipes themselves
    // remain global and are not filtered by this field.
    branchCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      index: true,
    },
    // Ingredient Managers are scoped to a single warehouse (e.g. "WAREHOUSE_JPNAGAR").
    // One warehouse can serve multiple kitchen branches.
    warehouseId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      index: true,
    },
    // The kitchen branches this warehouse supplies (a warehouse can serve
    // multiple kitchens, e.g. JP Nagar warehouse supplies Marathahalli and
    // Kalyan Nagar too). Used by Ingredient Managers.
    branchCodes: {
      type: [String],
      default: [],
      set: (codes) => (Array.isArray(codes) ? codes.map((c) => String(c).trim().toUpperCase()) : codes),
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
