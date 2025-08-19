const mongoose = require("mongoose");

const vehicleTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ["scooter", "truck"],
    default: "truck",
  },
  specifications: {
    maxVolume: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    maxWeight: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    maxPackages: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
vehicleTypeSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
vehicleTypeSchema.index({ name: 1 });
vehicleTypeSchema.index({ category: 1 });
vehicleTypeSchema.index({ isActive: 1 });

const VehicleType = mongoose.model("VehicleType", vehicleTypeSchema);

module.exports = VehicleType;
