/**
 * BRAND SEED SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Seeds the brands collection with the known Skope Kitchens brand roster.
 *   Sets inventoryManaged and procurementModel correctly per category.
 *
 *   Category A — Kitchen-only. Brand procures own inventory. inventoryManaged: false.
 *   Category B — Kitchen + Skope procurement support. inventoryManaged: true, SKOPE/HYBRID.
 *   Category C — Skope own brands. inventoryManaged: true, SKOPE.
 *
 * SAFETY:
 *   Idempotent — uses upsert by brandName. Running twice produces the same result.
 *   Does NOT delete any existing brand records.
 *
 * RUN:
 *   node backend/scripts/seedBrands.js
 *
 * IMPORTANT: Do NOT seed ItemMaster records until the KitchenInventory vs
 *   brand_stocks deduction conflict is resolved. Seeding ItemMaster activates
 *   the legacy KitchenInventory deduction path in wallet/pay, causing the two
 *   inventory ledgers to diverge silently.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import Brand from "../models/brand.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("[Seed] MONGO_URI not set. Aborting.");
  process.exit(1);
}

const BRANDS = [
  // ── Category C — Skope own brands ─────────────────────────────────────────
  {
    brandName: "Al Mashawi Shawarma",
    status: "Active",
    inventoryManaged: true,
    procurementModel: "SKOPE",
    chefName: "Dev",
  },
  {
    brandName: "Kochi Kurry Klub",
    status: "Active",
    inventoryManaged: true,
    procurementModel: "SKOPE",
    chefName: "Rajan",
  },

  // ── Category B — Kitchen + procurement support ─────────────────────────────
  {
    brandName: "Malabar Flavors",
    status: "Active",
    inventoryManaged: true,
    procurementModel: "HYBRID",
    chefName: "",
  },

  // ── Category A — Kitchen only, self-procure ────────────────────────────────
  {
    brandName: "Plantoria Foods",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "",
  },
  {
    brandName: "Kritunga",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "",
  },
  {
    brandName: "Bao Bangalore",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "",
  },
  {
    brandName: "CarpeDiem",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "",
  },
  {
    brandName: "Unmenu Foods",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "",
  },
  {
    brandName: "Doughpamine Kitchen",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "Kaif",
  },
  {
    brandName: "WrapOClock",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "",
  },
  {
    brandName: "Gredo Foods",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "Laltu",
  },
  {
    brandName: "Pet Fresh Kitchen",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "Somu",
  },
  {
    brandName: "Good Fud",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "",
  },
  {
    brandName: "Eleven Madhouse",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "",
  },
  {
    brandName: "Chicbun",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "Dev",
  },
  {
    brandName: "Punjabi House",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "Manjur",
  },
  {
    brandName: "Swanky Spoon Society",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "Laltu",
  },
  {
    brandName: "Skope Cafe",
    status: "Active",
    inventoryManaged: false,
    procurementModel: "SELF",
    chefName: "Yash",
  },
];

async function seed() {
  await mongoose.connect(MONGO_URI, { family: 4 });
  console.log("[Seed] Connected to MongoDB.\n");

  let created = 0;
  let updated = 0;

  for (const brand of BRANDS) {
    const result = await Brand.findOneAndUpdate(
      { brandName: brand.brandName },
      { $set: brand },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const wasNew = result.createdAt?.getTime() === result.updatedAt?.getTime();
    if (wasNew) {
      console.log(`[Seed] ✓ Created: ${brand.brandName} (${brand.procurementModel}, managed=${brand.inventoryManaged})`);
      created++;
    } else {
      console.log(`[Seed] ↺ Updated: ${brand.brandName}`);
      updated++;
    }
  }

  console.log(`\n[Seed] Done. Created: ${created}, Updated: ${updated}`);
  console.log("\nNext steps:");
  console.log("  1. Run: node backend/scripts/seedAdminUsers.js");
  console.log("  2. Run: node backend/scripts/migrateInventoryLedger.js");
  console.log("  3. Do NOT seed ItemMaster until KitchenInventory conflict is resolved.");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("[Seed] Fatal error:", err);
  process.exit(1);
});
