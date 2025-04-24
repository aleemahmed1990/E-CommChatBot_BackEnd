const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../public/uploads/products");

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Not an image! Please upload an image file."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max file size
});

// Handle multiple uploads (one master image and multiple additional images)
const uploadFields = upload.fields([
  { name: "masterImage", maxCount: 1 },
  { name: "moreImage0", maxCount: 1 },
  { name: "moreImage1", maxCount: 1 },
  { name: "moreImage2", maxCount: 1 },
  { name: "moreImage3", maxCount: 1 },
  { name: "moreImage4", maxCount: 1 },
  { name: "moreImage5", maxCount: 1 },
]);

// GET all products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET parent products only (for child product selection)
router.get("/parents", async (req, res) => {
  try {
    const parentProducts = await Product.find({ productType: "Parent" })
      .select("productId productName brand")
      .sort({ productName: 1 });

    res.status(200).json({
      success: true,
      count: parentProducts.length,
      data: parentProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET parent products with search term for autocomplete
router.get("/parents/search", async (req, res) => {
  try {
    const searchTerm = req.query.term || "";

    // Create a case-insensitive regex pattern
    const searchRegex = new RegExp(searchTerm, "i");

    // Search for parent products matching the term in name or ID
    const parentProducts = await Product.find({
      productType: "Parent",
      $or: [{ productName: searchRegex }, { productId: searchRegex }],
    })
      .select("productId productName brand")
      .sort({ productName: 1 })
      .limit(10); // Limit to 10 results for performance

    res.status(200).json({
      success: true,
      count: parentProducts.length,
      data: parentProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET single product by ID
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET product by productId
router.get("/code/:productId", async (req, res) => {
  try {
    const product = await Product.findOne({ productId: req.params.productId });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// POST create new product
router.post("/", uploadFields, async (req, res) => {
  try {
    const productData = { ...req.body };

    // Process specifications from JSON string to object
    if (productData.specifications) {
      productData.specifications = JSON.parse(productData.specifications);
    }

    // Process tags from JSON string to array
    if (productData.tags) {
      productData.tags = JSON.parse(productData.tags);
    }

    // Process our new boolean flags:
    if (productData.noReorder !== undefined) {
      productData.noReorder = productData.noReorder === "true";
    }
    if (productData.useStockAmount !== undefined) {
      productData.useStockAmount = productData.useStockAmount === "true";
    }
    if (productData.useSafetyDays !== undefined) {
      productData.useSafetyDays = productData.useSafetyDays === "true";
    }

    // Process our new boolean flags:
    if (productData.noReorder !== undefined) {
      productData.noReorder = productData.noReorder === "true";
    }
    if (productData.useStockAmount !== undefined) {
      productData.useStockAmount = productData.useStockAmount === "true";
    }
    if (productData.useSafetyDays !== undefined) {
      productData.useSafetyDays = productData.useSafetyDays === "true";
    }

    // Process boolean fields
    if (productData.onceShare) {
      productData.onceShare = productData.onceShare === "true";
    }

    if (productData.noChildHideParent) {
      productData.noChildHideParent = productData.noChildHideParent === "true";
    }

    // Handle image uploads
    if (req.files) {
      // Master image
      if (req.files.masterImage && req.files.masterImage[0]) {
        productData.masterImage = `/uploads/products/${req.files.masterImage[0].filename}`;
      }

      // Additional images
      const moreImages = [];
      for (let i = 0; i < 6; i++) {
        const fieldName = `moreImage${i}`;
        if (req.files[fieldName] && req.files[fieldName][0]) {
          moreImages.push(
            `/uploads/products/${req.files[fieldName][0].filename}`
          );
        }
      }

      if (moreImages.length > 0) {
        productData.moreImages = moreImages;
      }
    }

    // Create new product
    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// PUT update product
router.put("/:id", uploadFields, async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const productData = { ...req.body };

    // Process specifications from JSON string to object
    if (productData.specifications) {
      productData.specifications = JSON.parse(productData.specifications);
    }

    // Process tags from JSON string to array
    if (productData.tags) {
      productData.tags = JSON.parse(productData.tags);
    }

    // Process boolean fields
    if (productData.onceShare) {
      productData.onceShare = productData.onceShare === "true";
    }

    if (productData.noChildHideParent) {
      productData.noChildHideParent = productData.noChildHideParent === "true";
    }

    // Handle image uploads
    if (req.files) {
      // Master image
      if (req.files.masterImage && req.files.masterImage[0]) {
        // Remove old image if it exists
        if (product.masterImage) {
          const oldImagePath = path.join(
            __dirname,
            "../public",
            product.masterImage
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }

        productData.masterImage = `/uploads/products/${req.files.masterImage[0].filename}`;
      }

      // Additional images
      const moreImages = [...(product.moreImages || [])];
      for (let i = 0; i < 6; i++) {
        const fieldName = `moreImage${i}`;
        if (req.files[fieldName] && req.files[fieldName][0]) {
          // Remove old image if it exists
          if (moreImages[i]) {
            const oldImagePath = path.join(
              __dirname,
              "../public",
              moreImages[i]
            );
            if (fs.existsSync(oldImagePath)) {
              fs.unlinkSync(oldImagePath);
            }
          }

          // If the image already exists at this position, replace it
          if (moreImages[i]) {
            moreImages[
              i
            ] = `/uploads/products/${req.files[fieldName][0].filename}`;
          } else {
            // Otherwise add it to the array
            moreImages.push(
              `/uploads/products/${req.files[fieldName][0].filename}`
            );
          }
        }
      }

      productData.moreImages = moreImages;
    }

    // Update product
    product = await Product.findByIdAndUpdate(req.params.id, productData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    if (error.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// DELETE product
router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if it's a parent product with child products
    if (product.productType === "Parent") {
      const childProducts = await Product.find({
        parentProduct: product.productId,
      });

      if (childProducts.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete parent product with existing child products",
        });
      }
    }

    // Delete associated images
    if (product.masterImage) {
      const masterImagePath = path.join(
        __dirname,
        "../public",
        product.masterImage
      );
      if (fs.existsSync(masterImagePath)) {
        fs.unlinkSync(masterImagePath);
      }
    }

    if (product.moreImages && product.moreImages.length > 0) {
      product.moreImages.forEach((imagePath) => {
        const fullPath = path.join(__dirname, "../public", imagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      });
    }

    // Delete the product
    await product.remove();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET products by search term
router.get("/search/:term", async (req, res) => {
  try {
    const searchRegex = new RegExp(req.params.term, "i");

    const products = await Product.find({
      $or: [
        { productName: searchRegex },
        { productId: searchRegex },
        { brand: searchRegex },
        { tags: searchRegex },
      ],
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET products by category
router.get("/category/:category", async (req, res) => {
  try {
    const products = await Product.find({
      categories: req.params.category,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET products by tag
router.get("/tag/:tag", async (req, res) => {
  try {
    const products = await Product.find({ tags: req.params.tag }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET child products of a parent
router.get("/children/:parentId", async (req, res) => {
  try {
    const children = await Product.find({
      parentProduct: req.params.parentId,
      productType: "Child",
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: children.length,
      data: children,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;
