const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Employee = require("../models/Employee");

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// File filter to accept only images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf/;
  const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mime = allowedTypes.test(file.mimetype);

  if (ext && mime) {
    return cb(null, true);
  }

  cb(new Error("Invalid file type. Only JPEG, PNG, GIF and PDF are allowed."));
};

// Initialize upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter,
});

// Define file field array for multer upload
const uploadFields = upload.fields([
  { name: "profilePicture", maxCount: 1 },
  { name: "idCardFront", maxCount: 1 },
  { name: "idCardBack", maxCount: 1 },
  { name: "passportFront", maxCount: 1 },
  { name: "passportBack", maxCount: 1 },
  { name: "otherDoc1", maxCount: 1 },
  { name: "otherDoc2", maxCount: 1 },
]);

// @route   POST /api/employees
// @desc    Create a new employee
// @access  Private
router.post("/", uploadFields, async (req, res) => {
  try {
    console.log("Request body:", req.body); // Log the incoming body for debugging
    let contacts = [];
    if (req.body.contacts) {
      try {
        contacts = JSON.parse(req.body.contacts);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: "Invalid contacts format",
        });
      }
    }

    // Ensure contacts have name and relation before proceeding
    for (let contact of contacts) {
      if (!contact.name || !contact.relation) {
        return res.status(400).json({
          success: false,
          message: "Contact name and relation are required",
        });
      }
    }

    const employeeData = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      homeLocation: req.body.homeLocation,
      emergencyContact: req.body.emergencyContact,
      contacts: contacts, // Use the parsed contacts array
      roles: req.body.roles ? JSON.parse(req.body.roles) : [],
      addedOn: req.body.addedOn || Date.now(),
      isActivated: req.body.isActivated === "true",
      employeeCategory: req.body.employeeCategory,
      isBlocked: req.body.isBlocked === "true",
    };

    // Add file paths if they exist
    if (req.files) {
      if (req.files.profilePicture) {
        employeeData.profilePicture = `/uploads/${req.files.profilePicture[0].filename}`;
      }
      if (req.files.idCardFront) {
        employeeData.idCardFront = `/uploads/${req.files.idCardFront[0].filename}`;
      }
      if (req.files.idCardBack) {
        employeeData.idCardBack = `/uploads/${req.files.idCardBack[0].filename}`;
      }
      if (req.files.passportFront) {
        employeeData.passportFront = `/uploads/${req.files.passportFront[0].filename}`;
      }
      if (req.files.passportBack) {
        employeeData.passportBack = `/uploads/${req.files.passportBack[0].filename}`;
      }
      if (req.files.otherDoc1) {
        employeeData.otherDoc1 = `/uploads/${req.files.otherDoc1[0].filename}`;
      }
      if (req.files.otherDoc2) {
        employeeData.otherDoc2 = `/uploads/${req.files.otherDoc2[0].filename}`;
      }
    }

    const employee = new Employee(employeeData);
    await employee.save();

    res.status(201).json({
      success: true,
      data: employee,
      message: "Employee added successfully",
    });
  } catch (error) {
    console.error("Error adding employee:", error);

    // Handle duplicate key error (typically email)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Employee with this email already exists",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error. Please try again.",
    });
  }
});

// @route   GET /api/employees
// @desc    Get all employees
// @access  Private
router.get("/", async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Could not fetch employees.",
    });
  }
});

// @route   GET /api/employees/:id
// @desc    Get employee by ID
// @access  Private
router.get("/:id", async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Could not fetch employee details.",
    });
  }
});

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private
router.put("/:id", uploadFields, async (req, res) => {
  try {
    let employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Parse the contacts array from the request
    let contacts = employee.contacts;
    if (req.body.contacts) {
      try {
        contacts = JSON.parse(req.body.contacts);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: "Invalid contacts format",
        });
      }
    }

    const updatedData = {
      name: req.body.name,
      phone: req.body.phone,
      address: req.body.address,
      homeLocation: req.body.homeLocation,
      emergencyContact: req.body.emergencyContact,
      contacts: contacts,
      roles: req.body.roles ? JSON.parse(req.body.roles) : employee.roles,
      isActivated: req.body.isActivated === "true",
      isBlocked: req.body.isBlocked === "true",
    };

    // Add file paths if they exist
    if (req.files) {
      if (req.files.profilePicture) {
        // Remove old file if exists
        if (employee.profilePicture) {
          const oldPath = path.join(__dirname, "..", employee.profilePicture);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        updatedData.profilePicture = `/uploads/${req.files.profilePicture[0].filename}`;
      }

      if (req.files.idCardFront) {
        if (employee.idCardFront) {
          const oldPath = path.join(__dirname, "..", employee.idCardFront);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        updatedData.idCardFront = `/uploads/${req.files.idCardFront[0].filename}`;
      }

      if (req.files.idCardBack) {
        if (employee.idCardBack) {
          const oldPath = path.join(__dirname, "..", employee.idCardBack);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        updatedData.idCardBack = `/uploads/${req.files.idCardBack[0].filename}`;
      }

      if (req.files.passportFront) {
        if (employee.passportFront) {
          const oldPath = path.join(__dirname, "..", employee.passportFront);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        updatedData.passportFront = `/uploads/${req.files.passportFront[0].filename}`;
      }

      if (req.files.passportBack) {
        if (employee.passportBack) {
          const oldPath = path.join(__dirname, "..", employee.passportBack);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        updatedData.passportBack = `/uploads/${req.files.passportBack[0].filename}`;
      }

      if (req.files.otherDoc1) {
        if (employee.otherDoc1) {
          const oldPath = path.join(__dirname, "..", employee.otherDoc1);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        updatedData.otherDoc1 = `/uploads/${req.files.otherDoc1[0].filename}`;
      }

      if (req.files.otherDoc2) {
        if (employee.otherDoc2) {
          const oldPath = path.join(__dirname, "..", employee.otherDoc2);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        updatedData.otherDoc2 = `/uploads/${req.files.otherDoc2[0].filename}`;
      }
    }

    employee = await Employee.findByIdAndUpdate(req.params.id, updatedData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: employee,
      message: "Employee updated successfully",
    });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Could not update employee details.",
    });
  }
});

// @route   DELETE /api/employees/:id
// @desc    Delete employee
// @access  Private (Admin only)
router.delete("/:id", async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Delete associated files
    const filePaths = [
      employee.profilePicture,
      employee.idCardFront,
      employee.idCardBack,
      employee.passportFront,
      employee.passportBack,
      employee.otherDoc1,
      employee.otherDoc2,
    ];

    filePaths.forEach((filePath) => {
      if (filePath) {
        const fullPath = path.join(__dirname, "..", filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    });

    await Employee.deleteOne({ _id: req.params.id });

    res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Could not delete employee.",
    });
  }
});

module.exports = router;
