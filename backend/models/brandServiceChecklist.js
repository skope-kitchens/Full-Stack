import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema({
  name: String,
  completed: { type: Boolean, default: false },
  completedAt: Date
});

const brandServiceChecklistSchema = new mongoose.Schema({
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    required: true
  },
  services: [serviceSchema]
}, { timestamps: true });

export default mongoose.model(
  "BrandServiceChecklist",
  brandServiceChecklistSchema
);
