export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const role = req.user?.role;

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
};

// Backwards-compatible helper if needed elsewhere
export const requireAdmin = requireRole(
  "WALLET_MANAGER",
  "ORDER_MANAGER",
  "RECIPE_MANAGER",
  "INGREDIENT_MANAGER"
);
