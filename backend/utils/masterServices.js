/**
 * masterServices.js — the canonical 15-item onboarding service checklist.
 *
 * Single source of truth shared by:
 *   - admin.brand.routes.js  (legacy WALLET_MANAGER service endpoints)
 *   - poc.controller.js      (POC dashboard onboarding writer)
 *
 * Kept here so the list never drifts between the two callers.
 */
export const MASTER_SERVICES = [
  "Vendor sourcing & negotiation",
  "In-store branding (circle banner)",
  "Kitchen operations setup & workflow planning",
  "Waste & yield management system",
  "Menu engineering",
  "SOP creation",
  "Food tasting and trials",
  "Recipe development",
  "Pricing strategy and discounting",
  "Inventory - Process and storage",
  "Market research and competitor study",
  "Shelf life testing & documentation",
  "Food cost ratio - preparation",
  "Order flow integration - KDS, POS",
  "Branding - naming, positioning",
];
