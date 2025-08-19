const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema({
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
  truckPrice: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  scooterPrice: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
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
areaSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
areaSchema.index({ name: 1 });
areaSchema.index({ isActive: 1 });

const Area = mongoose.model("Area", areaSchema);

module.exports = Area;
