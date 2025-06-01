const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Supplier = require("../models/supplier");

// ─── 1) Helper to parse numbers safely ───────────────────────────────────
function parseOptionalNumber(val) {
  if (val === undefined || val === null || val === "" || val === "null") {
    return null; // we want an explicit null in the DB
  }
  const num = Number(val);
  return isNaN(num) ? null : num;
}

// ─── 2) Multer setup (unchanged) ────────────────────────────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(__dirname, "../public/uploads/products");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`
    );
  },
});
const fileFilter = (req, file, cb) =>
  file.mimetype.startsWith("image/")
    ? cb(null, true)
    : cb(new Error("Not an image!"), false);
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
const uploadFields = upload.fields([
  { name: "masterImage", maxCount: 1 },
  { name: "moreImage0", maxCount: 1 },
  { name: "moreImage1", maxCount: 1 },
  { name: "moreImage2", maxCount: 1 },
  { name: "moreImage3", maxCount: 1 },
  { name: "moreImage4", maxCount: 1 },
  { name: "moreImage5", maxCount: 1 },
]);

// ✅ FIXED: Main products endpoint with proper status filtering
router.get("/", async (req, res) => {
  try {
    const { status } = req.query; // Allow status filtering

    let query = {};
    if (status) {
      if (status === "needs_reorder") {
        // For OutOfStock component - exclude products with active orders
        query.stockOrderStatus = { $in: ["needs_reorder"] };
      } else {
        query.stockOrderStatus = status;
      }
    }

    const products = await Product.find(query)
      .select(
        "productId productName categories Stock NormalPrice lostStock lostStockHistory AmountStockmintoReorder minimumOrder useAmountStockmintoReorder stockOrderStatus orderStock createdAt updatedAt"
      )
      .lean();

    // Process products to ensure proper threshold calculation
    const processedProducts = products.map((product) => {
      // Determine the reorder threshold for this product
      let reorderThreshold = 5; // Default fallback

      if (
        product.useAmountStockmintoReorder &&
        product.AmountStockmintoReorder
      ) {
        reorderThreshold = product.AmountStockmintoReorder;
      } else if (product.minimumOrder) {
        reorderThreshold = product.minimumOrder;
      }

      // Add status flags
      const isOrderPlaced = product.stockOrderStatus === "order_placed";
      const isConfirmed = product.stockOrderStatus === "order_confirmed";
      const needsReorder = product.stockOrderStatus === "needs_reorder";

      return {
        ...product,
        reorderThreshold,
        currentStock: product.Stock || 0,
        isLowStock: (product.Stock || 0) <= reorderThreshold,
        isOutOfStock: (product.Stock || 0) === 0,
        isCritical: (product.Stock || 0) <= Math.ceil(reorderThreshold * 0.5),
        stockStatus: getStockStatus(product.Stock || 0, reorderThreshold),
        // Status flags
        isOrderPlaced,
        isConfirmed,
        needsReorder,
      };
    });

    res.json({
      success: true,
      data: processedProducts,
      summary: {
        totalProducts: processedProducts.length,
        inStock: processedProducts.filter((p) => p.stockStatus === "in_stock")
          .length,
        lowStock: processedProducts.filter((p) => p.stockStatus === "low_stock")
          .length,
        outOfStock: processedProducts.filter(
          (p) => p.stockStatus === "out_of_stock"
        ).length,
        critical: processedProducts.filter((p) => p.stockStatus === "critical")
          .length,
        needsReorder: processedProducts.filter((p) => p.needsReorder).length,
        orderPlaced: processedProducts.filter((p) => p.isOrderPlaced).length,
        confirmed: processedProducts.filter((p) => p.isConfirmed).length,
      },
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching products",
      error: err.message,
    });
  }
});

// ─── HELPER: Calculate stock status based on threshold ─────────────────────
function getStockStatus(currentStock, threshold) {
  const criticalThreshold = Math.ceil(threshold * 0.5);

  if (currentStock === 0) {
    return "out_of_stock";
  } else if (currentStock <= criticalThreshold) {
    return "critical";
  } else if (currentStock <= threshold) {
    return "low_stock";
  } else {
    return "in_stock";
  }
}

// ─── NEW: Get inventory analysis with AmountStockmintoReorder ───────────────
router.get("/inventory-analysis", async (req, res) => {
  try {
    const products = await Product.find({})
      .select(
        "productId productName categories Stock NormalPrice AmountStockmintoReorder minimumOrder useAmountStockmintoReorder"
      )
      .lean();

    const analysis = products.map((product) => {
      // Determine the reorder threshold for this product
      let reorderThreshold = 5; // Default fallback
      let thresholdSource = "default";

      if (
        product.useAmountStockmintoReorder &&
        product.AmountStockmintoReorder
      ) {
        reorderThreshold = product.AmountStockmintoReorder;
        thresholdSource = "AmountStockmintoReorder";
      } else if (product.minimumOrder) {
        reorderThreshold = product.minimumOrder;
        thresholdSource = "minimumOrder";
      }

      const currentStock = product.Stock || 0;
      const criticalThreshold = Math.ceil(reorderThreshold * 0.5);
      const stockStatus = getStockStatus(currentStock, reorderThreshold);

      // Calculate reorder recommendations
      const idealStock = reorderThreshold * 2;
      const unitsNeeded = Math.max(0, idealStock - currentStock);
      const daysUntilOutOfStock =
        currentStock > 0
          ? Math.floor(currentStock / (reorderThreshold * 0.1))
          : 0;

      return {
        ...product,
        reorderThreshold,
        thresholdSource,
        currentStock,
        criticalThreshold,
        stockStatus,
        stockStatusText: getStockStatusText(stockStatus),
        priority: getStockPriority(stockStatus),
        reorderRecommendation: {
          shouldReorder: currentStock <= reorderThreshold,
          unitsNeeded,
          idealStock,
          urgency:
            stockStatus === "out_of_stock"
              ? "immediate"
              : stockStatus === "critical"
              ? "urgent"
              : stockStatus === "low_stock"
              ? "soon"
              : "none",
          estimatedDaysLeft: daysUntilOutOfStock,
        },
      };
    });

    // Sort by priority (most critical first)
    const sortedAnalysis = analysis.sort((a, b) => {
      const priorityOrder = {
        out_of_stock: 4,
        critical: 3,
        low_stock: 2,
        in_stock: 1,
      };
      return priorityOrder[b.stockStatus] - priorityOrder[a.stockStatus];
    });

    res.json({
      success: true,
      data: sortedAnalysis,
      summary: {
        totalProducts: analysis.length,
        byStatus: {
          outOfStock: analysis.filter((p) => p.stockStatus === "out_of_stock")
            .length,
          critical: analysis.filter((p) => p.stockStatus === "critical").length,
          lowStock: analysis.filter((p) => p.stockStatus === "low_stock")
            .length,
          inStock: analysis.filter((p) => p.stockStatus === "in_stock").length,
        },
        reorderRecommendations: {
          immediate: analysis.filter(
            (p) => p.reorderRecommendation.urgency === "immediate"
          ).length,
          urgent: analysis.filter(
            (p) => p.reorderRecommendation.urgency === "urgent"
          ).length,
          soon: analysis.filter(
            (p) => p.reorderRecommendation.urgency === "soon"
          ).length,
        },
        thresholdSources: {
          AmountStockmintoReorder: analysis.filter(
            (p) => p.thresholdSource === "AmountStockmintoReorder"
          ).length,
          minimumOrder: analysis.filter(
            (p) => p.thresholdSource === "minimumOrder"
          ).length,
          default: analysis.filter((p) => p.thresholdSource === "default")
            .length,
        },
      },
    });
  } catch (err) {
    console.error("Error fetching inventory analysis:", err);
    res.status(500).json({
      success: false,
      message: "Server error while analyzing inventory",
      error: err.message,
    });
  }
});

// ─── HELPER FUNCTIONS ──────────────────────────────────────────────────────
function getStockStatusText(status) {
  const statusMap = {
    out_of_stock: "Out of Stock",
    critical: "Critical Low",
    low_stock: "Low Stock",
    in_stock: "In Stock",
  };
  return statusMap[status] || "Unknown";
}

function getStockPriority(status) {
  const priorityMap = {
    out_of_stock: "critical",
    critical: "critical",
    low_stock: "warning",
    in_stock: "good",
  };
  return priorityMap[status] || "unknown";
}

