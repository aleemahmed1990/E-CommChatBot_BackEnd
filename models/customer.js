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

// Complaint schema for order-specific complaints - FIXED: removed unique constraint
const complaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      required: true,
      // REMOVED: unique: true, // This was causing the duplicate key error
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
    // Replace the existing referralvideos section with this updated version:
    referralvideos: [
      {
        imageId: {
          type: String,
          required: true,
        },
        // Remove imagePath since we're storing base64 data directly
        mediaType: {
          type: String,
          default: "video",
        },
        mimetype: {
          type: String,
          default: "video/mp4",
        },
        filename: String,
        // New field for UltraMsg media ID
        ultraMsgMediaId: String,
        // New field for base64 video data
        base64Data: {
          type: String,
          required: true,
        },
        // New field for file size tracking
        fileSize: {
          type: Number, // Size in MB
          required: true,
        },
        approvalDate: {
          type: Date,
          default: Date.now,
        },
        // NEW: Status field for video management
        status: {
          type: String,
          enum: ["unverified", "verified", "manager", "spam"],
          default: "unverified",
        },
        // NEW: Track when status was last updated
        statusUpdatedAt: {
          type: Date,
          default: Date.now,
        },
        // NEW: History of status changes
        statusHistory: [
          {
            status: {
              type: String,
              enum: ["unverified", "verified", "manager", "spam"],
            },
            updatedAt: {
              type: Date,
              default: Date.now,
            },
            updatedBy: String, // Admin user ID or name
            reason: String, // Optional reason for status change
          },
        ],
        // NEW: Admin notes
        adminNotes: String,
        // Existing shared with array
        sharedWith: [
          {
            name: {
              type: String,
              default: "Contact",
            },
            phoneNumber: {
              type: String,
              required: true,
            },
            dateShared: {
              type: Date,
              default: Date.now,
            },
            status: {
              type: String,
              enum: ["pending", "sent", "failed"],
              default: "pending",
            },
            dateSent: Date,
            errorMessage: String, // Track any sending errors
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

    // ========== FOREMAN MANAGEMENT FIELDS ==========

    // Foreman status tracking
    foremanStatus: {
      type: String,
      enum: ["regular", "pending", "approved"],
      default: "regular",
    },

    // Date when customer applied/was marked for foreman status
    foremanAppliedAt: {
      type: Date,
      default: null,
    },

    // Date when customer was approved as foreman
    foremanApprovedAt: {
      type: Date,
      default: null,
    },

    // Admin notes for foreman status
    foremanNotes: {
      type: String,
      default: "",
    },

    // History of foreman status changes
    foremanStatusHistory: [
      {
        status: {
          type: String,
          enum: ["regular", "pending", "approved"],
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
        updatedBy: {
          type: String, // Admin user ID or name
          default: "system",
        },
        reason: {
          type: String,
          default: "",
        },
      },
    ],

    // Foreman specific settings and permissions
    foremanSettings: {
      canApproveReferrals: {
        type: Boolean,
        default: false,
      },
      canManageTeam: {
        type: Boolean,
        default: false,
      },
      commissionRate: {
        type: Number,
        default: 0, // Percentage
      },
      maxTeamSize: {
        type: Number,
        default: 0,
      },
      territory: {
        type: String,
        default: "",
      },
    },

    // Performance metrics for foreman evaluation
    performanceMetrics: {
      customerLoyaltyScore: {
        type: Number,
        default: 0,
      },
      referralSuccessRate: {
        type: Number,
        default: 0,
      },
      averageOrderValue: {
        type: Number,
        default: 0,
      },
      monthlyTarget: {
        type: Number,
        default: 0,
      },
      lastEvaluationDate: {
        type: Date,
        default: null,
      },
    },
    // ========== COMMISSION MANAGEMENT FIELDS ==========

    // Commission tracking
    commissionEarned: {
      type: Number,
      default: 0, // Total commission earned from all referrals
    },

    commissionPaid: {
      type: Number,
      default: 0, // Total commission that has been paid out
    },

    commissionNotPaid: {
      type: Number,
      default: 0, // Commission earned but not yet paid
    },

    // Commission approval status
    commissionApproved: {
      type: Boolean,
      default: false, // Whether this foreman is approved to earn commission
    },

    commissionApprovedAt: {
      type: Date,
      default: null,
    },

    // Commission history tracking
    commissionHistory: [
      {
        amount: {
          type: Number,
          required: true,
        },
        type: {
          type: String,
          enum: ["earned", "paid"],
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
        orderId: {
          type: String, // Reference to the order that generated this commission
          default: null,
        },
        referredCustomerId: {
          type: String, // ID of the customer who was referred
          default: null,
        },
        isPaid: {
          type: Boolean,
          default: false,
        },
        paidDate: {
          type: Date,
          default: null,
        },
        notes: {
          type: String,
          default: "",
        },
      },
    ],

    // ========== REFERRAL PERFORMANCE FIELDS ==========

    // Successful referrals (those who made orders)
    successfulReferrals: {
      type: Number,
      default: 0,
    },

    // Total phone numbers given through referral videos
    totalPhoneNumbersGiven: {
      type: Number,
      default: 0,
    },

    // Commission rate for this foreman (percentage)
    commissionRate: {
      type: Number,
      default: 5, // 5% default commission rate
    },

    // ========== ENHANCED REFERRAL TRACKING ==========

    // Enhanced referral tracking with more details
    referralPerformance: {
      totalReferralsSent: {
        type: Number,
        default: 0,
      },
      successfulConversions: {
        type: Number,
        default: 0,
      },
      totalCommissionGenerated: {
        type: Number,
        default: 0,
      },
      averageOrderValueFromReferrals: {
        type: Number,
        default: 0,
      },
      lastReferralDate: {
        type: Date,
        default: null,
      },
    },

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

// Method to update foreman status
customerSchema.methods.updateForemanStatus = function (
  newStatus,
  updatedBy = "system",
  reason = ""
) {
  this.foremanStatus = newStatus;

  if (newStatus === "pending") {
    this.foremanAppliedAt = new Date();
  } else if (newStatus === "approved") {
    this.foremanApprovedAt = new Date();

    // Set default foreman settings
    if (!this.foremanSettings) {
      this.foremanSettings = {};
    }
    this.foremanSettings.canApproveReferrals = true;
    this.foremanSettings.commissionRate = 5; // 5% default commission
  }

  // Add to status history
  if (!this.foremanStatusHistory) {
    this.foremanStatusHistory = [];
  }

  this.foremanStatusHistory.push({
    status: newStatus,
    updatedAt: new Date(),
    updatedBy: updatedBy,
    reason: reason,
  });

  return this.save();
};
// ========== METHODS TO ADD TO CUSTOMER SCHEMA ==========

// Method to calculate commission earned from a referred customer's order
customerSchema.methods.calculateCommissionFromOrder = function (
  orderAmount,
  isDiscountedProduct = false
) {
  if (!this.commissionApproved) {
    return 0;
  }

  // Don't give commission on discounted products
  if (isDiscountedProduct) {
    return 0;
  }

  const commissionRate = this.commissionRate || 5; // Default 5%
  return (orderAmount * commissionRate) / 100;
};

// Method to add commission earned
customerSchema.methods.addCommissionEarned = function (
  amount,
  orderId,
  referredCustomerId
) {
  this.commissionEarned = (this.commissionEarned || 0) + amount;
  this.commissionNotPaid = (this.commissionNotPaid || 0) + amount;

  // Add to commission history
  if (!this.commissionHistory) {
    this.commissionHistory = [];
  }

  this.commissionHistory.push({
    amount: amount,
    type: "earned",
    date: new Date(),
    orderId: orderId,
    referredCustomerId: referredCustomerId,
    isPaid: false,
  });

  return this.save();
};

// Method to pay commission
customerSchema.methods.payCommission = function (amount, notes = "") {
  if (amount > (this.commissionNotPaid || 0)) {
    throw new Error("Cannot pay more than unpaid commission amount");
  }

  this.commissionPaid = (this.commissionPaid || 0) + amount;
  this.commissionNotPaid = (this.commissionNotPaid || 0) - amount;

  // Add to commission history
  if (!this.commissionHistory) {
    this.commissionHistory = [];
  }

  this.commissionHistory.push({
    amount: amount,
    type: "paid",
    date: new Date(),
    isPaid: true,
    paidDate: new Date(),
    notes: notes,
  });

  return this.save();
};

// Method to approve for commission
customerSchema.methods.approveForCommission = function () {
  this.commissionApproved = true;
  this.commissionApprovedAt = new Date();

  // Add to foreman status history
  if (!this.foremanStatusHistory) {
    this.foremanStatusHistory = [];
  }

  this.foremanStatusHistory.push({
    status: "commission_approved",
    updatedAt: new Date(),
    updatedBy: "admin",
    reason: "Approved for commission earning",
  });

  return this.save();
};

// Method to update successful referrals count
customerSchema.methods.updateSuccessfulReferrals = function () {
  return Customer.countDocuments({
    "referredBy.referralCode": this.referralCode,
    "orderHistory.0": { $exists: true }, // Has at least one order
  }).then((count) => {
    this.successfulReferrals = count;
    return this.save();
  });
};

// Method to update total phone numbers given
customerSchema.methods.updateTotalPhoneNumbersGiven = function () {
  if (!this.referralvideos) {
    this.totalPhoneNumbersGiven = 0;
    return this.save();
  }

  const totalNumbers = this.referralvideos.reduce((total, video) => {
    return total + (video.sharedWith ? video.sharedWith.length : 0);
  }, 0);

  this.totalPhoneNumbersGiven = totalNumbers;
  return this.save();
};

// Method to get commission dashboard data
customerSchema.methods.getCommissionDashboard = function () {
  return {
    commissionEarned: this.commissionEarned || 0,
    commissionPaid: this.commissionPaid || 0,
    commissionNotPaid: this.commissionNotPaid || 0,
    commissionApproved: this.commissionApproved || false,
    commissionRate: this.commissionRate || 5,
    successfulReferrals: this.successfulReferrals || 0,
    totalPhoneNumbersGiven: this.totalPhoneNumbersGiven || 0,
    commissionHistory: this.commissionHistory || [],
  };
};
// Method to calculate performance score
customerSchema.methods.calculatePerformanceScore = function () {
  const referrals = this.getTotalReferrals();
  const videos = this.referralvideos ? this.referralvideos.length : 0;
  const totalSpent = this.getTotalSpent();
  const orders = this.orderHistory ? this.orderHistory.length : 0;

  // Performance scoring algorithm
  const referralScore = Math.min(referrals * 10, 40); // Max 40 points
  const videoScore = Math.min(videos * 5, 20); // Max 20 points
  const spendingScore = Math.min(totalSpent / 50, 25); // Max 25 points ($50 = 1 point)
  const loyaltyScore = Math.min(orders * 3, 15); // Max 15 points

  const totalScore = referralScore + videoScore + spendingScore + loyaltyScore;

  // Update performance metrics
  if (!this.performanceMetrics) {
    this.performanceMetrics = {};
  }
  this.performanceMetrics.customerLoyaltyScore = Math.round(totalScore);
  this.performanceMetrics.lastEvaluationDate = new Date();

  return Math.round(totalScore);
};

// Method to get total referrals
customerSchema.methods.getTotalReferrals = function () {
  // This would need to be implemented with a separate query
  // For now, return 0 as placeholder
  return 0;
};

// Method to get total spent
customerSchema.methods.getTotalSpent = function () {
  if (!this.orderHistory || this.orderHistory.length === 0) {
    return 0;
  }

  return this.orderHistory.reduce((total, order) => {
    return total + (order.totalAmount || 0);
  }, 0);
};

// Method to check if eligible for foreman
customerSchema.methods.isEligibleForForeman = function () {
  const performanceScore = this.calculatePerformanceScore();
  const totalSpent = this.getTotalSpent();
  const hasVideos = this.referralvideos && this.referralvideos.length > 0;
  const hasOrders = this.orderHistory && this.orderHistory.length >= 2;

  // Eligibility criteria
  return (
    performanceScore >= 30 && // Minimum performance score
    totalSpent >= 100 && // Minimum spending
    hasVideos && // Has uploaded at least one video
    hasOrders // Has placed at least 2 orders
  );
};

// Method to get foreman dashboard data
customerSchema.methods.getForemanDashboard = function () {
  return {
    status: this.foremanStatus || "regular",
    appliedAt: this.foremanAppliedAt,
    approvedAt: this.foremanApprovedAt,
    performanceScore: this.calculatePerformanceScore(),
    isEligible: this.isEligibleForForeman(),
    settings: this.foremanSettings || {},
    metrics: this.performanceMetrics || {},
    statusHistory: this.foremanStatusHistory || [],
  };
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

// Helper function for phone number validation
function arrayLimit(val) {
  return val.length > 0;
}

// Then create a new model with the updated schema
const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;
