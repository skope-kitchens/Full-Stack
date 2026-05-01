import express from "express";
import {
  getAvailableSlots,
  bookMeeting,
} from "../controllers/meetingSlots.controller.js";
import { authorizeBooking } from "../controllers/meeting.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

router.get("/slots", authMiddleware, getAvailableSlots);
router.post("/book", authMiddleware, bookMeeting);
router.post("/authorize-booking", authMiddleware, authorizeBooking);

export default router;
