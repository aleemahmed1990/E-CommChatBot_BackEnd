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
    notes: String,

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
    minimumOrder: { type: Number, default: 1 },
    highestValue: String,
    normalShelvesCount: Number,
    highShelvesCount: Number,

    useAmountStockmintoReorder: { type: Boolean, default: false },
    useSafetyDays: { type: Boolean, default: false },
    noReorder: { type: Boolean, default: false },
    AmountStockmintoReorder: Number,

    // Enhanced stock correction tracking fields
    stockCorrectionHistory: [
      {
        type: {
          type: String,
          enum: ["increase", "decrease", "correction"],
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        previousStock: {
          type: Number,
          required: true,
        },
        newStock: {
          type: Number,
          required: true,
        },
        reason: {
          type: String,
          enum: [
            "New inventory received",
            "Supplier delivery",
            "Return from customer",
            "Manufacturing completion",
            "Transfer from other location",
            "Inventory adjustment",
            "Found missing items",
            "Quality control passed",
            "Damaged goods",
            "Expired products",
            "Theft/Shrinkage",
            "Quality control rejection",
            "Inventory counting error",
            "Breakage during handling",
            "Weather/Environmental damage",
            "Customer returns",
            "Manufacturing defect",
            "Transfer to other location",
            "Other",
          ],
          required: true,
        },
        customReason: {
          type: String,
          maxlength: 200,
        },
        date: {
          type: Date,
          default: Date.now,
        },
        correctedBy: {
          type: String,
          default: "Admin",
        },
        notes: String,
      },
    ],

    safetyDaysStock: Number,

    // ✅ SIMPLIFIED: Remove main stockOrderStatus field - we'll use orderStock array status
    // stockOrderStatus field removed - status now lives in individual orders

    deliveryDays: Number,
    deliveryTime: String,
    reOrderSetting: String,
    inventoryInDays: String,
    deliveryPeriod: String,
    orderTimeBackupInventory: String,

    // ✅ UPDATED: Order Stock Management Fields with individual status
    orderStock: [
      {
        orderQuantity: {
          type: Number,
          required: true,
          min: 1,
        },
        approvedSupplier: {
          type: String,
          required: true,
        },
        selectedSupplierId: {
          type: Schema.Types.ObjectId,
          ref: "Supplier",
        },
        supplierEmail: String,
        supplierPhone: String,
        supplierAddress: String,
        currentStock: {
          type: Number,
          required: true,
        },
        reorderThreshold: {
          type: Number,
          required: true,
        },
        estimatedCost: {
          type: Number,
          default: 0,
        },
        notes: String,
        requestedBy: {
          type: String,
          default: "Admin",
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },

        // ✅ NEW: Individual order status (moved from main product level)
        status: {
          type: String,
          enum: [
            "pending",
            "order_placed",
            "order_confirmed",
            "delivered",
            "cancelled",
          ],
          default: "order_placed",
          required: true,
        },

        // Order tracking
        orderPlacedAt: Date,
        orderConfirmedAt: Date,
        estimatedDeliveryDate: Date,
        actualDeliveryDate: Date,
        orderNumber: String, // PO number or reference

        // Additional tracking
        priority: {
          type: String,
          enum: ["low", "medium", "high", "urgent"],
          default: "medium",
        },
        approvedBy: String,
        approvedAt: Date,
        cancelledAt: Date,
        cancelReason: String,
      },
    ],

    // ✅ UPDATED: Quick access fields for current pending orders
    hasPendingOrders: {
      type: Boolean,
      default: false,
    },
    totalPendingOrderQuantity: {
      type: Number,
      default: 0,
    },
    lastOrderDate: Date,

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
    NormalPrice: {
      type: Number,
      default: null,
    },
    Stock: {
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

    // Enhanced lost stock tracking fields
    lostStock: {
      type: Number,
      default: 0,
      min: 0,
      description: "Total units lost due to damage, theft, expiry, etc.",
    },

    lostStockHistory: [
      {
        amount: {
          type: Number,
          required: true,
          min: 0,
        },
        reason: {
          type: String,
          enum: [
            "Damaged goods",
            "Expired products",
            "Theft/Shrinkage",
            "Quality control rejection",
            "Inventory counting error",
            "Breakage during handling",
            "Weather/Environmental damage",
            "Returned/Refunded items",
            "Customer returns",
            "Manufacturing defect",
            "Manual increase",
            "Manual decrease",
            "Other",
          ],
          default: "Other",
        },
        customReason: {
          type: String,
          maxlength: 200,
        },
        date: {
          type: Date,
          default: Date.now,
        },
        correctedBy: {
          type: String,
          default: "Admin",
        },
        originalStock: Number,
        correctedStock: Number,
        lostStockChange: Number, // +/- change in lost stock
        notes: String,
      },
    ],

    // Add audit field for stock corrections
    lastStockUpdate: {
      type: Date,
      default: Date.now,
    },

    // Categorization
    categories: String,
    subCategories: String,
    tags: [String],

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

// ✅ UPDATED: Helper method to get product's overall order status
productSchema.methods.getOverallOrderStatus = function () {
  if (!this.orderStock || this.orderStock.length === 0) {
    return "needs_reorder";
  }

  const statuses = this.orderStock.map((order) => order.status);

  // Priority order: delivered > order_confirmed > order_placed > pending > cancelled
  if (statuses.includes("delivered")) return "delivered";
  if (statuses.includes("order_confirmed")) return "order_confirmed";
  if (statuses.includes("order_placed")) return "order_placed";
  if (statuses.includes("pending")) return "pending";
  return "needs_reorder";
};

// ✅ UPDATED: Helper method to check if product needs reordering
productSchema.methods.needsReorder = function () {
  // Calculate reorder threshold
  let reorderThreshold = 5;
  if (this.useAmountStockmintoReorder && this.AmountStockmintoReorder) {
    reorderThreshold = this.AmountStockmintoReorder;
  } else if (this.minimumOrder) {
    reorderThreshold = this.minimumOrder;
  }

  const currentStock = this.Stock || 0;
  const hasActiveOrders =
    this.orderStock &&
    this.orderStock.some((order) =>
      ["order_placed", "order_confirmed"].includes(order.status)
    );

  return currentStock <= reorderThreshold && !hasActiveOrders;
};

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

  // ✅ AUTO-UPDATE: Update quick access fields based on orderStock array
  if (this.orderStock) {
    const activeOrders = this.orderStock.filter((order) =>
      ["pending", "order_placed", "order_confirmed"].includes(order.status)
    );

    this.hasPendingOrders = activeOrders.length > 0;
    this.totalPendingOrderQuantity = activeOrders.reduce(
      (sum, order) => sum + order.orderQuantity,
      0
    );

    if (activeOrders.length > 0) {
      this.lastOrderDate = Math.max(
        ...activeOrders.map((order) => order.requestedAt)
      );
    }
  }

  next();
});

module.exports = mongoose.model("Product", productSchema);
