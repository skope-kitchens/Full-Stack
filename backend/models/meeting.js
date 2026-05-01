import mongoose from 'mongoose'

const MeetingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    email: String,
    date: Date,
    notes: String,
    attendeeEmail: { type: String, lowercase: true, trim: true },
    startTime: Date,
    endTime: Date,
    amountCharged: { type: Number, default: 0 },
    googleEventId: { type: String, unique: true, sparse: true },
    meetLink: { type: String },
    status: {
      type: String,
      enum: ["scheduled", "cancelled", "rescheduled", "completed"],
      default: "scheduled",
    },
    billingStatus: {
      type: String,
      enum: ["charged", "refunded", "pending"],
      default: "pending",
    },
    source: {
      type: String,
      enum: ["manual", "google_direct"],
      default: "manual",
    },
  },
  { timestamps: true }
)

// Prevent duplicate charging for the same attendee/time slot.
MeetingSchema.index(
  { attendeeEmail: 1, startTime: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model('Meeting', MeetingSchema)
