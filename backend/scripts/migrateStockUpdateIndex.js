/**
 * STOCK_UPDATES INDEX MIGRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   The Stock Manager's Closing-Stock Audit appends post-lock corrections as NEW
 *   dated records (stacked history). The legacy unique index { brandId, date }
 *   would block a second record for the same brand+day, so it must be dropped and
 *   replaced by { brandId, date, correctionSeq } (defined on the StockUpdate model).
 *
 * SAFETY:
 *   - Idempotent: re-running after the old index is gone is a no-op.
 *   - Touches ONLY indexes, never documents.
 *   - Existing records keep correctionSeq = 0 (schema default), so the new unique
 *     index is satisfied without any data backfill.
 *
 * RUN (once, after deploying the updated StockUpdate model):
 *   node backend/scripts/migrateStockUpdateIndex.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("[Migration] MONGO_URI not set. Aborting.");
  process.exit(1);
}

// The legacy unique index Mongoose generated for { brandId: 1, date: 1 }.
const LEGACY_INDEX = "brandId_1_date_1";
const NEW_INDEX = "brandId_1_date_1_correctionSeq_1";

async function migrate() {
  await mongoose.connect(MONGO_URI, { family: 4 });
  console.log("[Migration] Connected to MongoDB.");

  const collection = mongoose.connection.db.collection("stock_updates");
  const indexes = await collection.indexes();
  const names = indexes.map((i) => i.name);
  console.log("[Migration] Current indexes:", names.join(", "));

  if (names.includes(LEGACY_INDEX)) {
    await collection.dropIndex(LEGACY_INDEX);
    console.log(`[Migration] ✓ Dropped legacy unique index "${LEGACY_INDEX}".`);
  } else {
    console.log(`[Migration] Legacy index "${LEGACY_INDEX}" already absent — nothing to drop.`);
  }

  // Create the new compound unique index if Mongoose hasn't already.
  if (!names.includes(NEW_INDEX)) {
    await collection.createIndex(
      { brandId: 1, date: 1, correctionSeq: 1 },
      { unique: true, name: NEW_INDEX }
    );
    console.log(`[Migration] ✓ Created new unique index "${NEW_INDEX}".`);
  } else {
    console.log(`[Migration] New index "${NEW_INDEX}" already present.`);
  }

  await mongoose.disconnect();
  console.log("[Migration] Complete. Disconnected.");
}

migrate().catch((err) => {
  console.error("[Migration] Fatal error:", err);
  process.exit(1);
});
