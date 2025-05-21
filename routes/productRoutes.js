const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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

// ─── 3) READ Endpoints ───────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res
      .status(200)
      .json({ success: true, count: products.length, data: products });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

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

// ─── 4) CREATE Endpoint with pricing sanitization ────────────────────────
// ─── CREATE Endpoint ─────────────────────────────────────────────────────
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
    const priceAfterDiscount = parseOptionalNumber(d.priceAfterDiscount);

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
    const useStockAmount =
      d.useStockAmount === "true" || d.useStockAmount === true;
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
      stock: parseOptionalNumber(d.stock),
      minimumOrder: parseOptionalNumber(d.minimumOrder),
      useStockAmount,
      useSafetyDays,
      noReorder,
      stockAmount: parseOptionalNumber(d.stockAmount),
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
      priceAfterDiscount,

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
    if (b.useStockAmount !== undefined)
      updates.useStockAmount = b.useStockAmount === "true";
    if (b.useSafetyDays !== undefined)
      updates.useSafetyDays = b.useSafetyDays === "true";
    if (b.noReorder !== undefined) updates.noReorder = b.noReorder === "true";

    if (b.stock !== undefined) updates.stock = parseOptionalNumber(b.stock);
    if (b.minimumOrder !== undefined)
      updates.minimumOrder = parseOptionalNumber(b.minimumOrder);
    if (b.stockAmount !== undefined)
      updates.stockAmount = parseOptionalNumber(b.stockAmount);
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
    if (b.priceAfterDiscount !== undefined)
      updates.priceAfterDiscount = parseOptionalNumber(b.priceAfterDiscount);

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

module.exports = router;
