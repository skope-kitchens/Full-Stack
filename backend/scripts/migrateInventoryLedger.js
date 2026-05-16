/**
 * INVENTORY LEDGER MIGRATION SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Backfills new inventory ledger fields (location, ownedBy, branchCode,
 *   inventoryManaged, lowStockThreshold, qtyReserved) onto existing brand_stocks
 *   documents that were created before the Phase 1 schema extension.
 *
 * SAFETY RULES:
 *   1. DO NOT run this script automatically on server start.
 *   2. Run manually, once, in a low-traffic window.
 *   3. Run against staging first. Verify counts. Then run against production.
 *   4. The script is idempotent — running it twice produces the same result.
 *   5. The compound unique index migration is a SEPARATE step (see bottom of file).
 *      Do NOT attempt the index migration as part of this script.
 *
 * RUN:
 *   node backend/scripts/migrateInventoryLedger.js
 *
 * PREREQUISITES:
 *   - MONGO_URI is set in environment (or .env file is loaded)
 *   - New schema fields are already deployed to production (brandStock.js update)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set. Aborting.");
  process.exit(1);
}

// Brands with active ERP-managed inventory (Category B + C).
// All others default to inventoryManaged: false.
const INVENTORY_MANAGED_BRANDS = new Set([
  "Al Mashawi Shawarma",
  "Al Mashawi",          // normalized variants
  "Kochi Kurry Klub",
  "KKK",
  "Malabar Flavors",
  "Malabar",
]);

const PROCUREMENT_MODEL_MAP = {
  "Al Mashawi Shawarma": "SKOPE",
  "Al Mashawi": "SKOPE",
  "Kochi Kurry Klub": "SKOPE",
  "KKK": "SKOPE",
  "Malabar Flavors": "HYBRID",
  "Malabar": "HYBRID",
};

async function run() {
  await mongoose.connect(MONGO_URI, { family: 4 });
  console.log("[Migration] Connected to MongoDB.");

  const db = mongoose.connection.db;
  const collection = db.collection("brand_stocks");

  // ── STEP 1: Audit — count documents missing the new fields ──────────────────
  const totalDocs = await collection.countDocuments({});
  const alreadyMigrated = await collection.countDocuments({ location: { $exists: true } });
  const needsMigration = totalDocs - alreadyMigrated;

  console.log(`[Migration] Total brand_stocks documents: ${totalDocs}`);
  console.log(`[Migration] Already have 'location' field: ${alreadyMigrated}`);
  console.log(`[Migration] Need migration: ${needsMigration}`);

  if (needsMigration === 0) {
    console.log("[Migration] All documents already migrated. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // ── STEP 2: Backfill documents missing the new fields ──────────────────────
  // Only updates documents where location field does not exist (idempotent).
  const cursor = collection.find({ location: { $exists: false } });
  let processed = 0;
  let errors = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const brandName = String(doc.brandName || "").trim();
    const inventoryManaged = INVENTORY_MANAGED_BRANDS.has(brandName);

    try {
      await collection.updateOne(
        { _id: doc._id, location: { $exists: false } }, // idempotency guard
        {
          $set: {
            location: "BRANCH_KITCHEN",
            ownedBy: brandName || null,
            branchCode: "JP_NAGAR",
            inventoryManaged,
            lowStockThreshold: 0,
            qtyReserved: 0,
          },
        }
      );
      processed++;
      if (processed % 50 === 0) {
        console.log(`[Migration] Processed ${processed} documents...`);
      }
    } catch (err) {
      console.error(`[Migration] Failed to update document ${doc._id}:`, err.message);
      errors++;
    }
  }

  console.log(`[Migration] Done. Processed: ${processed}, Errors: ${errors}`);

  // ── STEP 3: Set Brand.inventoryManaged and procurementModel ─────────────────
  // This updates the Brand collection (not brand_stocks) to reflect ERP classification.
  const brandsCollection = db.collection("brands");
  const totalBrands = await brandsCollection.countDocuments({});
  console.log(`\n[Migration] Updating Brand collection (${totalBrands} brands)...`);

  for (const [brandName, procurementModel] of Object.entries(PROCUREMENT_MODEL_MAP)) {
    const result = await brandsCollection.updateMany(
      { brandName: { $regex: new RegExp(`^${brandName}$`, "i") } },
      {
        $set: {
          inventoryManaged: true,
          procurementModel,
        },
      }
    );
    if (result.matchedCount > 0) {
      console.log(`[Migration] Brand "${brandName}": inventoryManaged=true, procurementModel=${procurementModel} (matched: ${result.matchedCount})`);
    }
  }

  // All other brands default to inventoryManaged: false, procurementModel: SELF
  const setDefaultResult = await brandsCollection.updateMany(
    { inventoryManaged: { $exists: false } },
    { $set: { inventoryManaged: false, procurementModel: "SELF" } }
  );
  console.log(`[Migration] Set ${setDefaultResult.modifiedCount} brands to inventoryManaged=false, procurementModel=SELF`);

  console.log("\n[Migration] COMPLETE.");

  // ── STEP 4 (MANUAL — DO NOT RUN HERE): Compound index migration ─────────────
  //
  // After verifying this script in production, the compound unique index must be
  // updated from { brandName, itemName, ingredientBrand } to
  // { location, ownedBy, itemName, ingredientBrand, branchCode }.
  //
  // This requires a SEPARATE migration window because:
  //   1. The new index must be built first (background, takes minutes)
  //   2. Verify no duplicate key violations before the new index finalizes
  //   3. Only then drop the old index
  //
  // Commands (run manually via MongoDB Atlas UI or mongosh):
  //
  //   // 1. Build new compound index (background — non-blocking):
  //   db.brand_stocks.createIndex(
  //     { location: 1, ownedBy: 1, itemName: 1, ingredientBrand: 1, branchCode: 1 },
  //     { unique: true, background: true, name: "ledger_compound_idx" }
  //   )
  //
  //   // 2. Verify the index built successfully and has no duplicate key errors.
  //   db.brand_stocks.getIndexes()
  //
  //   // 3. Drop old index:
  //   db.brand_stocks.dropIndex("brandName_1_itemName_1_ingredientBrand_1")
  //
  // DO NOT drop the old index until the new one is confirmed active.
  // ────────────────────────────────────────────────────────────────────────────

  await mongoose.disconnect();
  console.log("[Migration] Disconnected.");
}

run().catch((err) => {
  console.error("[Migration] Fatal error:", err);
  process.exit(1);
});
