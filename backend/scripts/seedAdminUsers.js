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

const adminsToSeed = [
  {
    email: process.env.ADMIN_WALLET_USERNAME,
    password: process.env.ADMIN_WALLET_PASSWORD,
    role: "WALLET_MANAGER",
    name: "Wallet Manager",
  },
  {
    email: process.env.ADMIN_RECIPE_USERNAME,
    password: process.env.ADMIN_RECIPE_PASSWORD,
    role: "RECIPE_MANAGER",
    name: "Recipe Manager",
  },
  {
    email: process.env.ADMIN_INGREDIENT_USERNAME,
    password: process.env.ADMIN_INGREDIENT_PASSWORD,
    role: "INGREDIENT_MANAGER",
    name: "Ingredient Manager",
  },
];

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
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[Seed] ✓ ${admin.role} → ${normalizedEmail} (id: ${result._id})`);
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
