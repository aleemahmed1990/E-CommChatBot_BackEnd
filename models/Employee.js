const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const EmployeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      default: () => `EMP-${uuidv4().substring(0, 8).toUpperCase()}`,
      unique: true,
      immutable: true,
    },
    name: {
      type: String,
      required: [true, "Employee name is required"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
    },
    address: {
      type: String,
      required: [true, "Address is required"],
    },
    homeLocation: {
      type: String,
      required: [true, "Home location is required"],
    },
    emergencyContact: {
      type: String,
      required: [true, "Emergency contact is required"],
    },
    contacts: [
      {
        name: { type: String, required: true },
        relation: { type: String, required: true },
        phoneNumber: { type: String, required: true },
      },
    ],
    roles: {
      type: [String],
      default: [],
    },
    profilePicture: {
      type: String,
      default: null,
    },
    employeeCategory: {
      type: String,
      enum: ["Driver", "Order Manager"], // Restricting the category to these two options
      required: [true, "Employee category is required"],
    },
    idCardFront: {
      type: String,
      default: null,
    },
    idCardBack: {
      type: String,
      default: null,
    },
    passportFront: {
      type: String,
      default: null,
    },
    passportBack: {
      type: String,
      default: null,
    },
    otherDoc1: {
      type: String,
      default: null,
    },
    otherDoc2: {
      type: String,
      default: null,
    },
    addedOn: {
      type: Date,
      default: Date.now,
    },
    isActivated: {
      type: Boolean,
      default: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Employee", EmployeeSchema);