router.get("/parents", async (req, res) => {
  try {
    const parents = await Product.find({ productType: "Parent" })
      .select("productId productName brand")
      .sort({ productName: 1 });
    res.json({ success: true, count: parents.length, data: parents });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

router.get("/parents/search", async (req, res) => {
  try {
    const term = req.query.term || "";
    const regex = new RegExp(term, "i");
    const parents = await Product.find({
      productType: "Parent",
      $or: [{ productName: regex }, { productId: regex }],
    })
      .select("productId productName brand")
      .sort({ productName: 1 })
      .limit(10);
    res.json({ success: true, count: parents.length, data: parents });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    res.json({ success: true, data: p });
  } catch (err) {
    if (err.kind === "ObjectId")
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

router.get("/code/:productId", async (req, res) => {
  try {
    const p = await Product.findOne({ productId: req.params.productId });
    if (!p)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    res.json({ success: true, data: p });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// ─── NEW: FILL INVENTORY Endpoint ──────────────────────────────────────────
router.put("/fill-inventory/:id", async (req, res) => {
  try {
    const { fillQuantity } = req.body;

    // Validate fillQuantity
    if (!fillQuantity || isNaN(fillQuantity) || fillQuantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Fill quantity must be a positive number",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Calculate new Stock (current Stock + fill quantity)
    const currentStock = product.Stock || 0;
    const newStock = currentStock + parseInt(fillQuantity);

    // Update the product Stock
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        Stock: newStock,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    // Log the inventory fill action (optional - you can add this to a separate audit log)
    console.log(
      `Inventory filled: Product ${product.productId} (${product.productName}) - Added ${fillQuantity} units. Stock: ${currentStock} → ${newStock}`
    );

    res.json({
      success: true,
      message: `Successfully filled ${fillQuantity} units for ${product.productName}`,
      data: {
        productId: updatedProduct.productId,
        productName: updatedProduct.productName,
        previousStock: currentStock,
        filledQuantity: parseInt(fillQuantity),
        Stock: newStock,
      },
    });
  } catch (err) {
    console.error("Error filling inventory:", err);
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while filling inventory",
      error: err.message,
    });
  }
});

// ─── NEW: BULK FILL INVENTORY Endpoint ─────────────────────────────────────
router.put("/fill-inventory-bulk", async (req, res) => {
  try {
    const { fillData } = req.body; // Array of { productId, fillQuantity }

    if (!Array.isArray(fillData) || fillData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Fill data must be a non-empty array",
      });
    }

    const results = [];
    const errors = [];

    for (const item of fillData) {
      try {
        const { productId, fillQuantity } = item;

        if (
          !productId ||
          !fillQuantity ||
          isNaN(fillQuantity) ||
          fillQuantity <= 0
        ) {
          errors.push({
            productId: productId || "unknown",
            error: "Invalid product ID or fill quantity",
          });
          continue;
        }

        const product = await Product.findById(productId);
        if (!product) {
          errors.push({
            productId,
            error: "Product not found",
          });
          continue;
        }

        const currentStock = product.Stock || 0;
        const newStock = currentStock + parseInt(fillQuantity);

        const updatedProduct = await Product.findByIdAndUpdate(
          productId,
          {
            Stock: newStock,
            updatedAt: new Date(),
          },
          { new: true }
        );

        results.push({
          productId: updatedProduct.productId,
          productName: updatedProduct.productName,
          previousStock: currentStock,
          filledQuantity: parseInt(fillQuantity),
          newStock: newStock,
        });

        console.log(
          `Bulk inventory fill: Product ${product.productId} - Added ${fillQuantity} units. Stock: ${currentStock} → ${newStock}`
        );
      } catch (err) {
        errors.push({
          productId: item.productId || "unknown",
          error: err.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.length} products successfully${
        errors.length > 0 ? ` with ${errors.length} errors` : ""
      }`,
      data: {
        successful: results,
        errors: errors,
        totalProcessed: fillData.length,
        successCount: results.length,
        errorCount: errors.length,
      },
    });
  } catch (err) {
    console.error("Error in bulk inventory fill:", err);
    res.status(500).json({
      success: false,
      message: "Server error during bulk inventory fill",
      error: err.message,
    });
  }
});
// ✅ UPDATED: Out-of-stock endpoint - products that need reordering
router.get("/out-of-stock", async (req, res) => {
  try {
    console.log("🔍 Fetching out-of-stock products...");

    // Get all products and filter based on stock and active orders
    const products = await Product.find({})
      .select(
        "productId productName categories Stock NormalPrice AmountStockmintoReorder minimumOrder useAmountStockmintoReorder orderStock supplierName supplierEmail supplierPhone supplierAddress createdAt updatedAt"
      )
      .lean();

    console.log(
      `📦 Found ${products.length} products to check for reorder status`
    );

    // Filter products that actually need reordering
    const outOfStockProducts = products.filter((product) => {
      // Calculate reorder threshold
      let reorderThreshold = 5;
      if (
        product.useAmountStockmintoReorder &&
        product.AmountStockmintoReorder
      ) {
        reorderThreshold = product.AmountStockmintoReorder;
      } else if (product.minimumOrder) {
        reorderThreshold = product.minimumOrder;
      }

      const currentStock = product.Stock || 0;
      const needsReorder = currentStock <= reorderThreshold;

      // Check if product has active orders
      const hasActiveOrders =
        product.orderStock &&
        product.orderStock.some((order) =>
          ["order_placed", "order_confirmed"].includes(order.status)
        );

      // Only include if needs reorder AND doesn't have active orders
      return needsReorder && !hasActiveOrders;
    });

    console.log(
      `🚨 Found ${outOfStockProducts.length} products that need reordering`
    );

    // Process the results
    const processedProducts = outOfStockProducts.map((product) => {
      let reorderThreshold = 5;
      if (
        product.useAmountStockmintoReorder &&
        product.AmountStockmintoReorder
      ) {
        reorderThreshold = product.AmountStockmintoReorder;
      } else if (product.minimumOrder) {
        reorderThreshold = product.minimumOrder;
      }

      const currentStock = product.Stock || 0;
      const stockStatus = getStockStatus(currentStock, reorderThreshold);

      return {
        ...product,
        reorderThreshold,
        currentStock,
        stockStatus,
        isLowStock: currentStock <= reorderThreshold && currentStock > 0,
        isOutOfStock: currentStock === 0,
        isCritical: currentStock <= Math.ceil(reorderThreshold * 0.5),
        needsReorder: true,
        canBeOrdered: true,
        hasActiveOrders: false, // These products don't have active orders
      };
    });

    res.json({
      success: true,
      data: processedProducts,
      summary: {
        totalProducts: processedProducts.length,
        outOfStock: processedProducts.filter((p) => p.isOutOfStock).length,
        lowStock: processedProducts.filter((p) => p.isLowStock).length,
        critical: processedProducts.filter((p) => p.isCritical).length,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching out-of-stock products:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching out-of-stock products",
      error: err.message,
    });
  }
});

// ✅ FIXED: Dedicated endpoint for out-of-stock products (needs_reorder only)
router.get("/out-of-stock", async (req, res) => {
  try {
    console.log("🔍 Fetching out-of-stock products...");

    // Only get products that need reordering (exclude those with active orders)
    const products = await Product.find({
      stockOrderStatus: { $in: ["needs_reorder", null, undefined] }, // Include null/undefined for backward compatibility
    })
      .select(
        "productId productName categories Stock NormalPrice AmountStockmintoReorder minimumOrder useAmountStockmintoReorder stockOrderStatus supplierName supplierEmail supplierPhone supplierAddress createdAt updatedAt"
      )
      .lean();

    console.log(
      `📦 Found ${products.length} products to check for reorder status`
    );

    // Filter products that actually need reordering
    const outOfStockProducts = products.filter((product) => {
      let reorderThreshold = 5;

      if (
        product.useAmountStockmintoReorder &&
        product.AmountStockmintoReorder
      ) {
        reorderThreshold = product.AmountStockmintoReorder;
      } else if (product.minimumOrder) {
        reorderThreshold = product.minimumOrder;
      }

      const currentStock = product.Stock || 0;
      const needsReorder = currentStock <= reorderThreshold;

      return needsReorder;
    });

    console.log(
      `🚨 Found ${outOfStockProducts.length} products that need reordering`
    );

    // Process the results
    const processedProducts = outOfStockProducts.map((product) => {
      let reorderThreshold = 5;

      if (
        product.useAmountStockmintoReorder &&
        product.AmountStockmintoReorder
      ) {
        reorderThreshold = product.AmountStockmintoReorder;
      } else if (product.minimumOrder) {
        reorderThreshold = product.minimumOrder;
      }

      const currentStock = product.Stock || 0;
      const stockStatus = getStockStatus(currentStock, reorderThreshold);

      return {
        ...product,
        reorderThreshold,
        currentStock,
        stockStatus,
        isLowStock: currentStock <= reorderThreshold && currentStock > 0,
        isOutOfStock: currentStock === 0,
        isCritical: currentStock <= Math.ceil(reorderThreshold * 0.5),
        needsReorder: true,
        canBeOrdered: true, // These products can be ordered
      };
    });

    res.json({
      success: true,
      data: processedProducts,
      summary: {
        totalProducts: processedProducts.length,
        outOfStock: processedProducts.filter((p) => p.isOutOfStock).length,
        lowStock: processedProducts.filter((p) => p.isLowStock).length,
        critical: processedProducts.filter((p) => p.isCritical).length,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching out-of-stock products:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching out-of-stock products",
      error: err.message,
    });
  }
});

// ─── NEW: LOW Stock ALERT Endpoint ─────────────────────────────────────────
router.get("/alerts/low-Stock", async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 5; // Default threshold is 5 units

    const lowStockProducts = await Product.find({
      $or: [
        { Stock: { $lt: threshold } },
        { Stock: { $exists: false } },
        { Stock: null },
      ],
    })
      .select("productId productName Stock categories NormalPrice")
      .sort({ Stock: 1 });

    res.json({
      success: true,
      message: `Found ${lowStockProducts.length} products with low Stock (below ${threshold} units)`,
      data: lowStockProducts.map((product) => ({
        ...product.toObject(),
        Stock: product.Stock || 0,
        alertLevel: (product.Stock || 0) === 0 ? "critical" : "warning",
      })),
      count: lowStockProducts.length,
      threshold,
    });
  } catch (err) {
    console.error("Error fetching low Stock products:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching low Stock alerts",
      error: err.message,
    });
  }
});

// ─── 4) CREATE Endpoint with pricing sanitization ────────────────────────
router.post("/", async (req, res) => {
  try {
    const d = req.body;

    // 1) Child‐product shorthands:
    const productName =
      d.productType === "Child" ? d.varianceName : d.productName;
    const description =
      d.productType === "Child" ? d.subtitleDescription : d.description;

    // 2) Pricing fields
    const anyDiscount = parseOptionalNumber(d.anyDiscount);
    const NormalPrice = parseOptionalNumber(d.NormalPrice);
    const Stock = parseOptionalNumber(d.Stock);

    // 3) Parse specs/tags
    const specifications = d.specifications
      ? typeof d.specifications === "string"
        ? JSON.parse(d.specifications)
        : d.specifications
      : [];
    const tags = d.tags
      ? typeof d.tags === "string"
        ? JSON.parse(d.tags)
        : d.tags
      : [];

    // 4) Boolean flags
    const onceShare = d.onceShare === "true" || d.onceShare === true;
    const noChildHideParent =
      d.noChildHideParent === "true" || d.noChildHideParent === true;

    // 5) Inventory flags
    const useAmountStockmintoReorder =
      d.useAmountStockmintoReorder === "true" ||
      d.useAmountStockmintoReorder === true;
    const useSafetyDays =
      d.useSafetyDays === "true" || d.useSafetyDays === true;
    const noReorder = d.noReorder === "true" || d.noReorder === true;

    // 6) Build and save the document
    const product = new Product({
      productType: d.productType,
      productName,
      description,
      varianceName: d.varianceName,
      subtitleDescription: d.subtitleDescription,

      globalTradeItemNumber: d.globalTradeItemNumber,
      k3lNumber: d.k3lNumber,
      sniNumber: d.sniNumber,

      specifications,

      // Inventory
      Stock: parseOptionalNumber(d.Stock),
      minimumOrder: parseOptionalNumber(d.minimumOrder),
      useAmountStockmintoReorder,
      useSafetyDays,
      noReorder,
      AmountStockmintoReorder: parseOptionalNumber(d.AmountStockmintoReorder),
      safetyDays: parseOptionalNumber(d.safetyDays),
      safetyDaysStock: parseOptionalNumber(d.safetyDaysStock),
      deliveryDays: d.deliveryDays,
      deliveryTime: d.deliveryTime,
      reOrderSetting: d.reOrderSetting,
      inventoryInDays: d.inventoryInDays,
      deliveryPeriod: d.deliveryPeriod,
      orderTimeBackupInventory: d.orderTimeBackupInventory,

      alternateSupplier: d.alternateSupplier,
      supplierName: d.supplierName,
      supplierContact: d.supplierContact,
      supplierAddress: d.supplierAddress,
      supplierEmail: d.supplierEmail,
      supplierWebsite: d.supplierWebsite,
      supplierInformation: d.supplierInformation,

      // **Pricing**
      anyDiscount,
      NormalPrice,
      Stock,

      visibility: d.visibility,
      onceShare,
      noChildHideParent,

      categories: d.categories,
      subCategories: d.subCategories,
      tags,
      notes: d.notes,

      // Images
      masterImage: d.masterImage
        ? {
            data: Buffer.from(d.masterImage, "base64"),
            contentType: d.masterImageType,
          }
        : null,
      moreImages: Array.isArray(d.moreImages)
        ? d.moreImages.map((img) => ({
            data: Buffer.from(img.data, "base64"),
            contentType: img.contentType,
          }))
        : [],
    });

    await product.save();

    // 7) Extract weight from first specification
    const out = product.toObject();
    out.weight = out.specifications?.[0]?.weight ?? null;

    return res.status(201).json({ success: true, data: out });
  } catch (err) {
    console.error("Error saving product:", err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ─── UPDATE Endpoint ─────────────────────────────────────────────────────
router.put("/:id", uploadFields, async (req, res) => {
  try {
    const b = req.body;
    const updates = {};

    // 1) Child‐product shorthands
    if (b.productType === "Child") {
      if (b.varianceName !== undefined) {
        updates.productName = b.varianceName;
        updates.varianceName = b.varianceName;
      }
      if (b.subtitleDescription !== undefined) {
        updates.description = b.subtitleDescription;
        updates.subtitleDescription = b.subtitleDescription;
      }
    } else {
      if (b.productName !== undefined) updates.productName = b.productName;
      if (b.description !== undefined) updates.description = b.description;
    }

    // 2) Parse specs/tags
    if (b.specifications) {
      updates.specifications =
        typeof b.specifications === "string"
          ? JSON.parse(b.specifications)
          : b.specifications;
    }
    if (b.tags) {
      updates.tags = typeof b.tags === "string" ? JSON.parse(b.tags) : b.tags;
    }

    // 3) Boolean flags
    if (b.onceShare !== undefined) updates.onceShare = b.onceShare === "true";
    if (b.noChildHideParent !== undefined)
      updates.noChildHideParent = b.noChildHideParent === "true";

    // 4) Inventory flags & numbers
    if (b.useAmountStockmintoReorder !== undefined)
      updates.useAmountStockmintoReorder =
        b.useAmountStockmintoReorder === "true";
    if (b.useSafetyDays !== undefined)
      updates.useSafetyDays = b.useSafetyDays === "true";
    if (b.noReorder !== undefined) updates.noReorder = b.noReorder === "true";

    if (b.Stock !== undefined) updates.Stock = parseOptionalNumber(b.Stock);
    if (b.minimumOrder !== undefined)
      updates.minimumOrder = parseOptionalNumber(b.minimumOrder);
    if (b.AmountStockmintoReorder !== undefined)
      updates.AmountStockmintoReorder = parseOptionalNumber(
        b.AmountStockmintoReorder
      );
    if (b.safetyDays !== undefined)
      updates.safetyDays = parseOptionalNumber(b.safetyDays);
    if (b.safetyDaysStock !== undefined)
      updates.safetyDaysStock = parseOptionalNumber(b.safetyDaysStock);

    if (b.deliveryDays !== undefined) updates.deliveryDays = b.deliveryDays;
    if (b.deliveryTime !== undefined) updates.deliveryTime = b.deliveryTime;
    if (b.reOrderSetting !== undefined)
      updates.reOrderSetting = b.reOrderSetting;
    if (b.inventoryInDays !== undefined)
      updates.inventoryInDays = b.inventoryInDays;
    if (b.deliveryPeriod !== undefined)
      updates.deliveryPeriod = b.deliveryPeriod;
    if (b.orderTimeBackupInventory !== undefined)
      updates.orderTimeBackupInventory = b.orderTimeBackupInventory;

    // 5) Pricing
    if (b.anyDiscount !== undefined)
      updates.anyDiscount = parseOptionalNumber(b.anyDiscount);
    if (b.NormalPrice !== undefined)
      updates.NormalPrice = parseOptionalNumber(b.NormalPrice);
    if (b.Stock !== undefined) updates.Stock = parseOptionalNumber(b.Stock);

    // 6) Other string fields
    if (b.globalTradeItemNumber !== undefined)
      updates.globalTradeItemNumber = b.globalTradeItemNumber;
    if (b.k3lNumber !== undefined) updates.k3lNumber = b.k3lNumber;
    if (b.sniNumber !== undefined) updates.sniNumber = b.sniNumber;
    if (b.alternateSupplier !== undefined)
      updates.alternateSupplier = b.alternateSupplier;
    if (b.supplierName !== undefined) updates.supplierName = b.supplierName;
    if (b.supplierContact !== undefined)
      updates.supplierContact = b.supplierContact;
    if (b.supplierAddress !== undefined)
      updates.supplierAddress = b.supplierAddress;
    if (b.supplierEmail !== undefined) updates.supplierEmail = b.supplierEmail;
    if (b.supplierWebsite !== undefined)
      updates.supplierWebsite = b.supplierWebsite;
    if (b.supplierInformation !== undefined)
      updates.supplierInformation = b.supplierInformation;
    if (b.visibility !== undefined) updates.visibility = b.visibility;
    if (b.categories !== undefined) updates.categories = b.categories;
    if (b.subCategories !== undefined) updates.subCategories = b.subCategories;
    if (b.notes !== undefined) updates.notes = b.notes;

    // 7) Image uploads
    if (req.files.masterImage && req.files.masterImage[0]) {
      updates.masterImage = `/uploads/products/${req.files.masterImage[0].filename}`;
    }
    const mi = [];
    for (let i = 0; i < 6; i++) {
      const field = `moreImage${i}`;
      if (req.files[field] && req.files[field][0]) {
        mi[i] = `/uploads/products/${req.files[field][0].filename}`;
      }
    }
    if (mi.length) updates.moreImages = mi;

    // 8) Update & respond
    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const out = product.toObject();
    out.weight = out.specifications?.[0]?.weight ?? null;

    return res.json({ success: true, data: out });
  } catch (err) {
    console.error("Error updating product:", err);
    if (err.name === "ValidationError") {
      const msgs = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: msgs.join(", ") });
    }
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// ─── 6) DELETE ──────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    if (p.productType === "Parent") {
      const children = await Product.find({ parentProduct: p.productId });
      if (children.length)
        return res.status(400).json({
          success: false,
          message: "Cannot delete parent with children",
        });
    }

    // remove images from disk…
    if (p.masterImage) {
      const mp = path.join(__dirname, "../public", p.masterImage);
      if (fs.existsSync(mp)) fs.unlinkSync(mp);
    }
    (p.moreImages || []).forEach((imgPath) => {
      const full = path.join(__dirname, "../public", imgPath);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    });

    await p.remove();
    res.json({ success: true, data: {} });
  } catch (err) {
    if (err.kind === "ObjectId")
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// ─── 7) SEARCH / CATEGORY / TAG / CHILDREN ─────────────────────────────
router.get("/search/:term", async (req, res) => {
  try {
    const regex = new RegExp(req.params.term, "i");
    const products = await Product.find({
      $or: [
        { productName: regex },
        { productId: regex },
        { brand: regex },
        { tags: regex },
      ],
    }).sort({ createdAt: -1 });
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

router.get("/category/:category", async (req, res) => {
  try {
    const products = await Product.find({
      categories: req.params.category,
    }).sort({ createdAt: -1 });
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

router.get("/tag/:tag", async (req, res) => {
  try {
    const products = await Product.find({ tags: req.params.tag }).sort({
      createdAt: -1,
    });
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

router.get("/children/:parentId", async (req, res) => {
  try {
    const children = await Product.find({
      parentProduct: req.params.parentId,
      productType: "Child",
    }).sort({ createdAt: -1 });
    res.json({ success: true, count: children.length, data: children });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// ─── NEW: Stock CORRECTION Endpoint for Inventory Control ─────────────────
router.put("/correct-Stock/:id", async (req, res) => {
  try {
    const { Stock, notes } = req.body;

    // Validate Stock value
    if (Stock === undefined || Stock === null || isNaN(Stock) || Stock < 0) {
      return res.status(400).json({
        success: false,
        message: "Stock value must be a non-negative number",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const previousStock = product.Stock || 0;
    const newStock = parseInt(Stock);

    // Update the product Stock
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        Stock: newStock,
        updatedAt: new Date(),
        ...(notes && { StockCorrectionNotes: notes }),
      },
      { new: true, runValidators: true }
    );

    // Log the Stock correction (optional - you can add this to an audit log)
    console.log(
      `Stock corrected: Product ${product.productId} (${
        product.productName
      }) - Stock: ${previousStock} → ${newStock}${
        notes ? ` (Notes: ${notes})` : ""
      }`
    );

    res.json({
      success: true,
      message: `Stock corrected for ${product.productName}`,
      data: {
        productId: updatedProduct.productId,
        productName: updatedProduct.productName,
        previousStock,
        newStock,
        correctionDifference: newStock - previousStock,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Error correcting Stock:", err);
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while correcting Stock",
      error: err.message,
    });
  }
});

// ─── NEW: INVENTORY AUDIT LOG Endpoint ────────────────────────────────────
router.get("/audit/Stock-corrections", async (req, res) => {
  try {
    const { startDate, endDate, productId } = req.query;

    // This would typically query an audit log collection
    // For now, we'll return a simple response indicating the feature is available
    res.json({
      success: true,
      message: "Stock correction audit log endpoint ready",
      data: {
        note: "This endpoint can be expanded to track all Stock corrections with timestamps, user info, and reasons",
      },
    });
  } catch (err) {
    console.error("Error fetching audit log:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching audit log",
      error: err.message,
    });
  }
});

// Enhanced Stock correction with reasons for both increase and decrease
router.put("/correct-stock-with-reason/:id", async (req, res) => {
  try {
    const { Stock, reason, customReason, notes } = req.body;

    // Validate Stock value
    if (Stock === undefined || Stock === null || isNaN(Stock) || Stock < 0) {
      return res.status(400).json({
        success: false,
        message: "Stock value must be a non-negative number",
      });
    }

    // Validate reason
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Reason is required for stock correction",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const previousStock = product.Stock || 0;
    const newStock = parseInt(Stock);
    const stockDifference = newStock - previousStock;
    const correctionType =
      stockDifference > 0
        ? "increase"
        : stockDifference < 0
        ? "decrease"
        : "correction";

    // Prepare update object
    const updateData = {
      Stock: newStock,
      lastStockUpdate: new Date(),
      updatedAt: new Date(),
    };

    // Add to stock correction history
    const stockCorrectionEntry = {
      type: correctionType,
      amount: Math.abs(stockDifference),
      previousStock,
      newStock,
      reason: reason,
      customReason: reason === "Other" ? customReason : undefined,
      date: new Date(),
      correctedBy: req.user?.name || req.body.correctedBy || "Admin",
      notes:
        notes ||
        `Stock ${correctionType} via inventory control check - ${Math.abs(
          stockDifference
        )} units ${correctionType === "increase" ? "added" : "removed"}`,
    };

    updateData.$push = {
      stockCorrectionHistory: stockCorrectionEntry,
    };

    // Handle lost stock for decreases
    if (correctionType === "decrease") {
      const { additionalLostStock, lostReason } = req.body;
      const lostAmount =
        parseInt(additionalLostStock) || Math.abs(stockDifference);

      if (lostAmount > 0) {
        const previousLostStock = product.lostStock || 0;
        const newTotalLostStock = previousLostStock + lostAmount;

        updateData.lostStock = newTotalLostStock;

        const lostStockEntry = {
          amount: lostAmount,
          reason: lostReason || reason,
          customReason: lostReason === "Other" ? customReason : undefined,
          date: new Date(),
          correctedBy: req.user?.name || req.body.correctedBy || "Admin",
          originalStock: previousStock,
          correctedStock: newStock,
          lostStockChange: lostAmount,
          notes:
            notes ||
            `Stock reduced via inventory control - ${lostAmount} units lost due to ${
              lostReason || reason
            }`,
        };

        if (!updateData.$push) updateData.$push = {};
        updateData.$push.lostStockHistory = lostStockEntry;
      }
    }

    // Update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Log the correction
    console.log(`=== Stock Correction ===`);
    console.log(`Product: ${product.productId} (${product.productName})`);
    console.log(
      `Stock: ${previousStock} → ${newStock} (${
        stockDifference >= 0 ? "+" : ""
      }${stockDifference})`
    );
    console.log(`Type: ${correctionType}`);
    console.log(`Reason: ${reason === "Other" ? customReason : reason}`);
    if (correctionType === "decrease" && updateData.lostStock) {
      console.log(
        `Lost Stock Updated: ${product.lostStock || 0} → ${
          updateData.lostStock
        }`
      );
    }
    console.log(`========================`);

    res.json({
      success: true,
      message: `Stock ${correctionType} applied for ${
        product.productName
      }: ${previousStock} → ${newStock} units (${
        stockDifference >= 0 ? "+" : ""
      }${stockDifference})`,
      data: {
        productId: updatedProduct.productId,
        productName: updatedProduct.productName,
        previousStock,
        newStock,
        stockDifference,
        correctionType,
        reason: reason === "Other" ? customReason : reason,
        lostStockUpdated: correctionType === "decrease" && updateData.lostStock,
        totalLostStock: updatedProduct.lostStock || 0,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Error correcting stock:", err);
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while correcting stock",
      error: err.message,
    });
  }
});
// ============================================================================
// 3. ADDITIONAL USEFUL ENDPOINTS
// ============================================================================

// ─── UPDATED: Lost stock summary with proper threshold support ─────────────
router.get("/lost-stock/summary", async (req, res) => {
  try {
    const { startDate, endDate, reason, filter } = req.query;

    let query = {};

    if (filter === "has-loss") {
      query.lostStock = { $gt: 0 };
    }

    const products = await Product.find(query)
      .select(
        "productId productName categories Stock NormalPrice lostStock lostStockHistory AmountStockmintoReorder minimumOrder useAmountStockmintoReorder createdAt updatedAt"
      )
      .lean();

    const processedProducts = products.map((product) => {
      const lostStock = product.lostStock || 0;
      const estimatedValue = lostStock * (product.NormalPrice || 0);

      // Calculate proper threshold
      let reorderThreshold = 5;
      if (
        product.useAmountStockmintoReorder &&
        product.AmountStockmintoReorder
      ) {
        reorderThreshold = product.AmountStockmintoReorder;
      } else if (product.minimumOrder) {
        reorderThreshold = product.minimumOrder;
      }

      return {
        _id: product._id,
        productId: product.productId,
        productName: product.productName,
        categories: product.categories,
        Stock: product.Stock || 0,
        NormalPrice: product.NormalPrice || 0,
        totalLostStock: lostStock,
        lostStock: lostStock,
        estimatedValue: estimatedValue,
        lostStockHistory: product.lostStockHistory || [],
        reorderThreshold, // Include the calculated threshold
        stockStatus: getStockStatus(product.Stock || 0, reorderThreshold),
      };
    });

    const totalUnitsLost = processedProducts.reduce(
      (sum, item) => sum + (item.totalLostStock || 0),
      0
    );
    const totalEstimatedValue = processedProducts.reduce(
      (sum, item) => sum + (item.estimatedValue || 0),
      0
    );

    res.json({
      success: true,
      data: {
        summary: {
          totalProducts: processedProducts.length,
          totalUnitsLost,
          totalEstimatedValue: parseFloat(totalEstimatedValue.toFixed(2)),
          dateRange: { startDate, endDate },
          reasonFilter: reason,
          filter: filter,
        },
        products: processedProducts,
      },
    });
  } catch (err) {
    console.error("Error fetching lost stock summary:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching lost stock summary",
      error: err.message,
    });
  }
});
// ─── UPDATED: Update product with AmountStockmintoReorder support ──────────
router.put("/update-threshold/:id", async (req, res) => {
  try {
    const { AmountStockmintoReorder, useAmountStockmintoReorder, notes } =
      req.body;

    // Validate threshold value
    if (
      AmountStockmintoReorder !== undefined &&
      (isNaN(AmountStockmintoReorder) || AmountStockmintoReorder < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "AmountStockmintoReorder must be a non-negative number",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const previousThreshold = product.AmountStockmintoReorder || 0;
    const previousUseFlag = product.useAmountStockmintoReorder || false;

    // Prepare update object
    const updateData = {
      updatedAt: new Date(),
    };

    if (AmountStockmintoReorder !== undefined) {
      updateData.AmountStockmintoReorder = parseInt(AmountStockmintoReorder);
    }

    if (useAmountStockmintoReorder !== undefined) {
      updateData.useAmountStockmintoReorder = Boolean(
        useAmountStockmintoReorder
      );
    }

    if (notes) {
      updateData.notes = notes;
    }

    // Update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Calculate new stock status with updated threshold
    const newThreshold =
      updatedProduct.useAmountStockmintoReorder &&
      updatedProduct.AmountStockmintoReorder
        ? updatedProduct.AmountStockmintoReorder
        : updatedProduct.minimumOrder || 5;

    const stockStatus = getStockStatus(updatedProduct.Stock || 0, newThreshold);

    // Log the update
    console.log(
      `Threshold updated: Product ${product.productId} (${product.productName})`
    );
    console.log(
      `- AmountStockmintoReorder: ${previousThreshold} → ${updatedProduct.AmountStockmintoReorder}`
    );
    console.log(
      `- useAmountStockmintoReorder: ${previousUseFlag} → ${updatedProduct.useAmountStockmintoReorder}`
    );
    console.log(`- New effective threshold: ${newThreshold}`);
    console.log(`- Stock status: ${getStockStatusText(stockStatus)}`);

    res.json({
      success: true,
      message: `Reorder threshold updated for ${product.productName}`,
      data: {
        productId: updatedProduct.productId,
        productName: updatedProduct.productName,
        previousThreshold,
        newThreshold: updatedProduct.AmountStockmintoReorder,
        useAmountStockmintoReorder: updatedProduct.useAmountStockmintoReorder,
        effectiveThreshold: newThreshold,
        currentStock: updatedProduct.Stock,
        stockStatus: getStockStatusText(stockStatus),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Error updating threshold:", err);
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while updating threshold",
      error: err.message,
    });
  }
});
// ─── NEW: Update lost stock with full functionality ────────────────────────
router.put("/update-lost-stock/:id", async (req, res) => {
  try {
    const { lostStock, reason, customReason, notes } = req.body;

    // Validate lostStock value
    if (
      lostStock === undefined ||
      lostStock === null ||
      isNaN(lostStock) ||
      lostStock < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Lost stock value must be a non-negative number",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const previousLostStock = product.lostStock || 0;
    const previousStock = product.Stock || 0;
    const newLostStock = parseInt(lostStock);
    const lostStockDifference = newLostStock - previousLostStock;

    // ✅ Calculate new Stock based on lost stock changes
    const newStock = Math.max(0, previousStock - lostStockDifference);

    // Prepare update object
    const updateData = {
      lostStock: newLostStock,
      Stock: newStock,
      lastStockUpdate: new Date(),
      updatedAt: new Date(),
    };

    // Add to lost stock history for any change (increase or decrease)
    if (lostStockDifference !== 0) {
      const finalReason =
        reason === "Other" ? customReason || "Manual adjustment" : reason;

      const lostStockEntry = {
        amount: Math.abs(lostStockDifference),
        reason: finalReason,
        customReason: reason === "Other" ? customReason : undefined,
        date: new Date(),
        correctedBy: req.user?.name || req.body.correctedBy || "Admin",
        originalStock: previousStock,
        correctedStock: newStock,
        lostStockChange: lostStockDifference,
        notes:
          notes ||
          `Lost stock ${
            lostStockDifference > 0 ? "increased" : "decreased"
          } by ${Math.abs(
            lostStockDifference
          )} units via Lost Stock Management. Stock adjusted from ${previousStock} to ${newStock} units. Reason: ${finalReason}`,
      };

      updateData.$push = {
        lostStockHistory: lostStockEntry,
      };
    }

    // Update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Enhanced logging
    console.log(`=== Lost Stock Update ===`);
    console.log(`Product: ${product.productId} (${product.productName})`);
    console.log(
      `Lost Stock: ${previousLostStock} → ${newLostStock} (${
        lostStockDifference >= 0 ? "+" : ""
      }${lostStockDifference})`
    );
    console.log(
      `Actual Stock: ${previousStock} → ${newStock} (${
        newStock - previousStock >= 0 ? "+" : ""
      }${newStock - previousStock})`
    );
    if (reason)
      console.log(`Reason: ${reason === "Other" ? customReason : reason}`);
    console.log(`========================`);

    res.json({
      success: true,
      message: `Lost stock updated for ${product.productName}. ${
        lostStockDifference > 0 ? "Increased" : "Decreased"
      } by ${Math.abs(
        lostStockDifference
      )} units. Stock adjusted from ${previousStock} to ${newStock} units.`,
      data: {
        productId: updatedProduct.productId,
        productName: updatedProduct.productName,
        previousLostStock,
        newLostStock,
        lostStockDifference,
        previousStock,
        newStock,
        stockDifference: newStock - previousStock,
        reason: reason === "Other" ? customReason : reason,
        timestamp: new Date().toISOString(),
        updatedProduct: {
          Stock: updatedProduct.Stock,
          lostStock: updatedProduct.lostStock,
          totalLostStock: updatedProduct.lostStock,
        },
      },
    });
  } catch (err) {
    console.error("Error updating lost stock:", err);
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while updating lost stock",
      error: err.message,
    });
  }
});

// ─── ENHANCED: Stock correction with lost stock tracking ───────────────────
router.put("/correct-stock-with-loss/:id", async (req, res) => {
  try {
    const { Stock, additionalLostStock, lostReason, customReason, notes } =
      req.body;

    // Validate Stock value
    if (Stock === undefined || Stock === null || isNaN(Stock) || Stock < 0) {
      return res.status(400).json({
        success: false,
        message: "Stock value must be a non-negative number",
      });
    }

    // Validate lost stock if provided
    const lostAmount = parseInt(additionalLostStock) || 0;
    if (lostAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "Lost stock amount cannot be negative",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const previousStock = product.Stock || 0;
    const newStock = parseInt(Stock);
    const previousLostStock = product.lostStock || 0;
    const newTotalLostStock = previousLostStock + lostAmount;

    // Prepare update object
    const updateData = {
      Stock: newStock,
      lostStock: newTotalLostStock,
      lastStockUpdate: new Date(),
      updatedAt: new Date(),
    };

    // Add to lost stock history if there's a loss
    if (lostAmount > 0) {
      const finalReason =
        lostReason === "Other"
          ? customReason || "Stock reduction - inventory correction"
          : lostReason || "Stock reduction - inventory correction";

      const lostStockEntry = {
        amount: lostAmount,
        reason: finalReason,
        customReason: lostReason === "Other" ? customReason : undefined,
        date: new Date(),
        correctedBy: req.user?.name || req.body.correctedBy || "Admin",
        originalStock: previousStock,
        correctedStock: newStock,
        lostStockChange: lostAmount,
        notes:
          notes ||
          `Stock corrected via inventory control - ${lostAmount} units lost due to ${finalReason}`,
      };

      updateData.$push = {
        lostStockHistory: lostStockEntry,
      };
    }

    // Update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Log the correction with lost stock details
    console.log(`=== Stock Correction with Loss Tracking ===`);
    console.log(`Product: ${product.productId} (${product.productName})`);
    console.log(`Stock: ${previousStock} → ${newStock}`);
    console.log(
      `Lost Stock: +${lostAmount} units (Reason: ${
        lostReason || "Not specified"
      })`
    );
    console.log(
      `Total Lost Stock: ${previousLostStock} → ${newTotalLostStock}`
    );
    console.log(`==========================================`);

    res.json({
      success: true,
      message: `Stock corrected for ${product.productName}${
        lostAmount > 0 ? ` with ${lostAmount} units tracked as lost` : ""
      }`,
      data: {
        productId: updatedProduct.productId,
        productName: updatedProduct.productName,
        previousStock,
        newStock,
        stockDifference: newStock - previousStock,
        lostStockAdded: lostAmount,
        totalLostStock: newTotalLostStock,
        lostReason: lostReason || "Not specified",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Error correcting stock with loss tracking:", err);
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while correcting stock",
      error: err.message,
    });
  }
});

// ─── ENHANCED: Get lost stock history for a specific product ───────────────
router.get("/:id/lost-stock-history", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select(
      "productId productName Stock lostStock lostStockHistory categories NormalPrice lastStockUpdate"
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Sort history by date (newest first)
    const sortedHistory = (product.lostStockHistory || []).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    // Calculate statistics
    const totalLossEvents = sortedHistory.length;
    const totalUnitsLostFromHistory = sortedHistory.reduce((sum, entry) => {
      return sum + (entry.lostStockChange > 0 ? entry.amount : 0);
    }, 0);

    res.json({
      success: true,
      data: {
        productInfo: {
          productId: product.productId,
          productName: product.productName,
          Stock: product.Stock || 0,
          categories: product.categories,
          NormalPrice: product.NormalPrice || 0,
          currentLostStock: product.lostStock || 0,
          estimatedLossValue: (
            (product.lostStock || 0) * (product.NormalPrice || 0)
          ).toFixed(2),
          lastStockUpdate: product.lastStockUpdate,
        },
        statistics: {
          totalLossEvents,
          totalUnitsLostFromHistory,
          averageLossPerEvent:
            totalLossEvents > 0
              ? (totalUnitsLostFromHistory / totalLossEvents).toFixed(2)
              : 0,
        },
        lostStockHistory: sortedHistory,
        totalEntries: sortedHistory.length,
      },
    });
  } catch (err) {
    console.error("Error fetching product lost stock history:", err);
    if (err.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while fetching lost stock history",
      error: err.message,
    });
  }
});

// ─── NEW: Get lost stock analytics ─────────────────────────────────────────
router.get("/lost-stock/analytics", async (req, res) => {
  try {
    const { period = "30" } = req.query; // Days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const analytics = await Product.aggregate([
      {
        $match: {
          lostStock: { $gt: 0 },
        },
      },
      {
        $unwind: {
          path: "$lostStockHistory",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          "lostStockHistory.date": { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$lostStockHistory.reason",
          totalAmount: { $sum: "$lostStockHistory.amount" },
          count: { $sum: 1 },
          averageAmount: { $avg: "$lostStockHistory.amount" },
        },
      },
      {
        $sort: { totalAmount: -1 },
      },
    ]);

    res.json({
      success: true,
      data: {
        period: `${period} days`,
        analytics,
        summary: {
          totalReasons: analytics.length,
          totalUnitsLost: analytics.reduce(
            (sum, item) => sum + item.totalAmount,
            0
          ),
          totalEvents: analytics.reduce((sum, item) => sum + item.count, 0),
        },
      },
    });
  } catch (err) {
    console.error("Error fetching lost stock analytics:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching analytics",
      error: err.message,
    });
  }
});

module.exports = router;

// ============================================================================
// 3. UPDATED LOST STOCK MANAGEMENT COMPONENT - Frontend Changes
// ============================================================================

// Update the applyLostStockUpdate function in your Lost Stock Management component:

const applyLostStockUpdate = async () => {
  const {
    productId,
    newLostStock,
    reason,
    customReason,
    isIncrease,
    difference,
  } = lostStockDialog;

  if (isIncrease && difference > 0 && !reason) {
    alert("Please select a reason for the lost stock increase.");
    return;
  }

  try {
    const possibleEndpoints = [
      `/api/products/update-lost-stock/${productId}`,
      `/api/product/update-lost-stock/${productId}`,
      `http://localhost:5000/api/products/update-lost-stock/${productId}`,
      `http://localhost:3001/api/products/update-lost-stock/${productId}`,
      `http://localhost:8000/api/products/update-lost-stock/${productId}`,
    ];

    let response;
    let workingEndpoint = null;

    for (const endpoint of possibleEndpoints) {
      try {
        response = await fetch(endpoint, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lostStock: newLostStock,
            reason: reason || "Manual adjustment",
            customReason: reason === "Other" ? customReason : undefined,
            notes: `Lost stock updated via Lost Stock Management - ${
              isIncrease ? "Increased" : "Decreased"
            } by ${difference} units`,
          }),
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            workingEndpoint = endpoint;
            break;
          }
        }
      } catch (endpointError) {
        continue;
      }
    }

    if (workingEndpoint) {
      const data = await response.json();
      if (data.success) {
        // ✅ Update local state with both stock and lost stock values
        setProducts((prev) =>
          prev.map((p) =>
            p._id === productId
              ? {
                  ...p,
                  totalLostStock: data.data.newLostStock,
                  lostStock: data.data.newLostStock,
                  Stock: data.data.newStock, // ✅ Update actual stock
                  estimatedValue: data.data.newLostStock * (p.NormalPrice || 0),
                }
              : p
          )
        );

        setSuccessMessage(
          `✅ ${data.message} | Lost Stock: ${data.data.previousLostStock} → ${data.data.newLostStock} units | Current Stock: ${data.data.previousStock} → ${data.data.newStock} units`
        );
      } else {
        throw new Error(data.message || "Failed to update lost stock");
      }
    } else {
      // Simulate update for development
      setProducts((prev) =>
        prev.map((p) =>
          p._id === productId
            ? {
                ...p,
                totalLostStock: newLostStock,
                lostStock: newLostStock,
                Stock: Math.max(
                  0,
                  (p.Stock || 0) - (isIncrease ? difference : -difference)
                ),
                estimatedValue: newLostStock * (p.NormalPrice || 0),
              }
            : p
        )
      );

      setSuccessMessage(
        `✅ Lost stock updated for ${lostStockDialog.productName}: ${lostStockDialog.currentLostStock} → ${newLostStock} units [Simulated - API not connected]`
      );
    }

    closeLostStockDialog();
    setTimeout(() => setSuccessMessage(""), 6000);
  } catch (err) {
    setError(`❌ Error updating lost stock: ${err.message}`);
    setTimeout(() => setError(""), 5000);
  }
};

// Add these routes to your existing products router

// ✅ UPDATED: Add order endpoint - creates order in orderStock array with status
router.post("/:id/add-order", async (req, res) => {
  try {
    const {
      orderQuantity,
      approvedSupplier,
      selectedSupplierId,
      supplierEmail,
      supplierPhone,
      supplierAddress,
      currentStock,
      reorderThreshold,
      estimatedCost,
      notes,
      requestedBy,
      priority = "medium",
    } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    console.log(`🔄 Adding order for product: ${product.productId}`);

    // Check if product already has active orders
    const hasActiveOrders =
      product.orderStock &&
      product.orderStock.some((order) =>
        ["order_placed", "order_confirmed"].includes(order.status)
      );

    if (hasActiveOrders) {
      return res.status(400).json({
        success: false,
        message: `Product already has active orders`,
      });
    }

    // Create order entry for the orderStock array
    const orderEntry = {
      orderQuantity: parseInt(orderQuantity),
      approvedSupplier,
      selectedSupplierId: selectedSupplierId || null,
      supplierEmail,
      supplierPhone,
      supplierAddress,
      currentStock: parseInt(currentStock),
      reorderThreshold: parseInt(reorderThreshold),
      estimatedCost: parseFloat(estimatedCost) || 0,
      notes,
      requestedBy: requestedBy || "Admin",
      requestedAt: new Date(),
      orderPlacedAt: new Date(),
      priority,
      status: "order_placed", // ✅ Individual order status
    };

    // Add to orderStock array
    if (!product.orderStock) {
      product.orderStock = [];
    }
    product.orderStock.push(orderEntry);

    // Save the product (pre-save hook will update quick access fields)
    const savedProduct = await product.save();

    console.log(
      `✅ Order added successfully for product: ${savedProduct.productId}`
    );
    console.log(
      `📦 OrderStock array now has ${savedProduct.orderStock.length} entries`
    );

    res.status(201).json({
      success: true,
      message: "Order moved to order list successfully",
      data: {
        productId: savedProduct.productId,
        productName: savedProduct.productName,
        orderEntry: savedProduct.orderStock[savedProduct.orderStock.length - 1],
        totalOrders: savedProduct.orderStock.length,
        overallStatus: savedProduct.getOverallOrderStatus(),
      },
    });
  } catch (error) {
    console.error("❌ Error adding order:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// Get all products with pending orders (for Order List page)
router.get("/pending-orders", async (req, res) => {
  try {
    const products = await Product.find({
      stockOrderStatus: "pending_order",
    })
      .populate("orderStock.selectedSupplierId", "name email phone address")
      .sort({ lastOrderDate: -1 });

    // Filter and format the response
    const pendingOrders = products
      .map((product) => {
        const pendingOrdersOnly = product.orderStock.filter(
          (order) => order.status === "pending_order"
        );

        return {
          ...product.toObject(),
          orderStock: pendingOrdersOnly,
        };
      })
      .filter((product) => product.orderStock.length > 0);

    res.status(200).json({
      success: true,
      count: pendingOrders.length,
      data: pendingOrders,
    });
  } catch (error) {
    console.error("Error fetching pending orders:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// ✅ UPDATED: Order list endpoint - individual orders with their own status
router.get("/order-list", async (req, res) => {
  try {
    console.log("🔍 Fetching order list...");

    // Find products that have orders in their orderStock array
    const products = await Product.find({
      "orderStock.0": { $exists: true }, // Has at least one order
    })
      .select(
        "productId productName categories Stock NormalPrice AmountStockmintoReorder minimumOrder useAmountStockmintoReorder orderStock supplierName supplierEmail supplierPhone supplierAddress createdAt updatedAt"
      )
      .lean();

    console.log(`📋 Found ${products.length} products with orders`);

    // Transform each order in orderStock arrays into individual order entries
    const allOrders = [];

    products.forEach((product) => {
      // Calculate proper threshold for this product
      let reorderThreshold = 5;
      if (
        product.useAmountStockmintoReorder &&
        product.AmountStockmintoReorder
      ) {
        reorderThreshold = product.AmountStockmintoReorder;
      } else if (product.minimumOrder) {
        reorderThreshold = product.minimumOrder;
      }

      // Process each order in the orderStock array
      if (product.orderStock && product.orderStock.length > 0) {
        product.orderStock.forEach((order) => {
          // Only include active orders (not cancelled or delivered)
          if (
            ["order_placed", "order_confirmed", "pending"].includes(
              order.status
            )
          ) {
            const orderEntry = {
              _id: order._id,
              orderId: order._id,
              productDbId: product._id,
              productId: product.productId,
              productName: product.productName,
              categories: product.categories,

              // Stock information
              currentQty: product.Stock || 0,
              reorderThreshold,

              // Order details from the orderStock entry
              orderQuantity: order.orderQuantity || 0,
              approvedSupplier:
                order.approvedSupplier || product.supplierName || "Not Set",
              supplierEmail: order.supplierEmail || product.supplierEmail || "",
              supplierPhone: order.supplierPhone || product.supplierPhone || "",
              supplierAddress:
                order.supplierAddress || product.supplierAddress || "",
              estimatedCost: order.estimatedCost || 0,
              notes: order.notes || "",
              priority: order.priority || "medium",

              // ✅ INDIVIDUAL ORDER STATUS
              status: order.status,

              // Timing information
              requestedAt: order.requestedAt || new Date(),
              requestedBy: order.requestedBy || "Admin",
              orderPlacedAt: order.orderPlacedAt,
              orderConfirmedAt: order.orderConfirmedAt,
              estimatedDeliveryDate: order.estimatedDeliveryDate,
              actualDeliveryDate: order.actualDeliveryDate,
              orderNumber: order.orderNumber,

              // Approval information
              approvedBy: order.approvedBy,
              approvedAt: order.approvedAt,

              // Additional product info
              price: product.NormalPrice || 0,

              // Status flags for easy filtering
              isOrderPlaced: order.status === "order_placed",
              isConfirmed: order.status === "order_confirmed",
              isPending: order.status === "pending",

              // Supplier reference
              selectedSupplierId: order.selectedSupplierId,
            };

            allOrders.push(orderEntry);
          }
        });
      }
    });

    // Sort orders by most recent first
    const sortedOrders = allOrders.sort(
      (a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)
    );

    // Calculate summary statistics
    const summary = {
      totalOrders: sortedOrders.length,
      totalProducts: products.length,
      pending: sortedOrders.filter((o) => o.isPending).length,
      orderPlaced: sortedOrders.filter((o) => o.isOrderPlaced).length,
      confirmed: sortedOrders.filter((o) => o.isConfirmed).length,
      totalOrderValue: sortedOrders.reduce(
        (sum, order) => sum + (order.estimatedCost || 0),
        0
      ),
    };

    console.log(`📊 Order List Summary:`, summary);

    res.json({
      success: true,
      data: sortedOrders,
      summary,
    });
  } catch (err) {
    console.error("❌ Error fetching order list:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching order list",
      error: err.message,
    });
  }
});

// Get all products with order_placed status (for Order List page)
router.get("/order-placed", async (req, res) => {
  try {
    const products = await Product.find({
      stockOrderStatus: "order_placed",
    })
      .populate("orderStock.selectedSupplierId", "name email phone address")
      .sort({ lastOrderDate: -1 });

    // Filter and format the response
    const orderPlacedProducts = products
      .map((product) => {
        const orderPlacedOnly = product.orderStock.filter(
          (order) => order.status === "order_placed"
        );

        return {
          ...product.toObject(),
          orderStock: orderPlacedOnly,
        };
      })
      .filter((product) => product.orderStock.length > 0);

    res.status(200).json({
      success: true,
      count: orderPlacedProducts.length,
      data: orderPlacedProducts,
    });
  } catch (error) {
    console.error("Error fetching order placed products:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// ✅ UPDATED: Update individual order status
router.patch("/:productId/order/:orderId/status", async (req, res) => {
  try {
    const { productId, orderId } = req.params;
    const { status, approvedBy, orderNumber, estimatedDeliveryDate } = req.body;

    const validStatuses = [
      "pending",
      "order_placed",
      "order_confirmed",
      "delivered",
      "cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Find and update the specific order
    const orderIndex = product.orderStock.findIndex(
      (order) => order._id.toString() === orderId
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Update order status
    product.orderStock[orderIndex].status = status;

    // Update relevant fields based on status
    if (status === "order_confirmed") {
      product.orderStock[orderIndex].orderConfirmedAt = new Date();
      if (approvedBy) {
        product.orderStock[orderIndex].approvedBy = approvedBy;
        product.orderStock[orderIndex].approvedAt = new Date();
      }
      if (estimatedDeliveryDate) {
        product.orderStock[orderIndex].estimatedDeliveryDate = new Date(
          estimatedDeliveryDate
        );
      }
    }

    if (status === "delivered") {
      product.orderStock[orderIndex].actualDeliveryDate = new Date();
      // Update actual stock when delivered
      product.Stock =
        (product.Stock || 0) + product.orderStock[orderIndex].orderQuantity;
    }

    if (status === "cancelled") {
      product.orderStock[orderIndex].cancelledAt = new Date();
    }

    if (orderNumber) {
      product.orderStock[orderIndex].orderNumber = orderNumber;
    }

    await product.save();

    console.log(`🔄 Updated order ${orderId} status to: ${status}`);

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: {
        orderId,
        productId: product.productId,
        status,
        orderEntry: product.orderStock[orderIndex],
        overallStatus: product.getOverallOrderStatus(),
      },
    });
  } catch (error) {
    console.error("❌ Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// Update product order status
router.patch("/:id/update-order-status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      "needs_reorder",
      "pending_order",
      "order_confirmed",
      "order_delivered",
      "order_cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Update product status
    product.stockOrderStatus = status;

    // Update related fields based on status
    if (status === "needs_reorder") {
      product.hasPendingOrders = false;
      product.totalPendingOrderQuantity = 0;
    } else if (status === "pending_order") {
      product.hasPendingOrders = true;
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product status updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error updating product status:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// ✅ CORRECTED: Remove from order list - properly handles orderStock array
router.patch("/:id/remove-from-order", async (req, res) => {
  try {
    const { orderId } = req.body; // Optional: remove specific order

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.stockOrderStatus !== "order_placed") {
      return res.status(400).json({
        success: false,
        message: "Product is not in order list or already confirmed",
      });
    }

    // If specific orderId provided, remove that order; otherwise remove all
    if (orderId) {
      product.orderStock = product.orderStock.filter(
        (order) => order._id.toString() !== orderId
      );
    } else {
      // Remove all orders
      product.orderStock = [];
    }

    // Reset product status if no orders remain
    if (product.orderStock.length === 0) {
      product.stockOrderStatus = "needs_reorder";
      product.hasPendingOrders = false;
      product.totalPendingOrderQuantity = 0;
    } else {
      // Recalculate quantities if some orders remain
      product.totalPendingOrderQuantity = product.orderStock.reduce(
        (sum, order) => sum + order.orderQuantity,
        0
      );
    }

    await product.save();

    console.log(
      `🔄 Product ${product.productId} status reset to: ${product.stockOrderStatus}`
    );
    console.log(
      `📦 OrderStock array now has ${product.orderStock.length} entries`
    );

    res.status(200).json({
      success: true,
      message: "Product removed from order list successfully",
      data: {
        productId: product.productId,
        stockOrderStatus: product.stockOrderStatus,
        remainingOrders: product.orderStock.length,
      },
    });
  } catch (error) {
    console.error("❌ Error removing product from order list:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// ✅ UPDATED: Remove specific order from orderStock array
router.delete("/:productId/order/:orderId", async (req, res) => {
  try {
    const { productId, orderId } = req.params;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Find and remove the specific order
    const initialOrderCount = product.orderStock.length;
    product.orderStock = product.orderStock.filter(
      (order) => order._id.toString() !== orderId
    );

    if (product.orderStock.length === initialOrderCount) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    await product.save();

    console.log(
      `🗑️ Removed order ${orderId} from product ${product.productId}`
    );
    console.log(
      `📦 OrderStock array now has ${product.orderStock.length} entries`
    );

    res.status(200).json({
      success: true,
      message: "Order removed successfully",
      data: {
        productId: product.productId,
        remainingOrders: product.orderStock.length,
        overallStatus: product.getOverallOrderStatus(),
      },
    });
  } catch (error) {
    console.error("❌ Error removing order:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// Get order history for a product
router.get("/:id/order-history", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("orderStock.selectedSupplierId", "name email phone address")
      .select("productId productName orderStock");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        productId: product.productId,
        productName: product.productName,
        orders: product.orderStock.sort(
          (a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)
        ),
      },
    });
  } catch (error) {
    console.error("Error fetching order history:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// ✅ NEW: Individual order confirmation route
router.patch("/:productId/order/:orderId/status", async (req, res) => {
  try {
    const { productId, orderId } = req.params;
    const { status, approvedBy, orderNumber, estimatedDeliveryDate } = req.body;

    const validStatuses = [
      "pending",
      "order_placed",
      "order_confirmed",
      "delivered",
      "cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Find and update the specific order
    const orderIndex = product.orderStock.findIndex(
      (order) => order._id.toString() === orderId
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Update order status
    product.orderStock[orderIndex].status = status;

    // Update relevant fields based on status
    if (status === "order_confirmed") {
      product.orderStock[orderIndex].orderConfirmedAt = new Date();
      if (approvedBy) {
        product.orderStock[orderIndex].approvedBy = approvedBy;
        product.orderStock[orderIndex].approvedAt = new Date();
      }
      if (estimatedDeliveryDate) {
        product.orderStock[orderIndex].estimatedDeliveryDate = new Date(
          estimatedDeliveryDate
        );
      }
      if (orderNumber) {
        product.orderStock[orderIndex].orderNumber = orderNumber;
      }
    }

    if (status === "delivered") {
      product.orderStock[orderIndex].actualDeliveryDate = new Date();
      // Update actual stock when delivered
      product.Stock =
        (product.Stock || 0) + product.orderStock[orderIndex].orderQuantity;
    }

    if (status === "cancelled") {
      product.orderStock[orderIndex].cancelledAt = new Date();
    }

    await product.save();

    console.log(`🔄 Updated order ${orderId} status to: ${status}`);

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: {
        orderId,
        productId: product.productId,
        status,
        orderEntry: product.orderStock[orderIndex],
        overallStatus: product.getOverallOrderStatus(),
      },
    });
  } catch (error) {
    console.error("❌ Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// ✅ UPDATED: Bulk confirm orders (improved version)
router.patch("/bulk-confirm-orders", async (req, res) => {
  try {
    const { orders, approvedBy } = req.body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Orders array is required",
      });
    }

    let updateCount = 0;
    const errors = [];
    const successfulOrders = [];

    for (const orderInfo of orders) {
      try {
        const { productId, orderId } = orderInfo;

        const product = await Product.findById(productId);
        if (!product) {
          errors.push(`Product ${productId} not found`);
          continue;
        }

        // Find and update the specific order
        const orderIndex = product.orderStock.findIndex(
          (order) => order._id.toString() === orderId
        );

        if (orderIndex === -1) {
          errors.push(`Order ${orderId} not found in product ${productId}`);
          continue;
        }

        // Update order status to confirmed
        product.orderStock[orderIndex].status = "order_confirmed";
        product.orderStock[orderIndex].orderConfirmedAt = new Date();

        if (approvedBy) {
          product.orderStock[orderIndex].approvedBy = approvedBy;
          product.orderStock[orderIndex].approvedAt = new Date();
        }

        // Add order number if not exists
        if (!product.orderStock[orderIndex].orderNumber) {
          product.orderStock[
            orderIndex
          ].orderNumber = `ORD-${Date.now()}-${orderIndex}`;
        }

        // Set estimated delivery date (7 days from now)
        if (!product.orderStock[orderIndex].estimatedDeliveryDate) {
          product.orderStock[orderIndex].estimatedDeliveryDate = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          );
        }

        await product.save();
        updateCount++;

        successfulOrders.push({
          orderId,
          productId: product.productId,
          productName: product.productName,
          status: "order_confirmed",
        });

        console.log(
          `✅ Confirmed order ${orderId} for product ${product.productId}`
        );
      } catch (err) {
        errors.push(
          `Error updating order ${orderInfo.orderId}: ${err.message}`
        );
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully confirmed ${updateCount} orders`,
      updateCount,
      successfulOrders,
      errors: errors.length > 0 ? errors : undefined,
      totalProcessed: orders.length,
    });
  } catch (error) {
    console.error("❌ Error bulk confirming orders:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// ✅ BONUS: Get all orders with specific status
router.get("/orders/by-status/:status", async (req, res) => {
  try {
    const { status } = req.params;

    const validStatuses = [
      "pending",
      "order_placed",
      "order_confirmed",
      "delivered",
      "cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const products = await Product.find({
      "orderStock.0": { $exists: true }, // Has at least one order
    })
      .select(
        "productId productName categories Stock NormalPrice AmountStockmintoReorder orderStock supplierName supplierEmail supplierPhone supplierAddress"
      )
      .lean();

    const filteredOrders = [];

    products.forEach((product) => {
      if (product.orderStock && product.orderStock.length > 0) {
        product.orderStock.forEach((order) => {
          if (order.status === status) {
            filteredOrders.push({
              _id: order._id,
              orderId: order._id,
              productDbId: product._id,
              productId: product.productId,
              productName: product.productName,
              categories: product.categories,
              currentQty: product.Stock || 0,
              reorderThreshold: product.AmountStockmintoReorder || 5,
              price: product.NormalPrice || 0,
              ...order,
            });
          }
        });
      }
    });

    res.status(200).json({
      success: true,
      count: filteredOrders.length,
      status: status,
      data: filteredOrders,
    });
  } catch (error) {
    console.error("❌ Error fetching orders by status:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// Update order quantity (only for order_placed status)
router.patch("/:productId/order/:orderId/update-quantity", async (req, res) => {
  try {
    const { productId, orderId } = req.params;
    const { orderQuantity } = req.body;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const orderIndex = product.orderStock.findIndex(
      (order) => order._id.toString() === orderId
    );

    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Only allow quantity updates for order_placed status
    if (product.orderStock[orderIndex].status !== "order_placed") {
      return res.status(400).json({
        success: false,
        message: "Cannot update quantity for confirmed orders",
      });
    }

    // Update order quantity
    product.orderStock[orderIndex].orderQuantity = parseInt(orderQuantity);

    // Update total pending quantity
    product.totalPendingOrderQuantity = product.orderStock
      .filter((order) => order.status === "order_placed")
      .reduce((sum, order) => sum + order.orderQuantity, 0);

    await product.save();

    res.status(200).json({
      success: true,
      message: "Order quantity updated successfully",
      data: product.orderStock[orderIndex],
    });
  } catch (error) {
    console.error("Error updating order quantity:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});
// Bulk update order status
router.patch("/bulk-update-orders", async (req, res) => {
  try {
    const { orders, status, orderNumber, estimatedDeliveryDate, approvedBy } =
      req.body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Orders array is required",
      });
    }

    let updateCount = 0;
    const errors = [];

    for (const orderInfo of orders) {
      try {
        const { productId, orderId } = orderInfo;

        const product = await Product.findById(productId);
        if (!product) {
          errors.push(`Product ${productId} not found`);
          continue;
        }

        const orderIndex = product.orderStock.findIndex(
          (order) => order._id.toString() === orderId
        );

        if (orderIndex === -1) {
          errors.push(`Order ${orderId} not found in product ${productId}`);
          continue;
        }

        // Update order status
        product.orderStock[orderIndex].status = status;

        if (status === "order_placed") {
          product.orderStock[orderIndex].orderPlacedAt = new Date();
          if (orderNumber)
            product.orderStock[orderIndex].orderNumber = orderNumber;
        }

        if (status === "order_confirmed") {
          product.orderStock[orderIndex].orderConfirmedAt = new Date();
          if (estimatedDeliveryDate) {
            product.orderStock[orderIndex].estimatedDeliveryDate = new Date(
              estimatedDeliveryDate
            );
          }
          if (approvedBy) {
            product.orderStock[orderIndex].approvedBy = approvedBy;
            product.orderStock[orderIndex].approvedAt = new Date();
          }
        }

        if (status === "delivered") {
          product.orderStock[orderIndex].actualDeliveryDate = new Date();
          // Update actual stock when delivered
          product.Stock =
            (product.Stock || 0) + product.orderStock[orderIndex].orderQuantity;
        }

        // Update quick access fields
        const pendingOrders = product.orderStock.filter(
          (order) => order.status === "pending_order"
        );
        product.hasPendingOrders = pendingOrders.length > 0;
        product.totalPendingOrderQuantity = pendingOrders.reduce(
          (sum, order) => sum + order.orderQuantity,
          0
        );

        await product.save();
        updateCount++;
      } catch (err) {
        errors.push(
          `Error updating order ${orderInfo.orderId}: ${err.message}`
        );
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully updated ${updateCount} orders`,
      updateCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error bulk updating orders:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

module.exports = router;
