import User from "../models/user.js";
import Vendor from "../models/vendor.js";
import Consumer from "../models/consumer.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fetch from "node-fetch";
import PhoneOtp from "../models/phoneOtp.js";
import PasswordResetToken from "../models/passwordResetToken.js";

const ADMIN_ROLES = {
  WALLET_MANAGER: "WALLET_MANAGER",
  RECIPE_MANAGER: "RECIPE_MANAGER",
  INGREDIENT_MANAGER: "INGREDIENT_MANAGER"
};

const createToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET || "development-secret", {
    expiresIn: "7d"
  });
};

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  brandName: user.brandName,
  email: user.email,
  address: user.address
});

/* ---------------- SIGNUP ---------------- */
export const signup = async (req, res) => {
  try {
    const {
      userType,
      name,
      brandName,
      email,
      password,
      phoneNumber,
      termsAccepted,
      address,
      fssai,
      pan
    } = req.body;

    if (termsAccepted !== true) {
      return res.status(400).json({ message: "You must accept Terms and Conditions" });
    }

    const normalizedPhone = String(phoneNumber || "").trim();
    if (!normalizedPhone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const normalizedEmail = email.toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    /* ---------- CLIENT ---------- */
    if (userType === "client") {
      const exists = await User.findOne({ email: normalizedEmail });
      if (exists) return res.status(409).json({ message: "Email already exists" });

      const sameBrandUser = await User.findOne({ brandName });
      const signupCredits = sameBrandUser ? 0 : 3000;

      const user = await User.create({
        name,
        brandName,
        email: normalizedEmail,
        password: hashedPassword,
        address,
        phoneNumber: normalizedPhone,
        phoneVerified: true,
        credits: signupCredits,
        wallet: { balance: 0, transactions: [] }
      });


      const token = createToken({ userId: user._id, role: "client" });

      return res.status(201).json({
        message: "Client account created",
        role: "client",
        credits: user.credits,
        token
      });
    }

    /* ---------- VENDOR ---------- */
    if (userType === "vendor") {
      const exists = await Vendor.findOne({ email: normalizedEmail });
      if (exists) return res.status(409).json({ message: "Vendor already exists" });

      const vendor = await Vendor.create({
        supplierName: name,
        storeName: brandName,
        email: normalizedEmail,
        password: hashedPassword,
        address,
        fssai,
        pan,
        phoneNumber: normalizedPhone,
        phoneVerified: true
      });

      const token = createToken({ vendorId: vendor._id, role: "vendor" });

      return res.status(201).json({
        message: "Vendor account created",
        role: "vendor",
        token
      });
    }

    /* ---------- CONSUMER ---------- */
    if (userType === "consumer") {
      const exists = await Consumer.findOne({ email: normalizedEmail });
      if (exists) return res.status(409).json({ message: "Email already exists" });

      const consumer = await Consumer.create({
        name,
        phoneNumber: normalizedPhone,
        phoneVerified: true,
        email: normalizedEmail,
        password: hashedPassword,
        address
      });

      const token = createToken({ consumerId: consumer._id, role: "consumer" });

      return res.status(201).json({
        message: "Consumer account created",
        role: "consumer",
        token
      });
    }

    return res.status(400).json({ message: "Invalid user type" });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "Signup failed" });
  }
};

/* ---------------- PHONE OTP SEND ---------------- */
export const sendPhoneOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body || {};
    const normalizedPhone = String(phoneNumber || "").trim();

    if (!normalizedPhone) {
      return res.status(400).json({ message: "phoneNumber is required" });
    }

    // Generate 6-digit OTP
    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const record = await PhoneOtp.create({
      phoneNumber: normalizedPhone,
      otpHash,
      expiresAt,
      verifiedAt: null,
      usedAt: null,
    });

    // In absence of SMS provider, we log OTP for dev/testing.
    console.log(`[OTP] phoneNumber=${normalizedPhone} otp=${otp}`);

    return res.json({
      success: true,
      otpChallengeId: record._id,
      // Dev-only convenience so you can test without SMS integration.
      otp: process.env.OTP_RETURN_DEBUG === "true" ? otp : undefined,
    });
  } catch (err) {
    console.error("sendPhoneOtp error:", err?.message || err);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
};

