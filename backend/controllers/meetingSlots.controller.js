import { randomUUID } from "crypto";
import User from "../models/user.js";
import Meeting from "../models/meeting.js";
import { getAuthenticatedCalendarClient } from "../services/googleTokenManager.js";

const TIMEZONE = "Asia/Kolkata";
const SLOT_DURATION_MINUTES = 60;
const MEETING_COST = 60;
const BUSINESS_START_HOUR = 10;
const BUSINESS_END_HOUR = 19;
const DAYS_AHEAD = 7;

/**
 * GET /api/meeting/slots
 * Returns free 30-min slots for the next 7 days, 10:00–19:00 Asia/Kolkata.
 */
export const getAvailableSlots = async (req, res) => {
  try {
    const calendar = await getAuthenticatedCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      return res.status(500).json({ message: "Calendar not configured" });
    }

    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + DAYS_AHEAD);

    const freebusyRes = await calendar.freebusy.query({
      requestBody: {
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        items: [{ id: calendarId }],
      },
    });

    const busy = freebusyRes.data?.calendars?.[calendarId]?.busy || [];
    const busyRanges = busy.map((b) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }));

    const slots = [];
    const slotMs = SLOT_DURATION_MINUTES * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;

    for (let d = 0; d < DAYS_AHEAD; d++) {
      const dayStart = new Date(rangeStart);
      // Skip weekends (Sunday = 0, Saturday = 6)
    
      dayStart.setDate(dayStart.getDate() + d);
      const weekday = dayStart.getDay();
      if (weekday === 0 || weekday === 6) {
        continue;
      }
      dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(BUSINESS_END_HOUR, 0, 0, 0);

      for (
        let t = dayStart.getTime();
        t + slotMs <= dayEnd.getTime();
        t += slotMs
      ) {
        if (t < now.getTime()) continue;
        const slotStart = t;
        const slotEnd = t + slotMs;
        const isBusy = busyRanges.some(
          (r) => slotStart < r.end && slotEnd > r.start
        );
        if (!isBusy) {
          slots.push(new Date(slotStart).toISOString());
        }
      }
    }

    res.json({ slots });
  } catch (err) {
    console.error("getAvailableSlots error:", err);
    if (err.message?.includes("refresh token") || err.code === 401) {
      return res.status(401).json({ message: "Calendar not connected" });
    }
    res.status(500).json({ message: "Failed to fetch slots" });
  }
};

/**
 * POST /api/meeting/book
 * Body: { start: ISO_STRING }
 * Creates Google Calendar event with Meet link first; only then deducts wallet.
 */
export const bookMeeting = async (req, res) => {
  const { start } = req.body || {};
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  if (!start) return res.status(400).json({ message: "start is required" });

  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) {
    return res.status(400).json({ message: "Invalid start time" });
  }

  const endDate = new Date(startDate.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    return res.status(500).json({ message: "Calendar not configured" });
  }

  const user = await User.findById(userId).select("email wallet name");
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!user.wallet) return res.status(400).json({ message: "Wallet not found" });

  const balance = Number(user.wallet.balance ?? 0);
  if (balance < MEETING_COST) {
    return res.status(400).json({
      message: `Insufficient wallet balance. ₹${MEETING_COST} required.`,
    });
  }

  let calendar;
  try {
    calendar = await getAuthenticatedCalendarClient();
  } catch (err) {
    console.error("bookMeeting calendar client:", err);
    return res.status(503).json({ message: "Calendar not connected" });
  }

  const requestId = randomUUID();

  const organizerEmail = process.env.GOOGLE_CALENDAR_ID;
  const attendees = [];
  if (user.email) {
    attendees.push({ email: user.email });
  }
  if (
    organizerEmail &&
    organizerEmail.includes("@") &&
    organizerEmail.toLowerCase() !== (user.email || "").toLowerCase()
  ) {
    attendees.push({ email: organizerEmail });
  }

  const eventBody = {
    summary: "Consultation Call",
    description: `Meeting with ${user.name || "client"} (${user.email || "no email"})`,
    start: { dateTime: startDate.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: endDate.toISOString(), timeZone: TIMEZONE },
    attendees,
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  let insertedEvent;
  try {
    const insertRes = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: eventBody,
    });
    insertedEvent = insertRes.data;
  } catch (err) {
    const code = err.code ?? err.response?.status;
    if (code === 409 || err.message?.toLowerCase().includes("conflict")) {
      return res.status(409).json({ message: "Slot already booked" });
    }
    console.error("bookMeeting events.insert:", err);
    return res.status(500).json({ message: "Failed to book slot" });
  }

  const meetLink =
    insertedEvent.hangoutLink ||
    insertedEvent.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
    null;
  const googleEventId = insertedEvent.id;

  user.wallet.balance -= MEETING_COST;
  user.wallet.transactions.push({
    amount: MEETING_COST,
    type: "debit",
    source: "system",
    reason: "Meeting Booked (Google Meet)",
    createdAt: new Date(),
  });
  await user.save();

  const io = req?.app?.get?.("io");
  if (io) io.to(String(userId)).emit("wallet:update", user.wallet.balance);

  await Meeting.create({
    user: userId,
    name: user.name,
    email: user.email,
    attendeeEmail: (user.email || "").toLowerCase(),
    startTime: startDate,
    endTime: endDate,
    googleEventId,
    meetLink,
    amountCharged: MEETING_COST,
    status: "scheduled",
    billingStatus: "charged",
    source: "google_direct",
  });

  console.log("[MeetingBooked]", {
    user: user.email || null,
    organizer: calendarId,
    start: startDate.toISOString(),
    meetLink,
    emailNotifications: "enabled",
  });

  res.json({ success: true, meetLink });
};
