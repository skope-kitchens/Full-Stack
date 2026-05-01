import express from "express";
import { submitEligibility } from "../controllers/eligibility.controller.js";
import multer from "multer";

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/",
  upload.single("document"),
  submitEligibility
);

export default router;