/* ---------------- PHONE OTP VERIFY ---------------- */
export const verifyPhoneOtp = async (req, res) => {
  try {
    const { phoneNumber, otpChallengeId, otp } = req.body || {};
    const normalizedPhone = String(phoneNumber || "").trim();

    if (!normalizedPhone || !otpChallengeId || !otp) {
      return res
        .status(400)
        .json({ message: "phoneNumber, otpChallengeId and otp are required" });
    }

    const otpRecord = await PhoneOtp.findById(otpChallengeId);
    if (
      !otpRecord ||
      otpRecord.phoneNumber !== normalizedPhone ||
      otpRecord.expiresAt <= new Date() ||
      otpRecord.usedAt
    ) {
      return res
        .status(400)
        .json({ message: "OTP verification failed or expired" });
    }

    const otpHash = crypto
      .createHash("sha256")
      .update(String(otp))
      .digest("hex");

    if (otpHash !== otpRecord.otpHash) {
      return res.status(400).json({ message: "Incorrect OTP" });
    }

    if (!otpRecord.verifiedAt) {
      otpRecord.verifiedAt = new Date();
      await otpRecord.save();
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("verifyPhoneOtp error:", err?.message || err);
    return res.status(500).json({ message: "Failed to verify OTP" });
  }
};

/* ---------------- PASSWORD RESET REQUEST ---------------- */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "email is required" });
    }

    // Always respond with generic message to avoid account enumeration.
    const genericResponse = { success: true, message: "If your email exists, a reset link has been sent." };

    // Check if any account exists for this email
    const [user, vendor, consumer] = await Promise.all([
      User.findOne({ email: normalizedEmail }).lean(),
      Vendor.findOne({ email: normalizedEmail }).lean(),
      Consumer.findOne({ email: normalizedEmail }).lean(),
    ]);

    const exists = Boolean(user || vendor || consumer);
    if (!exists) {
      return res.json(genericResponse);
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordResetToken.create({
      email: normalizedEmail,
      tokenHash,
      expiresAt,
      usedAt: null,
    });

    const firstClientOrigin = (process.env.CLIENT_ORIGIN || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] || "http://localhost:3000";

    const resetLink = `${firstClientOrigin}/reset-password?token=${encodeURIComponent(
      resetToken
    )}`;

    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    const emailFrom = process.env.EMAIL_FROM || "no-reply@skopekitchens.com";
    const fromName = process.env.SENDGRID_FROM_NAME || "Skope Kitchens";

    if (sendgridApiKey) {
      await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: normalizedEmail }] }],
          from: { email: emailFrom, name: fromName },
          subject: "Reset your SKOPE OS password",
          content: [
            {
              type: "text/plain",
              value: `You requested a password reset.\n\nClick this link to reset your password:\n${resetLink}\n\nThis link expires in 1 hour.\n`,
            },
            {
              type: "text/html",
              value: `<p>You requested a password reset.</p><p><a href="${resetLink}">Reset your password</a></p><p>This link expires in 1 hour.</p>`,
            },
          ],
        }),
      });
    }

    // For local testing, optionally return the resetLink
    const maybeDebugLink =
      process.env.RESET_RETURN_DEBUG === "true" ? { resetLink } : {};

    return res.json({ ...genericResponse, ...maybeDebugLink });
  } catch (err) {
    console.error("requestPasswordReset error:", err?.message || err);
    return res.status(500).json({ message: "Failed to request password reset" });
  }
};

