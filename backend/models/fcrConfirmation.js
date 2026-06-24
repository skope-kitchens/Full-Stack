import mongoose from "mongoose";

// Tracks whether a POC has confirmed a specific recipe iteration's FCR for
// client visibility. Created/updated only via the POC's confirm action — the
// recipe documents themselves (TrialRecipe/TrainingRecipe/MainRecipe) are
// never touched by this model.
const fcrConfirmationSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true },
    recipeName: { type: String, required: true },
    phase: { type: String, enum: ["TRIAL", "TRAINING", "FINAL"], required: true },
    code: { type: String, enum: ["T1", "T2", "T3", "TR1", "TR2", "TR3", null], default: null },
    confirmed: { type: Boolean, default: false },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", default: null },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

fcrConfirmationSchema.index({ brandName: 1, recipeName: 1, phase: 1, code: 1 }, { unique: true });

export default mongoose.model("FcrConfirmation", fcrConfirmationSchema, "fcr_confirmations");
