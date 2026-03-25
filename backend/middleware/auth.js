import jwt from "jsonwebtoken";
import Vendor from "../models/vendor.js";
import User from "../models/user.js";

const ADMIN_ROLES = new Set([
  "WALLET_MANAGER",
  "RECIPE_MANAGER",
  "INGREDIENT_MANAGER"
]);

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔐 ADMIN (ROLE-BASED, NO DB LOOKUP)
    if (decoded.role && ADMIN_ROLES.has(decoded.role)) {
      req.user = { role: decoded.role };
      return next();
    }

    let user;

    // decoded = { vendorId | userId | consumerId, role, iat, exp }
    if (decoded.role === "vendor") {
      user = await Vendor.findById(decoded.vendorId).lean();
    } else {
      user = await User.findById(decoded.userId || decoded.id).lean();
    }

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    req.user.role = decoded.role;

    next();
  } catch (err) {
    console.error("AUTH ERROR:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
