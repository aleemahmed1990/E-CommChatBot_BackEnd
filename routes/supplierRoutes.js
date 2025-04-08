const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Supplier = require("../models/supplier");

// Set up multer storage for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads/suppliers");

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Create a unique filename with original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// File filter to only allow image uploads
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedFileTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedFileTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter,
});

// Define the upload fields
const uploadFields = upload.fields([
  { name: "profilePicture", maxCount: 1 },
  { name: "idCardFront", maxCount: 1 },
  { name: "idCardBack", maxCount: 1 },
  { name: "passportFront", maxCount: 1 },
  { name: "passportBack", maxCount: 1 },
]);

// Get all suppliers
router.get("/", async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers,
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Get single supplier
router.get("/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    res.status(200).json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    console.error("Error fetching supplier:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Create new supplier with file uploads
router.post("/", uploadFields, async (req, res) => {
  try {
    const supplierData = {
      ...req.body,
    };

    // Add file paths if files were uploaded
    if (req.files) {
      if (req.files.profilePicture) {
        supplierData.profilePicture = `/uploads/suppliers/${req.files.profilePicture[0].filename}`;
      }

      if (req.files.idCardFront) {
        supplierData.idCardFront = `/uploads/suppliers/${req.files.idCardFront[0].filename}`;
      }

      if (req.files.idCardBack) {
        supplierData.idCardBack = `/uploads/suppliers/${req.files.idCardBack[0].filename}`;
      }

      if (req.files.passportFront) {
        supplierData.passportFront = `/uploads/suppliers/${req.files.passportFront[0].filename}`;
      }

      if (req.files.passportBack) {
        supplierData.passportBack = `/uploads/suppliers/${req.files.passportBack[0].filename}`;
      }
    }

    // Validate document requirements
    const hasIdCard = supplierData.idCardFront && supplierData.idCardBack;
    const hasPassport = supplierData.passportFront && supplierData.passportBack;

    if (!hasIdCard && !hasPassport) {
      return res.status(400).json({
        success: false,
        message:
          "Either ID card (both sides) or passport (both sides) is required",
      });
    }

    // Updated phone validation regex to match the +62 format
    const phoneRegex = /^\+62[0-9]{9,11}$/;

    if (!phoneRegex.test(supplierData.phone)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Indonesian phone number in +62 format",
      });
    }

    // Validate second phone if provided
    if (
      supplierData.secondPhone &&
      !phoneRegex.test(supplierData.secondPhone)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid Indonesian second phone number in +62 format",
      });
    }

    const supplier = await Supplier.create(supplierData);

    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      supplier,
    });
  } catch (error) {
    console.error("Error creating supplier:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Update supplier with file uploads
router.put("/:id", uploadFields, async (req, res) => {
  try {
    let supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    const supplierData = {
      ...req.body,
    };

    // Add file paths if new files were uploaded
    if (req.files) {
      if (req.files.profilePicture) {
        // Delete old file if exists
        if (supplier.profilePicture) {
          const oldFilePath = path.join(
            __dirname,
            "..",
            supplier.profilePicture
          );
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        supplierData.profilePicture = `/uploads/suppliers/${req.files.profilePicture[0].filename}`;
      }

      if (req.files.idCardFront) {
        if (supplier.idCardFront) {
          const oldFilePath = path.join(__dirname, "..", supplier.idCardFront);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        supplierData.idCardFront = `/uploads/suppliers/${req.files.idCardFront[0].filename}`;
      }

      if (req.files.idCardBack) {
        if (supplier.idCardBack) {
          const oldFilePath = path.join(__dirname, "..", supplier.idCardBack);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        supplierData.idCardBack = `/uploads/suppliers/${req.files.idCardBack[0].filename}`;
      }

      if (req.files.passportFront) {
        if (supplier.passportFront) {
          const oldFilePath = path.join(
            __dirname,
            "..",
            supplier.passportFront
          );
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        supplierData.passportFront = `/uploads/suppliers/${req.files.passportFront[0].filename}`;
      }

      if (req.files.passportBack) {
        if (supplier.passportBack) {
          const oldFilePath = path.join(__dirname, "..", supplier.passportBack);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        supplierData.passportBack = `/uploads/suppliers/${req.files.passportBack[0].filename}`;
      }
    }

    // Check document requirements after update
    const updatedIdCardFront = supplierData.idCardFront || supplier.idCardFront;
    const updatedIdCardBack = supplierData.idCardBack || supplier.idCardBack;
    const updatedPassportFront =
      supplierData.passportFront || supplier.passportFront;
    const updatedPassportBack =
      supplierData.passportBack || supplier.passportBack;

    const hasIdCard = updatedIdCardFront && updatedIdCardBack;
    const hasPassport = updatedPassportFront && updatedPassportBack;

    if (!hasIdCard && !hasPassport) {
      return res.status(400).json({
        success: false,
        message:
          "Either ID card (both sides) or passport (both sides) is required",
      });
    }

    // Updated phone validation regex to match the +62 format
    const phoneRegex = /^\+62[0-9]{9,11}$/;

    // Validate phone number if provided
    if (supplierData.phone && !phoneRegex.test(supplierData.phone)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Indonesian phone number in +62 format",
      });
    }

    // Validate second phone if provided
    if (
      supplierData.secondPhone &&
      !phoneRegex.test(supplierData.secondPhone)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid Indonesian second phone number in +62 format",
      });
    }

    supplier = await Supplier.findByIdAndUpdate(req.params.id, supplierData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Supplier updated successfully",
      data: supplier,
    });
  } catch (error) {
    console.error("Error updating supplier:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Delete supplier - Improved to handle file deletions properly
router.delete("/:id", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Delete associated files
    const filesToDelete = [
      supplier.profilePicture,
      supplier.idCardFront,
      supplier.idCardBack,
      supplier.passportFront,
      supplier.passportBack,
    ];

    // Delete each file if it exists
    for (const filePath of filesToDelete) {
      if (filePath) {
        const fullPath = path.join(__dirname, "..", filePath);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Successfully deleted file: ${fullPath}`);
          }
        } catch (fileError) {
          console.error(`Error deleting file ${fullPath}:`, fileError);
          // Continue with deletion even if file removal fails
        }
      }
    }

    // Use findByIdAndDelete instead of remove()
    await Supplier.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Supplier deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting supplier:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Toggle supplier block status
router.patch("/:id/toggle-block", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Toggle the status
    supplier.status = supplier.status === "blocked" ? "unblocked" : "blocked";

    await supplier.save();

    res.status(200).json({
      success: true,
      message: `Supplier ${
        supplier.status === "blocked" ? "blocked" : "unblocked"
      } successfully`,
      data: supplier,
    });
  } catch (error) {
    console.error("Error toggling supplier block status:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Toggle supplier active status
router.patch("/:id/toggle-active", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Toggle the active status
    supplier.activeInactive =
      supplier.activeInactive === "active" ? "inactive" : "active";

    await supplier.save();

    res.status(200).json({
      success: true,
      message: `Supplier ${
        supplier.activeInactive === "active" ? "activated" : "deactivated"
      } successfully`,
      data: supplier,
    });
  } catch (error) {
    console.error("Error toggling supplier active status:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Delete specific image from supplier
router.delete("/:id/image/:fieldName", async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    const { fieldName } = req.params;

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Check if field is valid and has a value
    const validFields = [
      "profilePicture",
      "idCardFront",
      "idCardBack",
      "passportFront",
      "passportBack",
    ];

    if (!validFields.includes(fieldName) || !supplier[fieldName]) {
      return res.status(400).json({
        success: false,
        message: "Invalid field name or no image to delete",
      });
    }

    // Delete file from disk
    const filePath = path.join(__dirname, "..", supplier[fieldName]);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.error(`Error deleting file ${filePath}:`, fileError);
      // Continue even if file removal fails
    }

    // Clear the field in the database
    supplier[fieldName] = "";

    // Check if ID card or passport requirements are still met
    const hasIdCard =
      (fieldName.includes("idCard") ? false : supplier.idCardFront) &&
      (fieldName.includes("idCard") ? false : supplier.idCardBack);

    const hasPassport =
      (fieldName.includes("passport") ? false : supplier.passportFront) &&
      (fieldName.includes("passport") ? false : supplier.passportBack);

    // Only validate if we're removing an ID or passport image
    if (
      (fieldName.includes("idCard") || fieldName.includes("passport")) &&
      !hasIdCard &&
      !hasPassport
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete this image as either ID card (both sides) or passport (both sides) is required",
      });
    }

    await supplier.save();

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      data: supplier,
    });
  } catch (error) {
    console.error("Error deleting supplier image:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

module.exports = router;