/* ---------------- PASSWORD RESET CONFIRM ---------------- */
export const confirmPasswordReset = async (req, res) => {
  try {
    const { token, password } = req.body || {};
    const rawToken = String(token || "");
    const newPassword = String(password || "");

    if (!rawToken || !newPassword) {
      return res.status(400).json({ message: "token and password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const resetRecord = await PasswordResetToken.findOne({ tokenHash });
    if (
      !resetRecord ||
      resetRecord.expiresAt <= new Date() ||
      resetRecord.usedAt
    ) {
      return res.status(400).json({ message: "Reset token is invalid or expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update in the first matching collection.
    const email = resetRecord.email;
    let updated = false;

    if (await User.findOne({ email })) {
      await User.updateOne({ email }, { password: hashedPassword });
      updated = true;
    }
    if (await Vendor.findOne({ email })) {
      await Vendor.updateOne({ email }, { password: hashedPassword });
      updated = true;
    }
    if (await Consumer.findOne({ email })) {
      await Consumer.updateOne({ email }, { password: hashedPassword });
      updated = true;
    }

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    resetRecord.usedAt = new Date();
    await resetRecord.save();

    return res.json({ success: true, message: "Password updated" });
  } catch (err) {
    console.error("confirmPasswordReset error:", err?.message || err);
    return res.status(500).json({ message: "Failed to reset password" });
  }
};

/* ---------------- LOGIN ---------------- */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const loginId = email.toLowerCase().trim();

    /* =====================================================
       ADMIN LOGIN (CHECK FIRST — NO DATABASE)
    ===================================================== */

    const adminConfigs = [
      {
        role: ADMIN_ROLES.WALLET_MANAGER,
        username: process.env.ADMIN_WALLET_USERNAME,
        password: process.env.ADMIN_WALLET_PASSWORD
      },
      {
        role: ADMIN_ROLES.RECIPE_MANAGER,
        username: process.env.ADMIN_RECIPE_USERNAME,
        password: process.env.ADMIN_RECIPE_PASSWORD
      },
      {
        role: ADMIN_ROLES.INGREDIENT_MANAGER,
        username: process.env.ADMIN_INGREDIENT_USERNAME,
        password: process.env.ADMIN_INGREDIENT_PASSWORD
      }
    ];

    const matchedAdmin = adminConfigs.find((admin) => {
      if (!admin.username || !admin.password) return false;

      const envUser = admin.username.toLowerCase().trim();
      const envId = envUser.includes("@") ? envUser.split("@")[0] : envUser;

      const input = loginId.toLowerCase().trim();

      return (
        (input === envUser || input === envId) &&
        password === admin.password
      );
    });

    if (matchedAdmin) {
      const token = createToken({
        role: matchedAdmin.role,
        admin: true
      });

      return res.json({
        userType: "admin",
        token,
        role: matchedAdmin.role
      });
    }

    /* =====================================================
       DATABASE USERS (NOW SAFE)
    ===================================================== */

    const normalizedEmail = email.toLowerCase();

    /* ---------- CLIENT ---------- */
    let user = await User.findOne({ email: normalizedEmail });
    if (user && (await bcrypt.compare(password, user.password))) {
      const token = createToken({ userId: user._id, role: "client" });
      return res.json({
        userType: "client",
        token,
        user: sanitizeUser(user)
      });
    }

    /* ---------- VENDOR ---------- */
    let vendor = await Vendor.findOne({ email: normalizedEmail });
    if (vendor && (await bcrypt.compare(password, vendor.password))) {
      const token = createToken({ vendorId: vendor._id, role: "vendor" });
      return res.json({
        userType: "vendor",
        token,
        vendor
      });
    }

    /* ---------- CONSUMER ---------- */
    let consumer = await Consumer.findOne({ email: normalizedEmail });
    if (consumer && (await bcrypt.compare(password, consumer.password))) {
      const token = createToken({ consumerId: consumer._id, role: "consumer" });
      return res.json({
        userType: "consumer",
        token,
        consumer: {
          id: consumer._id,
          name: consumer.name,
          email: consumer.email,
          address: consumer.address
        }
      });
    }

    return res.status(401).json({ message: "Invalid email or password" });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
};

/* ---------------- CREDITS (CLIENT ONLY) ---------------- */
export const getCredits = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user.userId)
      .select("credits name email");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      credits: user.credits ?? 0,
      name: user.name,
      email: user.email
    });
  } catch (err) {
    console.error("Get credits error:", err);
    return res.status(500).json({ message: "Unable to fetch credits" });
  }
};

