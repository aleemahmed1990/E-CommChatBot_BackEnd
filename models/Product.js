const mongoose = require("mongoose");
const { Schema } = mongoose;

// Specification sub-schema
const specificationSchema = new Schema(
  {
    height: { type: Number },
    length: { type: Number },
    width: { type: Number },
    depth: { type: Number },
    weight: { type: Number }, // weight in kg or unit
    colours: { type: String },
    id: { type: Number },
  },
  { _id: false }
);

// Main Product schema
const productSchema = new Schema(
  {
    productId: { type: String, unique: true },
    productType: {
      type: String,
      enum: ["Parent", "Child", "Normal"],
      required: true,
    },
    productName: { type: String, required: true },
    subtitle: String,
    brand: String,
    description: String,

    // Child-only
    parentProduct: String,
    varianceName: String,
    subtitleDescription: String,

    // Identifiers
    globalTradeItemNumber: String,
    k3lNumber: String,
    sniNumber: String,

    // Specs
    specifications: [specificationSchema],

    // Inventory
    stock: { type: Number, default: 0 },
    minimumOrder: { type: Number, default: 1 },
    highestValue: String,
    normalShelvesCount: Number,
    highShelvesCount: Number,

    useStockAmount: { type: Boolean, default: false },
    useSafetyDays: { type: Boolean, default: false },
    noReorder: { type: Boolean, default: false },
    stockAmount: Number,
    safetyDays: Number,
    safetyDaysStock: Number,
    deliveryDays: Number,
    deliveryTime: String,
    reOrderSetting: String,
    inventoryInDays: String,
    deliveryPeriod: String,
    orderTimeBackupInventory: String,

    // Supplier info
    alternateSupplier: String,
    supplierName: String,
    supplierContact: String,
    supplierAddress: String,
    supplierEmail: String,
    supplierWebsite: String,
    supplierInformation: String,

    anyDiscount: {
      type: Number,
      default: null,
    },
    priceAfterDiscount: {
      type: Number,
      default: null,
    },
    // Flags & visibility
    visibility: {
      type: String,
      enum: ["Public", "Private"],
      default: "Public",
    },
    onceShare: { type: Boolean, default: false },
    noChildHideParent: { type: Boolean, default: false },

    // Categorization
    categories: String,
    subCategories: String,
    tags: [String],
    notes: String,

    // Images
    masterImage: {
      data: Buffer,
      contentType: String,
    },
    moreImages: [
      {
        data: Buffer,
        contentType: String,
      },
    ],
  },
  { timestamps: true }
);

// Auto-generate productId if missing
productSchema.pre("save", async function (next) {
  if (!this.productId) {
    const prefix =
      this.productType === "Parent"
        ? "P"
        : this.productType === "Child"
        ? "C"
        : "N";

    // Find the highest existing ID with this prefix
    const highest = await this.constructor
      .findOne({ productId: new RegExp(`^${prefix}`) })
      .sort({ productId: -1 })
      .lean();

    let nextNum = 1;
    if (highest && highest.productId) {
      const num = parseInt(highest.productId.slice(1), 10);
      if (!isNaN(num)) nextNum = num + 1;
    }

    this.productId = `${prefix}${String(nextNum).padStart(4, "0")}`;
  }
  next();
});

module.exports = mongoose.model("Product", productSchema);
