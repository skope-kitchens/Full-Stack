/**
 * TEST CLIENT SEED SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Creates one test client account in the `users` collection so that client
 *   login can be verified after auth system changes.
 *
 * SAFETY:
 *   - Idempotent: running twice produces the same result (upsert by email).
 *   - Does NOT touch admin_users, vendors, or any other collection.
 *   - Does NOT affect any existing user accounts.
 *
 * CREDENTIALS (use these for Postman login test):
 *   Email:    testclient@skopekitchens.com
 *   Password: TestClient@123
 *
 * RUN:
 *   node backend/scripts/seedTestClient.js
 *
 * AFTER VERIFICATION:
 *   This account can remain in the DB — it has zero wallet balance and no
 *   brand association, so it cannot cause any operational side effects.
 *   Delete it from MongoDB Atlas if you want a clean slate.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("[Seed] MONGO_URI not set. Aborting.");
  process.exit(1);
}

const TEST_CLIENT = {
  email: "testclient@skopekitchens.com",
  plainPassword: "TestClient@123",
  name: "Test Client",
  brandName: "Test Brand",
  phoneNumber: "9000000000",
  address: {
    line1: "123 Test Lane",
    line2: "",
    city: "Bangalore",
    state: "Karnataka",
    pincode: "560001",
  },
};

async function seed() {
  await mongoose.connect(MONGO_URI, { family: 4 });
  console.log("[Seed] Connected to MongoDB.\n");

  const normalizedEmail = TEST_CLIENT.email.toLowerCase().trim();

  // Cost factor 10 — matches what the signup endpoint uses.
  const passwordHash = await bcrypt.hash(TEST_CLIENT.plainPassword, 10);

  const result = await User.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $setOnInsert: {
        name: TEST_CLIENT.name,
        brandName: TEST_CLIENT.brandName,
        email: normalizedEmail,
        password: passwordHash,
        phoneNumber: TEST_CLIENT.phoneNumber,
        phoneVerified: true,
        address: TEST_CLIENT.address,
        wallet: { balance: 0, transactions: [] },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (result.createdAt?.getTime() === result.updatedAt?.getTime()) {
    console.log(`[Seed] ✓ Created test client → ${normalizedEmail}`);
  } else {
    console.log(`[Seed] ✓ Test client already exists → ${normalizedEmail} (no changes made)`);
  }

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log("Login credentials for Postman:");
  console.log(`  Email:    ${TEST_CLIENT.email}`);
  console.log(`  Password: ${TEST_CLIENT.plainPassword}`);
  console.log("─────────────────────────────────────────────────────────────");
  console.log("\nNext step:");
  console.log("  POST /api/auth/login with { email, password }");
  console.log('  Verify response contains: userType: "client", token, user object');
  console.log("  Verify JWT payload at jwt.io contains: userId, role: \"client\"");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("[Seed] Fatal error:", err);
  process.exit(1);
});
