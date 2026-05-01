import stream from "stream";
import EligibilitySubmission from "../models/eligibility.js";
import { sendEligibilityEmails } from "../utils/emailService.js";
import cloudinary from "../config/cloudinary.js";

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return value.split(",").map(v => v.trim()).filter(Boolean);
  }
  return [];
}

export const submitEligibility = async (req, res) => {
  try {
    console.log("Incoming eligibility request");

    let attachmentLinks = [];

    // ---------- FILE UPLOAD ----------
    if (req.file) {
      const uploadToCloudinary = (fileBuffer, filename) =>
        new Promise((resolve, reject) => {
          const pass = new stream.PassThrough();

          const cloudStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "raw",
              folder: "eligibility_uploads",
              public_id: filename,
            },
            (err, result) => {
              if (err) return reject(err);
              resolve(result);
            }
          );

          pass.end(fileBuffer);
          pass.pipe(cloudStream);
        });

      const uploaded = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      attachmentLinks.push(uploaded.secure_url);
    }

    // ---------- MERGE PAYLOAD ----------
    const payload = {
      ...req.body,
      attachments: attachmentLinks,
    };

    // ---------- NORMALIZE ARRAYS (v2) ----------
    payload.menuList = toArray(payload.menuList);
    payload.equipmentsList = toArray(payload.equipmentsList);
    payload.smallwareList = toArray(payload.smallwareList);

    // ---------- CONVERT NUMBERS (v2) ----------
    payload.averageOrderValue = Number(payload.averageOrderValue || 0);
    payload.ordersPerDay = Number(payload.ordersPerDay || 0);

    // ---------- CLEAN STRINGS ----------
    payload.brandName = payload.brandName?.trim();
    payload.submittedByEmail = payload.submittedByEmail?.toLowerCase().trim() || null;
    payload.operationalHours = String(payload.operationalHours || "").trim();

    // staffRequired can come as JSON string
    if (typeof payload.staffRequired === "string") {
      try {
        payload.staffRequired = JSON.parse(payload.staffRequired);
      } catch (_) {
        payload.staffRequired = payload.staffRequired;
      }
    }

    // ---------- VALIDATION ----------
    const requiredFields = [
      "brandName",
      "menuList",
      "equipmentsList",
      "smallwareList",
      "averageOrderValue",
      "ordersPerDay",
      "staffRequired",
      "operationalHours",
    ];

    for (const field of requiredFields) {
      const v = payload[field];
      const isEmptyArray = Array.isArray(v) && v.length === 0;
      const isEmptyString = typeof v === "string" && !v.trim();
      const isEmptyNumber =
        (field === "averageOrderValue" || field === "ordersPerDay") &&
        (!Number.isFinite(Number(v)) || Number(v) <= 0);

      if (v == null || isEmptyArray || isEmptyString || isEmptyNumber) {
        return res.status(400).json({
          message: `Field "${field}" is required`,
        });
      }
    }

    // ---------- LIGHTWEIGHT SCORING (v2) ----------
    const rawScore = 0;
    const scoreResult = {
      total_score_0_to_10: rawScore,
      meets_threshold: false,
      decision: "NEEDS_REVIEW",
      section_scores: {},
      brand_name: payload.brandName,
    };
    payload.totalScore = rawScore;
    payload.eligibilityPassed = false;
    payload.aiAnalysisSummary = "Submitted for review.";

    // ---------- SAVE ----------
    const submission = await EligibilitySubmission.create(payload);
    await sendEligibilityEmails({
      submission,
      scoreResult,
      aiAnalysisSummary: payload.aiAnalysisSummary,
      attachments: attachmentLinks,
    })


    return res.status(201).json({
      message: "Submitted",
      submissionId: submission._id,
      score: rawScore,
      decision: scoreResult.decision,
      meetsThreshold: scoreResult.meets_threshold,
      sectionScores: scoreResult.section_scores,
      aiAnalysisSummary: payload.aiAnalysisSummary,
      attachments: attachmentLinks,
    });

  } catch (err) {
    console.error("ELIGIBILITY ERROR:", err);
    res.status(500).json({
      message: err.message || "Internal server error",
    });
  }
};
