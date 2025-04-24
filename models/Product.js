const mongoose = require("mongoose");

const specificationSchema = new mongoose.Schema({
  height: String,
  length: String,
  width: String,
  depth: String,
  colours: String,
  unit: String,
  id: Number,
});

const productSchema = new mongoose.Schema({
  // Reference to Supplier model
  supplierReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier",
  },
  safetyDaysStock: String,
  noReorder: { type: Boolean, default: false },
  useStockAmount: { type: Boolean, default: false },
  useSafetyDays: { type: Boolean, default: false },

  // Basic information
  productId: {
    type: String,
    unique: true,
  },
  productType: {
    type: String,
    enum: ["Parent", "Child", "Normal"],
    required: true,
  },
  productName: {
    type: String,
    required: function () {
      return this.productType === "Parent" || this.productType === "Normal";
    },
  },
  subtitle: String,
  brand: {
    type: String,
    required: function () {
      return this.productType === "Parent" || this.productType === "Normal";
    },
  },
  description: {
    type: String,
    required: function () {
      return this.productType === "Parent" || this.productType === "Normal";
    },
  },

  // Child product specific fields
  parentProduct: {
    type: String,
    required: function () {
      return this.productType === "Child";
    },
  },
  globalTradeItemNumber: String,
  k3lNumber: String,
  sniNumber: String,
  varianceName: {
    type: String,
    required: function () {
      return this.productType === "Child";
    },
  },
  subtitleDescription: {
    type: String,
    required: function () {
      return this.productType === "Child";
    },
  },

  // Dimensions and specifications
  heightCm: String,
  widthCm: String,
  depthCm: String,
  weightKg: String,
  specifications: [specificationSchema],

  // Inventory details
  stock: {
    type: Number,
    default: 0,
  },
  minimumOrder: {
    type: Number,
    default: 1,
  },
  highestValue: String,
  normalShelvesCount: String,
  highShelvesCount: String,
  deliveryTime: String,

  // Reorder settings
  reOrderSetting: {
    type: String,
    default: "2 days average",
  },
  inventoryInDays: {
    type: String,
    default: "5days",
  },
  deliveryPeriod: {
    type: String,
    default: "1 days",
  },
  orderTimeBackupInventory: String,
  stockAmount: String, // Added field for stock amount
  safetyDays: String, // Added field for safety days
  deliveryDays: String, // Added field for delivery days

  // Supplier information
  alternateSupplier: String,
  supplierInformation: String,
  supplierWebsite: String,
  supplierContact: String,
  supplierName: String,
  supplierAddress: String,
  supplierEmail: String,

  // Pricing information
  anyDiscount: String,
  priceAfterDiscount: String,
  suggestedRetailPrice: String,

  // Product visibility and categorization
  visibility: {
    type: String,
    enum: ["Public", "Private"],
    default: "Public",
  },
  tags: [String],
  categories: [
    {
      type: String,
      required: true,
    },
  ],
  subCategories: [
    {
      type: String,
      required: true,
    },
  ], // Added subcategories field
  noReorder: { type: Boolean, default: false },
  useStockAmount: { type: Boolean, default: false },
  useSafetyDays: { type: Boolean, default: false },
  notes: String,

  // Option for visibility control
  onceShare: Boolean, // Added field for "once there is less than 2 days" option
  noChildHideParent: Boolean, // Added field for "if no child, then parent hidden" option

  // Image paths
  masterImage: {
    type: String,
  },
  moreImages: [String],

  // System fields
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Auto-generate product ID before saving
productSchema.pre("save", async function (next) {
  try {
    if (!this.productId) {
      const prefix =
        this.productType === "Parent"
          ? "P"
          : this.productType === "Child"
          ? "C"
          : "N";

      // Find the highest existing ID with this prefix
      const highestProduct = await this.constructor
        .findOne({
          productId: new RegExp(`^${prefix}`),
        })
        .sort({ productId: -1 });

      let nextId = 1;
      if (highestProduct && highestProduct.productId) {
        // Extract the number part and increment
        const idNumber = parseInt(highestProduct.productId.substring(1));
        if (!isNaN(idNumber)) {
          nextId = idNumber + 1;
        }
      }

      // Pad with zeros to ensure consistent format
      this.productId = `${prefix}${nextId.toString().padStart(4, "0")}`;
    }

    // Update the updatedAt timestamp
    this.updatedAt = Date.now();

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Product", productSchema);
