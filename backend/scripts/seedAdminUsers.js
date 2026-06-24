/**
 * ADMIN USER SEEDING SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Migrates admin credentials from environment variables to the AdminUser
 *   MongoDB collection with bcrypt-hashed passwords.
 *
 * SAFETY:
 *   - Idempotent: running twice produces the same result (upsert by email).
 *   - Does NOT delete existing admins.
 *   - Does NOT affect client, vendor, or consumer accounts.
 *
 * RUN (once, after deploying the AdminUser model):
 *   node backend/scripts/seedAdminUsers.js
 *
 * AFTER VERIFYING SUCCESSFUL LOGIN VIA DB:
 *   The env-var fallback in auth.controller.js can be removed in a follow-up
 *   deploy. Until then, both paths work — no service interruption.
 *
 * PREREQUISITES:
 *   - MONGO_URI set in environment or .env file
 *   - ADMIN_*_USERNAME and ADMIN_*_PASSWORD set in .env
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import AdminUser from "../models/adminUser.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("[Seed] MONGO_URI not set. Aborting.");
  process.exit(1);
}

/**
 * Each entry creates (or updates) one admin login.
 *
 * Recipe Managers and Ingredient Managers are read from numbered env var
 * blocks (ADMIN_RECIPE_1_*, ADMIN_RECIPE_2_*, ADMIN_INGREDIENT_1_*, ...).
 * To add a new kitchen's Recipe Manager or a new warehouse's Ingredient
 * Manager, copy the relevant block in .env, increment the number, fill in
 * that admin's email/password/branchCode (or warehouseId), and re-run this
 * script. Numbering must be contiguous starting at 1 — the loop stops at
 * the first missing number.
 */
const adminsToSeed = [
  {
    email: process.env.ADMIN_WALLET_USERNAME,
    password: process.env.ADMIN_WALLET_PASSWORD,
    role: "WALLET_MANAGER",
    name: "Wallet Manager",
  },
  // Single shared POC login. Both POCs sign in with this one account and
  // manage every client from the one POC dashboard (no per-POC client subsets).
  {
    email: process.env.ADMIN_POC_USERNAME,
    password: process.env.ADMIN_POC_PASSWORD,
    role: "POC",
    name: "POC",
  },
];

for (let i = 1; process.env[`ADMIN_RECIPE_${i}_USERNAME`]; i++) {
  adminsToSeed.push({
    email: process.env[`ADMIN_RECIPE_${i}_USERNAME`],
    password: process.env[`ADMIN_RECIPE_${i}_PASSWORD`],
    role: "RECIPE_MANAGER",
    name: `Recipe Manager ${i}`,
    branchCode: process.env[`ADMIN_RECIPE_${i}_BRANCH_CODE`] || null,
    // The warehouse that supplies this kitchen (for indents/dispatches).
    warehouseId: process.env[`ADMIN_RECIPE_${i}_WAREHOUSE_ID`] || null,
  });
}

for (let i = 1; process.env[`ADMIN_INGREDIENT_${i}_USERNAME`]; i++) {
  const branchCodesRaw = process.env[`ADMIN_INGREDIENT_${i}_BRANCH_CODES`] || "";
  adminsToSeed.push({
    email: process.env[`ADMIN_INGREDIENT_${i}_USERNAME`],
    password: process.env[`ADMIN_INGREDIENT_${i}_PASSWORD`],
    role: "INGREDIENT_MANAGER",
    name: `Ingredient Manager ${i}`,
    warehouseId: process.env[`ADMIN_INGREDIENT_${i}_WAREHOUSE_ID`] || null,
    // The kitchens this warehouse supplies, comma-separated (e.g. "JPNAGAR,MARATHAHALLI,KALYANNAGAR").
    branchCodes: branchCodesRaw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
  });
}

// Local Kitchen operators — ONE login per kitchen (Marathahalli, Kalyan Nagar,
// and JP Nagar's own assembly op). Each is scoped to a single branchCode, which
// scopes every Local Kitchen view to that kitchen's data. Numbered blocks like
// the Recipe/Ingredient managers above — add ADMIN_LOCALKITCHEN_<n>_* to .env,
// increment contiguously from 1, and re-run this script.
for (let i = 1; process.env[`ADMIN_LOCALKITCHEN_${i}_USERNAME`]; i++) {
  adminsToSeed.push({
    email: process.env[`ADMIN_LOCALKITCHEN_${i}_USERNAME`],
    password: process.env[`ADMIN_LOCALKITCHEN_${i}_PASSWORD`],
    role: "LOCAL_KITCHEN",
    name: `Local Kitchen ${i}`,
    branchCode: process.env[`ADMIN_LOCALKITCHEN_${i}_BRANCH_CODE`] || null,
  });
}

async function seed() {
  await mongoose.connect(MONGO_URI, { family: 4 });
  console.log("[Seed] Connected to MongoDB.\n");

  for (const admin of adminsToSeed) {
    if (!admin.email || !admin.password) {
      console.warn(`[Seed] Skipping ${admin.role} — email or password missing in .env`);
      continue;
    }

    const normalizedEmail = admin.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(admin.password, 12);

    const result = await AdminUser.findOneAndUpdate(
      { email: normalizedEmail },
      {
        email: normalizedEmail,
        passwordHash,
        role: admin.role,
        name: admin.name,
        isActive: true,
        branchCode: admin.branchCode || null,
        warehouseId: admin.warehouseId || null,
        branchCodes: admin.branchCodes || [],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const scopeParts = [];
    if (admin.branchCode) scopeParts.push(`branch=${admin.branchCode}`);
    if (admin.warehouseId) scopeParts.push(`warehouse=${admin.warehouseId}`);
    if (admin.branchCodes?.length) scopeParts.push(`supplies=[${admin.branchCodes.join(",")}]`);
    const scope = scopeParts.length ? scopeParts.join(", ") : "global";
    console.log(`[Seed] ✓ ${admin.role} → ${normalizedEmail} (id: ${result._id}, ${scope})`);
  }

  console.log("\n[Seed] Complete.");
  console.log("\nNext step:");
  console.log("  1. Test admin login via POST /api/auth/login with each credential.");
  console.log("  2. Verify JWT payload contains adminId (decode at jwt.io).");
  console.log("  3. Once confirmed, the env-var fallback in auth.controller.js can be removed.");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("[Seed] Fatal error:", err);
  process.exit(1);
});
