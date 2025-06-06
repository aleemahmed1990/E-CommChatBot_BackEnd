const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
  {
    orderId: String,
    type: String,
    issueType: String,
    issueDetails: String,
    details: String,
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    agentNotes: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    resolution: String,
  },
  { _id: false }
);

// Complaint schema for order-specific complaints
const complaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      required: true,
      unique: true,
    },
    issueTypes: [
      {
        type: String,
        enum: ["broken", "not_what_ordered", "missing_amount", "other"],
        required: true,
      },
    ],
    additionalDetails: String,
    solutions: [
      {
        type: String,
        enum: ["customer_keeps_product", "customer_returns_with_truck"],
      },
    ],
    solutionDetails: String,
    customerRequests: [
      {
        type: String,
        enum: ["customer_asks_cancellation", "customer_asks_replacement"],
      },
    ],
    customerRequestDetails: String,
    reportedBy: {
      driverId: String,
      driverName: String,
    },
    reportedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
    },
    resolution: String,
    resolvedAt: Date,
  },
  { _id: false }
);

// 15 statuses pulled straight from your AllOrders component
const ORDER_STATUSES = [
  "cart-not-paid",
  "order-made-not-paid",
  "pay-not-confirmed",
  "order-confirmed",
  "order not picked",
  "issue-customer",
  "customer-confirmed",
  "order-refunded",
  "picking-order",
  "allocated-driver",
  "ready to pickup",
  "order-not-pickedup",
  "order-pickuped-up",
  "on-way",
  "driver-confirmed",
  "refund",
  "complain-order",
  "issue-driver",
  "parcel-returned",
  "order-complete",
];

const customerSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: [String],
      required: true,
      index: true,
      validate: [arrayLimit, "{PATH} must have at least one phone number"],
    },

    // Track "where" the customer is in the order flow
    currentOrderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "cart-not-paid",
    },
    // **NEW**: remember which order we last created/updated
    latestOrderId: {
      type: String,
      default: null,
      index: true, // (optional) makes lookups by latestOrderId faster
    },
    // ✅ Optional metadata to track linked/migrated numbers
    numberLinkedHistory: [
      {
        number: String,
        dateLinked: Date,
      },
    ],

    name: {
      type: String,
      required: true,
      trim: true,
    },
    conversationState: {
      type: String,
      default: "new", // Tracks where they are in the conversation flow
    },

    // Add these new fields for referrals
    referralCode: {
      type: String,
      default: function () {
        return "CM" + this._id.toString().substring(0, 6);
      },
    },
    referralImages: [
      {
        imageId: String,
        imagePath: String,
        approvalDate: Date,
        sharedWith: [
          {
            name: String,
            phoneNumber: String,
            dateShared: Date,
            status: String,
          },
        ],
      },
    ],
    referredBy: {
      customerId: String,
      phoneNumber: String,
      name: String,
      videoId: String,
      dateReferred: Date,
    },
    referralRewards: [
      {
        amount: Number,
        issuedDate: Date,
        expiryDate: Date,
        used: Boolean,
        usedDate: Date,
        orderId: String,
      },
    ],
    // Add these new fields specifically for discount products:
    currentDiscountProductId: String,
    currentDiscountProductName: String,
    currentDiscountProductPrice: Number,
    currentDiscountProductOriginalPrice: Number,
    currentDiscountCategory: String,
    pickupPlan: {
      date: { type: String, default: null }, // e.g., "2025-04-20"
      timeSlot: { type: String, default: null }, // e.g., "12 PM – 3 PM"
      reminderSent: { type: Boolean, default: false },
    },

    tempVerificationTries: { type: Number, default: 0 }, // counter for the new number
    pendingVerificationOldNumber: { type: String, default: null }, // stores old number to verify against

    tempNumberToSwitch: { type: String, default: null },
    // Add this field to the cart sub-schema in the customer schema
    ecoDeliveryDiscount: {
      type: Number,
      default: 0,
    },
    pickupDateList: {
      type: [String],
      default: [],
    },

    // ✅ Now this is valid
    supportTickets: [supportTicketSchema],

    contextData: {
      // Store additional context for the current conversation state
      categoryId: String,
      categoryName: String,
      subCategoryId: String,
      subCategoryName: String,
      productId: String,
      productName: String,
      selectedWeight: String,
      quantity: Number,
      deliveryOption: String,
      numberSwitchIndex: Number,

      categoryList: { type: [String], default: [] },
      subcategoryList: { type: [String], default: [] },
      productList: { type: [String], default: [] },
      weightOptions: { type: [String], default: [] },

      editAddressIndex: Number, // <-- Add this field to fix the issue
      editAddressField: String, // <-- Also add this field for completeness
      editBankIndex: {
        type: Number,
        default: null,
      },
      tempBankAccount: {
        type: {
          accountHolderName: { type: String, default: "" },
          bankName: { type: String, default: "" },
          accountNumber: { type: String, default: "" },
        },

        adminReason: String,
        default: () => ({
          accountHolderName: "",
          bankName: "",
          accountNumber: "",
        }),
      },

      // Modify tempAddress to have a default empty object
      tempAddress: {
        type: {
          nickname: { type: String, default: "" },
          fullAddress: { type: String, default: "" },
          area: { type: String, default: "" },
          googleMapLink: { type: String, default: "" },
        },
        default: () => ({
          nickname: "",
          fullAddress: "",
          area: "",
          googleMapLink: "",
        }),
      },

      deliveryLocation: String,
      locationDetails: String,
      paymentMethod: String,
      email: String,
      bankName: String,
      transactionId: String,
      temporaryItemDetails: Object, // For temporary storage during shopping process
    },

    bankAccounts: [
      {
        accountHolderName: { type: String },
        bankName: { type: String },
        accountNumber: { type: String },
      },
    ],
    payerNames: {
      type: [String],
      default: [],
    },
    bankNames: {
      type: [String],
      default: [],
    },

    lastInteraction: {
      type: Date,
      default: Date.now,
    },
    orderHistory: [
      {
        orderId: String,
        items: [
          {
            productId: String,
            productName: String,
            quantity: Number,
            price: Number,
            weight: String,
            totalPrice: Number,
            // Add onTruck field for individual item tracking
            onTruck: {
              type: Boolean,
              default: false,
            },
          },
        ],
        totalAmount: Number,
        deliveryOption: String,
        deliveryLocation: String,
        deliveryCharge: Number,
        paymentStatus: {
          type: String,
          enum: ["pending", "paid", "failed"],
          default: "pending",
        },
        paymentMethod: String,
        transactionId: String,
        orderDate: {
          type: Date,
          default: Date.now,
        },
        receiptImage: {
          data: String, // Store the base64 string directly
          contentType: String, // MIME type (e.g., image/jpeg)
        },

        receiptImageMetadata: {
          mimetype: String,
          timestamp: Date,
        },
        accountHolderName: {
          type: String,
          default: "",
        },
        paidBankName: {
          type: String,
          default: "",
        },
        status: {
          type: String,
          enum: ORDER_STATUSES,
          default: "cart-not-paid",
        },

        deliveryDate: Date,
        // Newly added fields
        timeSlot: { type: String, default: null },
        driver1: { type: String, default: null }, // Store driver ID or name
        driver2: { type: String, default: null }, // Store driver ID or name
        pickupType: {
          type: String,
          enum: [
            "heavy-pickup",
            "medium-pickup",
            "light-pickup",
            "three-wheeler",
            "scooter-heavy-delivery",
            "scooter",
          ],
          default: "heavy-pickup",
        },
        truckOnDeliver: { type: Boolean, default: false },
        totalAmount: {
          type: Number,
          default: 0,
        },
        deliveryOption: {
          type: String,
          default: "Normal Delivery",
        },
        // ADD THESE NEW FIELDS:
        deliveryType: {
          type: String,
          enum: ["truck", "scooter", "self_pickup"],
          default: "truck",
        },
        deliverySpeed: {
          type: String,
          enum: ["normal", "speed", "early_morning", "eco"],
          default: "normal",
        },
        deliveryLocation: String,
        // ADD THIS STRUCTURED OBJECT FOR DELIVERY ADDRESS:
        deliveryAddress: {
          nickname: String,
          area: String,
          fullAddress: String,
          googleMapLink: String,
        },
        deliveryCharge: {
          type: Number,
          default: 0,
        },
        // For eco delivery discount:
        ecoDeliveryDiscount: {
          type: Number,
          default: 0,
        },
        // Add admin reason field
        adminReason: String,
        // Add pickup allocation field
        pickupAllocated: {
          type: Boolean,
          default: false,
        },
        allocatedAt: Date,
        // Add complaints array to each order
        complaints: [complaintSchema],
      },
    ],
    cart: {
      items: [
        {
          productId: String,
          productName: String,
          category: String,
          subCategory: String,
          weight: String,
          quantity: Number,
          price: Number,
          totalPrice: Number,
          imageUrl: String,
        },
      ],
    },

    chatHistory: [
      {
        message: String,
        sender: {
          type: String,
          enum: ["customer", "bot"],
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    addresses: [
      {
        nickname: String, // e.g., "Home", "Office"
        fullAddress: String,
        area: String,
        googleMapLink: String,
        isDefault: Boolean,
      },
    ],

    discountCodes: [
      {
        code: String,
        discountPercentage: Number,
        validUntil: Date,
        isUsed: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Method to add a message to chat history
customerSchema.methods.addToChatHistory = function (message, sender) {
  this.chatHistory.push({
    message,
    sender,
    timestamp: new Date(),
  });
  this.lastInteraction = new Date();
  return this.save();
};

// Method to update conversation state
customerSchema.methods.updateConversationState = function (newState) {
  this.conversationState = newState;
  this.lastInteraction = new Date();
  return this.save();
};

// Method to add item to cart
customerSchema.methods.addToCart = function (product, quantity, weight) {
  // Check if product already exists in cart with same weight
  const existingItemIndex = this.cart.items.findIndex(
    (item) => item.productId === product.id && item.weight === weight
  );

  if (existingItemIndex > -1) {
    // Update existing item quantity
    this.cart.items[existingItemIndex].quantity += quantity;
    this.cart.items[existingItemIndex].totalPrice =
      this.cart.items[existingItemIndex].price *
      this.cart.items[existingItemIndex].quantity;
  } else {
    // Add new item to cart
    this.cart.items.push({
      productId: product.id,
      productName: product.name,
      category: product.category,
      subCategory: product.subCategory,
      weight: weight,
      quantity: quantity,
      price: product.price,
      totalPrice: product.price * quantity,
      imageUrl: product.imageUrl,
    });
  }

  // Recalculate total amount
  this.cart.totalAmount = this.cart.items.reduce(
    (total, item) => total + item.totalPrice,
    0
  );

  return this.save();
};

// Method to remove item from cart
customerSchema.methods.removeFromCart = function (productId, weight) {
  // Filter out the item to remove
  this.cart.items = this.cart.items.filter(
    (item) => !(item.productId === productId && item.weight === weight)
  );

  // Recalculate total amount
  this.cart.totalAmount = this.cart.items.reduce(
    (total, item) => total + item.totalPrice,
    0
  );

  return this.save();
};

// Method to empty cart
customerSchema.methods.emptyCart = function () {
  this.cart.items = [];
  this.cart.totalAmount = 0;
  this.cart.deliveryCharge = 0;
  this.cart.deliveryOption = "Normal Delivery";
  this.cart.deliveryLocation = "";

  return this.save();
};

// Method to create new order from cart
customerSchema.methods.createOrder = function () {
  const orderId = "ORD" + Date.now().toString().slice(-8);

  const newOrder = {
    orderId: orderId,
    items: [...this.cart.items],
    totalAmount: this.cart.totalAmount + this.cart.deliveryCharge,
    deliveryOption: this.cart.deliveryOption,
    deliveryLocation: this.cart.deliveryLocation,
    deliveryCharge: this.cart.deliveryCharge,
    paymentStatus: "pending",
    orderDate: new Date(),
  };

  this.orderHistory.push(newOrder);

  return this.save().then(() => orderId);
};

// Method to update order status
customerSchema.methods.updateOrderStatus = function (orderId, status) {
  const orderIndex = this.orderHistory.findIndex(
    (order) => order.orderId === orderId
  );

  if (orderIndex > -1) {
    this.orderHistory[orderIndex].status = status;
    return this.save();
  }

  return Promise.reject(new Error("Order not found"));
};

function arrayLimit(val) {
  return val.length > 0;
}

// Then create a new model with the updated schema
const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;
