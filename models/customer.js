const mongoose = require("mongoose");

// Helper function to generate unique referral code
async function generateUniqueReferralCode(phoneNumber, customerId) {
  const Customer = mongoose.model("Customer");
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    let code;

    if (attempts === 0) {
      // First attempt: Use phone number based code
      const phoneDigits = phoneNumber.replace(/\D/g, "").slice(-4) || "0000";
      const randomSuffix = Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase();
      code = `CM${phoneDigits}${randomSuffix}`;
    } else if (attempts < 10) {
      // Attempts 1-9: Use timestamp + random
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.random().toString(36).substring(2, 4).toUpperCase();
      code = `CM${timestamp}${random}`;
    } else {
      // Attempts 10+: Use ObjectId + counter
      const objectIdStr = customerId.toString();
      const counter = (attempts - 10).toString().padStart(2, "0");
      code = `CM${objectIdStr.slice(-6)}${counter}`;
    }

    // Check if code exists
    try {
      const existingCustomer = await Customer.findOne({
        referralCode: code,
        _id: { $ne: customerId },
      });

      if (!existingCustomer) {
        return code; // Found unique code
      }
    } catch (error) {
      console.error("Error checking referral code uniqueness:", error);
    }

    attempts++;
  }

  // Fallback: Use ObjectId + timestamp (guaranteed unique)
  const fallbackCode = `CM${customerId.toString().slice(-6)}${Date.now()
    .toString()
    .slice(-6)}`;
  console.warn(`Using fallback referral code: ${fallbackCode}`);
  return fallbackCode;
}

// Enhanced support ticket schema with media support
const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      default: function () {
        return "TICK" + Date.now().toString().slice(-8);
      },
    },
    orderId: String,
    type: {
      type: String,
      enum: [
        "delivery_issue",
        "product_issue",
        "payment_problem",
        "agent_request",
        "complaint",
        "address_change",
        "delivery_reschedule",
        "other",
      ],
      required: true,
    },
    subType: {
      type: String,
      enum: [
        // Delivery issues
        "track_order",
        "delivery_delayed",
        "change_delivery_address",
        "driver_location_issue",
        "marked_delivered_not_received",
        "reschedule_delivery",
        // Product issues
        "broken_item",
        "missing_wrong_amount",
        "wrong_item",
        "product_other",
        // Payment problems
        "paid_no_confirmation",
        "payment_failed",
        "paid_different_name",
        "charged_twice",
        "unsure_payment",
        "use_credited_funds",
      ],
    },
    issueDetails: String,
    customerMessage: String,

    // Media attachments (videos, images, voice notes)
    mediaAttachments: [
      {
        mediaId: String, // UltraMsg media ID
        mediaType: {
          type: String,
          enum: ["image", "video", "voice", "document"],
          required: true,
        },
        mimetype: String,
        filename: String,
        caption: String,
        base64Data: String, // Store media as base64
        fileSize: Number,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        ultraMsgUrl: String, // UltraMsg media URL if available
      },
    ],

    // Payment related data
    paymentData: {
      paymentScreenshot: {
        base64Data: String,
        mimetype: String,
        uploadedAt: Date,
      },
      payerName: String,
      isInternationalTransfer: Boolean,
      transactionId: String,
      bankName: String,
      paymentAmount: Number,
    },

    // Delivery related data
    deliveryData: {
      currentAddress: String,
      newAddress: String,
      newDeliveryDate: String,
      newDeliveryTime: String,
      nearbyLandmark: String,
      googleMapLink: String,
      isOrderDispatched: Boolean,
      extraChargesApplicable: Boolean,
      estimatedExtraCharge: Number,
    },

    // Product issue data
    productData: {
      affectedItems: [String], // List of product names
      issueDescription: String,
      damagePhotos: [
        {
          base64Data: String,
          mimetype: String,
          uploadedAt: Date,
        },
      ],
      customerPreference: {
        type: String,
        enum: ["keep_and_pay", "replace", "refund", "bring_to_facility"],
      },
    },

    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed", "escalated"],
      default: "open",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
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
    resolvedAt: Date,
    estimatedResolutionTime: String, // e.g., "within 1 hour", "1-2 business days"
  },
  { _id: false }
);

// Complaint schema for order-specific complaints
const complaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      required: true,
      default: function () {
        return "COMP" + Date.now().toString().slice(-8);
      },
    },
    orderId: String, // Optional - complaint may not be order related

    // Media attachments for complaints
    mediaAttachments: [
      {
        mediaId: String,
        mediaType: {
          type: String,
          enum: ["video", "voice", "image"],
          required: true,
        },
        mimetype: String,
        filename: String,
        base64Data: String,
        fileSize: Number,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    textSummary: String,
    isOrderRelated: Boolean,
    complaintCategory: String,
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    customerContactDetails: {
      preferredContactMethod: String,
      alternatePhone: String,
      email: String,
    },

    status: {
      type: String,
      enum: ["submitted", "under_review", "in_progress", "resolved"],
      default: "submitted",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    resolution: String,
    resolvedAt: Date,
  },
  { _id: false }
);

// Original complaint schema for order-specific complaints
const originalComplaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      required: true,
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

// Enhanced shopping history schema with full traceability
const shoppingHistorySchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
    },
    orderDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    items: [
      {
        productId: String,
        productName: String,
        category: String,
        subCategory: String,
        weight: String,
        quantity: Number,
        unitPrice: Number,
        totalPrice: Number,
        isDiscountedProduct: {
          type: Boolean,
          default: false,
        },
        onTruck: {
          type: Boolean,
          default: false,
        },

        // EXISTING PACKING FIELDS
        packingStatus: {
          type: String,
          enum: ["pending", "packing", "packed", "unavailable"],
          default: "pending",
        },
        packedAt: Date,
        packedBy: {
          staffId: String,
          staffName: String,
          timestamp: Date,
        },
        packingNotes: String,

        // ITEM-LEVEL PACKING COMPLAINTS
        itemComplaints: [
          {
            complaintId: {
              type: String,
              default: function () {
                return "ITEM_COMP_" + Date.now().toString().slice(-8);
              },
            },
            complaintType: {
              type: String,
              enum: [
                "not_available",
                "damaged",
                "expired",
                "insufficient_stock",
                "quality_issue",
                "other",
              ],
              required: true,
            },
            complaintDetails: String,
            reportedBy: {
              staffId: String,
              staffName: String,
              timestamp: {
                type: Date,
                default: Date.now,
              },
            },
            status: {
              type: String,
              enum: ["open", "resolved"],
              default: "open",
            },
            resolution: String,
            resolvedAt: Date,
          },
        ],

        // NEW STORAGE VERIFICATION FIELDS
        storageVerified: {
          type: Boolean,
          default: false,
        },
        storageCondition: {
          type: String,
          enum: ["good", "damaged", "missing"],
          default: "good",
        },
        verifiedAt: Date,
        verifiedBy: {
          staffId: String,
          staffName: String,
          timestamp: Date,
        },

        // ADD THESE MISSING LOADING VERIFICATION FIELDS:
        loadingVerified: {
          type: Boolean,
          default: false,
        },
        loadingNotes: {
          type: String,
          default: "",
        },
        loadingVerifiedAt: Date,
        loadingVerifiedBy: {
          staffId: String,
          staffName: String,
          timestamp: Date,
        },

        // STORAGE-LEVEL COMPLAINTS
        storageComplaints: [
          {
            complaintId: {
              type: String,
              default: function () {
                return "STORAGE_COMP_" + Date.now().toString().slice(-8);
              },
            },
            complaintType: {
              type: String,
              enum: [
                "damaged",
                "missing",
                "wrong_item",
                "quantity_mismatch",
                "packaging_issue",
                "other",
              ],
              required: true,
            },
            complaintDetails: String,
            reportedBy: {
              staffId: String,
              staffName: String,
              timestamp: {
                type: Date,
                default: Date.now,
              },
            },
            status: {
              type: String,
              enum: ["open", "resolved"],
              default: "open",
            },
            resolution: String,
            resolvedAt: Date,
          },
        ],
      },
    ],

    // Add to the main shoppingHistory object (same level as packingDetails):
    storageDetails: {
      verificationStartedAt: Date,
      verificationCompletedAt: Date,
      verificationStaff: {
        staffId: String,
        staffName: String,
      },
      storageNotes: String,
      storageLocation: String,
      totalItemsVerified: {
        type: Number,
        default: 0,
      },
      totalItemsRequested: {
        type: Number,
        default: 0,
      },
      verificationProgress: {
        type: Number, // Percentage
        default: 0,
      },
      hasStorageComplaints: {
        type: Boolean,
        default: false,
      },
    },
    // Additional fields to add to the Customer Schema shoppingHistory items
    // Add these fields to the existing shoppingHistorySchema

    // In the shoppingHistorySchema, add these new fields:

    // DISPATCH OFFICER 1 ASSIGNMENT FIELDS
    assignmentDetails: {
      assignedVehicle: {
        vehicleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "VehicleType",
        },
        vehicleName: String,
        displayName: String,
        category: {
          type: String,
          enum: ["scooter", "truck"],
        },
        specifications: {
          maxVolume: Number,
          maxWeight: Number,
          maxPackages: Number,
        },
      },
      assignedDriver: {
        employeeId: String,
        employeeName: String,
        phone: String,
        currentAssignments: Number,
        expertise: [String], // ["truck", "scooter"]
      },
      assignedAt: Date,
      assignedBy: {
        employeeId: String,
        employeeName: String,
      },
      notes: String,
    },

    // ORDER REQUIREMENTS CALCULATION
    orderRequirements: {
      calculatedVolume: {
        type: Number,
        default: 0,
      },
      calculatedWeight: {
        type: Number,
        default: 0,
      },
      totalPackages: {
        type: Number,
        default: 0,
      },
      lastCalculated: Date,
    },

    // Add new status values to the existing status enum:
    // Add "assigned-dispatch-officer-2" to the status enum array

    // UPDATED STATUS ENUM (add this to the existing enum array):
    /*
status: {
  type: String,
  enum: [
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
    "assigned-dispatch-officer-2", // NEW STATUS
    "order-not-pickedup",
    "order-pickuped-up",
    "on-way",
    "driver-confirmed",
    "order-processed",
    "refund",
    "complain-order",
    "issue-driver",
    "parcel-returned",
    "order-complete",
  ],
  default: "cart-not-paid",
},
*/ loadingDetails: {
      verificationStartedAt: Date,
      verificationCompletedAt: Date,
      verificationStaff: {
        staffId: String,
        staffName: String,
      },
      loadingNotes: String,
      totalItemsLoaded: {
        type: Number,
        default: 0,
      },
      totalItemsRequested: {
        type: Number,
        default: 0,
      },
      loadingProgress: {
        type: Number, // Percentage
        default: 0,
      },
      isReadyForDispatch: {
        type: Boolean,
        default: false,
      },
    },
    // DRIVER ON DELIVERY FIELDS
    driverVerification: {
      verified: {
        type: Boolean,
        default: false,
      },
      verifiedAt: Date,
      verifiedBy: {
        driverId: String,
        driverName: String,
      },
      notes: String,
    },

    // ROUTE AND DELIVERY TRACKING
    routeStartedAt: Date,
    routeStartedBy: {
      driverId: String,
      driverName: String,
    },

    arrivedAt: Date,
    arrivedBy: {
      driverId: String,
      driverName: String,
    },
    arrivalLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
    },

    // DELIVERY PHOTOS/VIDEOS
    deliveryPhotos: [
      {
        photoId: String,
        filename: String,
        mimetype: String,
        fileSize: Number,
        base64Data: String,
        uploadedAt: Date,
        uploadedBy: {
          driverId: String,
          driverName: String,
        },
        notes: String,
      },
    ],

    // DELIVERY COMPLETION
    deliveredAt: Date,
    deliveredBy: {
      driverId: String,
      driverName: String,
    },
    customerConfirmed: {
      type: Boolean,
      default: false,
    },
    deliveryNotes: String,
    customerSatisfaction: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
    },
    customerSignature: String,
    totalAmount: {
      type: Number,
      required: true,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
    },
    discounts: {
      firstOrderDiscount: { type: Number, default: 0 },
      ecoDeliveryDiscount: { type: Number, default: 0 },
      referralDiscount: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: [
        "cart-not-paid",
        "order-made-not-paid",
        "pay-not-confirmed",
        "on-route",
        "order-complete",
        "ready for driver",
        "order-confirmed",
        "order not picked",
        "issue-customer",
        "customer-confirmed",
        "order-refunded",
        "picking-order",
        "allocated-driver",
        "assigned-dispatch-officer-2",
        "ready to pickup",
        "order-not-pickedup",
        "order-pickuped-up",
        "on-way",
        "driver-confirmed",
        "order-processed",
        "refund",
        "complain-order",
        "issue-driver",
        "parcel-returned",
        "order-complete",
      ],
      default: "cart-not-paid",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: String,
    transactionId: String,
    deliveryOption: String,
    deliveryLocation: String,
    deliveryTimeFrame: String,
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
    deliveryAddress: {
      nickname: String,
      area: String,
      fullAddress: String,
      googleMapLink: String,
    },
    deliveryDate: Date,
    timeSlot: { type: String, default: null },
    driver1: { type: String, default: null },
    driver2: { type: String, default: null },
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
    adminReason: String,
    pickupAllocated: {
      type: Boolean,
      default: false,
    },
    allocatedAt: Date,
    accountHolderName: {
      type: String,
      default: "",
    },
    paidBankName: {
      type: String,
      default: "",
    },
    receiptImage: {
      data: String,
      contentType: String,
    },
    receiptImageMetadata: {
      mimetype: String,
      timestamp: Date,
    },

    // Refund/Replace tracking with full traceability
    refunds: [
      {
        refundId: {
          type: String,
          required: true,
          default: function () {
            return "REF" + Date.now().toString().slice(-8);
          },
        },
        refundDate: {
          type: Date,
          default: Date.now,
        },
        refundAmount: Number,
        refundReason: {
          type: String,
          required: true,
        },
        refundedItems: [
          {
            productId: String,
            productName: String,
            quantity: Number,
            refundAmount: Number,
          },
        ],
        staffSignature: {
          staffId: {
            type: String,
            required: true,
          },
          staffName: String,
          signatureDate: {
            type: Date,
            default: Date.now,
          },
        },
        isImmutable: {
          type: Boolean,
          default: true,
        },
      },
    ],

    replacements: [
      {
        replacementId: {
          type: String,
          required: true,
          default: function () {
            return "REP" + Date.now().toString().slice(-8);
          },
        },
        replacementDate: {
          type: Date,
          default: Date.now,
        },
        replacementReason: {
          type: String,
          required: true,
        },
        originalItems: [
          {
            productId: String,
            productName: String,
            quantity: Number,
          },
        ],
        replacementItems: [
          {
            productId: String,
            productName: String,
            quantity: Number,
            newPrice: Number,
          },
        ],
        priceDifference: Number,
        staffSignature: {
          staffId: {
            type: String,
            required: true,
          },
          staffName: String,
          signatureDate: {
            type: Date,
            default: Date.now,
          },
        },
        isImmutable: {
          type: Boolean,
          default: true,
        },
      },
    ],

    corrections: [
      {
        correctionId: {
          type: String,
          required: true,
          default: function () {
            return "COR" + Date.now().toString().slice(-8);
          },
        },
        correctionDate: {
          type: Date,
          default: Date.now,
        },
        originalField: String,
        originalValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        correctionReason: {
          type: String,
          required: true,
        },
        staffSignature: {
          staffId: {
            type: String,
            required: true,
          },
          staffName: String,
          signatureDate: {
            type: Date,
            default: Date.now,
          },
        },
        isImmutable: {
          type: Boolean,
          default: true,
        },
      },
    ],

    // Add complaints array to each order
    complaints: [originalComplaintSchema],
  },
  { _id: false }
);

// Enhanced referral tracking schema
const referralTrackingSchema = new mongoose.Schema(
  {
    // Primary referrer (the one who gets commission)
    primaryReferrer: {
      customerId: String,
      customerName: String,
      phoneNumber: String,
      referralCode: String,
      referralDate: Date,
      videoId: String, // Reference to the video used for referral
    },
    // Additional referrers (for data tracking only)
    additionalReferrers: [
      {
        customerId: String,
        customerName: String,
        phoneNumber: String,
        referralCode: String,
        referralDate: Date,
        videoId: String,
      },
    ],
    // Track all people who have referred this customer
    allReferralSources: [
      {
        customerId: String,
        customerName: String,
        phoneNumber: String,
        referralCode: String,
        referralDate: Date,
        method: {
          type: String,
          enum: ["video", "code", "direct"],
          default: "video",
        },
      },
    ],
  },
  { _id: false }
);

// Enhanced foreman status tracking
const foremanStatusSchema = new mongoose.Schema(
  {
    // Step 1: Become a Foreman (Manual Admin Approval Required)
    isForemanApproved: {
      type: Boolean,
      default: false,
    },
    foremanApprovalDate: Date,
    foremanApprovedBy: {
      staffId: String,
      staffName: String,
    },

    // Step 2: Become Eligible for Commission (Separate Manual Admin Approval Required)
    isCommissionEligible: {
      type: Boolean,
      default: false,
    },
    commissionEligibilityDate: Date,
    commissionApprovedBy: {
      staffId: String,
      staffName: String,
    },

    // Commission settings
    commissionRate: {
      type: Number,
      default: 5, // 5% default commission rate
    },

    // Status history (immutable)
    statusHistory: [
      {
        action: {
          type: String,
          enum: [
            "foreman_approved",
            "foreman_revoked",
            "commission_approved",
            "commission_revoked",
          ],
          required: true,
        },
        actionDate: {
          type: Date,
          default: Date.now,
        },
        staffSignature: {
          staffId: String,
          staffName: String,
        },
        reason: String,
        isImmutable: {
          type: Boolean,
          default: true,
        },
      },
    ],
  },
  { _id: false }
);

// Commission tracking schema
const commissionTrackingSchema = new mongoose.Schema(
  {
    totalCommissionEarned: {
      type: Number,
      default: 0,
    },
    totalCommissionPaid: {
      type: Number,
      default: 0,
    },
    availableCommission: {
      type: Number,
      default: 0,
    },

    // Detailed commission history
    commissionHistory: [
      {
        commissionId: {
          type: String,
          required: true,
          default: function () {
            return "COM" + Date.now().toString().slice(-8);
          },
        },
        type: {
          type: String,
          enum: ["earned", "paid", "adjustment"],
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
        relatedOrderId: String, // Order that generated this commission
        referredCustomerId: String, // Customer who made the purchase
        referredCustomerName: String,
        commissionRate: Number, // Rate used for calculation
        baseAmount: Number, // Original order amount
        notes: String,
        isPaid: {
          type: Boolean,
          default: false,
        },
        paidDate: Date,
        staffSignature: {
          staffId: String,
          staffName: String,
          signatureDate: Date,
        },
        isImmutable: {
          type: Boolean,
          default: true,
        },
      },
    ],
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
  "order-processed",
  "refund",
  "complain-order",
  "issue-driver",
  "parcel-returned",
  "order-complete",
];

// Helper function for phone number validation
function arrayLimit(val) {
  return val.length > 0;
}

// Main customer schema with all enhancements
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

    // Track if first time customer
    isFirstTimeCustomer: {
      type: Boolean,
      default: true, // Set to false after first confirmed order
    },

    // Remember which order we last created/updated
    latestOrderId: {
      type: String,
      default: null,
      index: true,
    },

    // Optional metadata to track linked/migrated numbers
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
    email: String,

    conversationState: {
      type: String,
      default: "new", // Tracks where they are in the conversation flow
    },

    // Current support conversation tracking
    currentSupportFlow: {
      mainCategory: String, // "delivery_product", "check_delivery", "payment", etc.
      subCategory: String, // "delivery_issue", "product_issue", etc.
      specificIssue: String, // "track_order", "broken_item", etc.
      currentStep: String, // Current step in the flow
      tempData: mongoose.Schema.Types.Mixed, // Temporary data during conversation
      mediaExpected: Boolean, // Whether we're expecting media upload
      lastInteraction: Date,
      sessionId: String, // To track support sessions
    },

    // Enhanced support tickets with media
    supportTickets: [supportTicketSchema],

    // Complaints with media support
    complaints: [complaintSchema],

    // Support interaction history
    supportInteractionHistory: [
      {
        sessionId: String,
        startTime: Date,
        endTime: Date,
        category: String,
        issueResolved: Boolean,
        satisfaction: Number, // 1-5 rating
        agentInvolved: Boolean,
        totalMessages: Number,
        mediaShared: Number,
        lastAction: String,
        lastActionTime: Date,
      },
    ],

    // Support preferences
    supportPreferences: {
      preferredLanguage: {
        type: String,
        default: "english",
      },
      contactMethod: {
        type: String,
        enum: ["whatsapp", "phone", "email"],
        default: "whatsapp",
      },
      allowMediaSharing: {
        type: Boolean,
        default: true,
      },
    },

    // FAQ interaction tracking
    faqInteractions: [
      {
        question: String,
        category: String,
        timestamp: Date,
        helpful: Boolean,
      },
    ],

    // Delivery address change history
    addressChangeHistory: [
      {
        orderId: String,
        oldAddress: String,
        newAddress: String,
        requestedAt: Date,
        status: {
          type: String,
          enum: ["pending", "approved", "rejected", "too_late"],
          default: "pending",
        },
        extraCharges: Number,
        approvedAt: Date,
      },
    ],

    // Payment issue tracking
    paymentIssues: [
      {
        issueId: String,
        orderId: String,
        issueType: String,
        description: String,
        paymentScreenshot: {
          base64Data: String,
          mimetype: String,
          uploadedAt: Date,
        },
        payerName: String,
        isInternationalTransfer: Boolean,
        status: {
          type: String,
          enum: ["reported", "investigating", "resolved"],
          default: "reported",
        },
        reportedAt: Date,
        resolvedAt: Date,
      },
    ],

    // Media storage for support
    supportMedia: [
      {
        mediaId: String,
        ticketId: String,
        mediaType: String,
        base64Data: String,
        mimetype: String,
        fileSize: Number,
        uploadedAt: Date,
        description: String,
      },
    ],

    // FIXED REFERRAL CODE FIELD - Now with guaranteed uniqueness
    referralCode: {
      type: String,
      unique: true,
      sparse: true, // Allows null during creation
      index: true,
    },

    // Who referred this customer
    referralTracking: referralTrackingSchema,

    // In the customerSchema, replace the customersReferred array with this:
    customersReferred: [
      {
        customerId: {
          type: mongoose.Schema.Types.ObjectId, // Changed to ObjectId reference
          ref: "Customer", // Reference to the actual Customer document
          required: true,
        },
        customerName: String,
        phoneNumber: String,
        referralDate: Date,
        videoUsed: String,
        hasPlacedOrder: {
          type: Boolean,
          default: false,
        },
        firstOrderDate: Date,
        totalOrdersCount: {
          type: Number,
          default: 0,
        },
        totalSpentAmount: {
          type: Number,
          default: 0,
        },
        commissionGenerated: {
          type: Number,
          default: 0,
        },
        _id: false,
      },
    ],
    referraldemovideos: [
      {
        videoId: mongoose.Schema.Types.ObjectId,
        title: String,
        mimetype: String,
        filename: String,
        fileSize: Number,
        base64Data: String, // Binary data as base64
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        uploadDate: {
          type: Date,
          default: Date.now,
        },
        ultraMsgCompatible: Boolean,
      },
    ],

    // Enhanced referral videos section
    referralvideos: [
      {
        imageId: {
          type: String,
          required: true,
        },
        mediaType: {
          type: String,
          default: "video",
        },
        mimetype: {
          type: String,
          default: "video/mp4",
        },
        filename: String,
        ultraMsgMediaId: String,
        base64Data: {
          type: String,
          required: true,
        },
        fileSize: {
          type: Number, // Size in MB
          required: true,
        },
        approvalDate: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["unverified", "verified", "manager", "spam"],
          default: "unverified",
        },
        statusUpdatedAt: {
          type: Date,
          default: Date.now,
        },
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
        adminNotes: String,
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

    // Enhanced foreman and commission tracking
    foremanStatus: foremanStatusSchema,
    commissionTracking: commissionTrackingSchema,

    // Enhanced shopping history with full traceability (REPLACES orderHistory)
    shoppingHistory: [shoppingHistorySchema],

    // Keep orderHistory for backward compatibility but mark as deprecated
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
            loadingVerified: {
              type: Boolean,
              default: false,
            },
            loadingNotes: {
              type: String,
              default: "",
            },
            loadingVerifiedAt: Date,
            loadingVerifiedBy: {
              staffId: String,
              staffName: String,
              timestamp: Date,
            },
            totalPrice: Number,
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
        deliveryTimeFrame: String,
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
        deliveryAddress: {
          nickname: String,
          area: String,
          fullAddress: String,
          googleMapLink: String,
        },
        ecoDeliveryDiscount: {
          type: Number,
          default: 0,
        },
        adminReason: String,
        pickupAllocated: {
          type: Boolean,
          default: false,
        },
        allocatedAt: Date,
        complaints: [originalComplaintSchema],
      },
    ],

    // Current cart (unchanged)
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
      totalAmount: {
        type: Number,
        default: 0,
      },
      deliveryCharge: {
        type: Number,
        default: 0,
      },
      deliveryOption: {
        type: String,
        default: "Normal Delivery",
      },
      deliveryLocation: {
        type: String,
        default: "",
      },
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
      firstOrderDiscount: {
        type: Number,
        default: 0,
      },
      ecoDeliveryDiscount: {
        type: Number,
        default: 0,
      },
      deliveryTimeFrame: {
        type: String,
        default: "",
      },
      deliveryAddress: {
        nickname: String,
        area: String,
        fullAddress: String,
        googleMapLink: String,
      },
    },

    // Discount products tracking
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

    tempVerificationTries: { type: Number, default: 0 },
    pendingVerificationOldNumber: { type: String, default: null },
    tempNumberToSwitch: { type: String, default: null },

    ecoDeliveryDiscount: {
      type: Number,
      default: 0,
    },

    pickupDateList: {
      type: [String],
      default: [],
    },

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

      editAddressIndex: Number,
      editAddressField: String,
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
      temporaryItemDetails: Object,

      // Support-related context data
      reportingOrderId: String,
      issueType: String,
      issueDetails: String,
      complaintDetails: String,
      paymentScreenshot: Object,
      payerName: String,
      isInternationalTransfer: Boolean,
      complaintMedia: Object,
      textSummary: String,
      isOrderRelated: Boolean,
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

// PRE-SAVE MIDDLEWARE - Guarantees unique referral codes
customerSchema.pre("save", async function (next) {
  try {
    // Only generate referral code if it doesn't exist
    if (!this.referralCode && this.phoneNumber && this.phoneNumber.length > 0) {
      console.log(
        `Generating referral code for customer: ${this.name || "Unknown"}`
      );

      this.referralCode = await generateUniqueReferralCode(
        this.phoneNumber[0],
        this._id
      );

      console.log(`Generated referral code: ${this.referralCode}`);
    }

    next();
  } catch (error) {
    console.error("Error in referral code generation:", error);
    next(error);
  }
});

// POST-SAVE MIDDLEWARE - Handle any remaining issues
customerSchema.post("save", function (error, doc, next) {
  if (
    error &&
    error.code === 11000 &&
    error.keyPattern &&
    error.keyPattern.referralCode
  ) {
    console.error("Duplicate referral code detected, attempting retry...");

    // Generate new code and retry
    generateUniqueReferralCode(doc.phoneNumber[0], doc._id)
      .then((newCode) => {
        doc.referralCode = newCode;
        return doc.save();
      })
      .then(() => next())
      .catch((retryError) => {
        console.error("Failed to resolve duplicate referral code:", retryError);
        next(new Error("Could not generate unique referral code"));
      });
  } else {
    next(error);
  }
});

// MIGRATION SCRIPT - Fix existing customers
customerSchema.statics.fixAllReferralCodes = async function () {
  try {
    console.log("Starting referral code migration...");

    // Find customers without referral codes or with duplicate issues
    const customersToFix = await this.find({
      $or: [
        { referralCode: { $exists: false } },
        { referralCode: null },
        { referralCode: "" },
        { referralCode: /^CM68789a/ }, // Fix the problematic pattern
      ],
    });

    console.log(`Found ${customersToFix.length} customers to fix`);

    for (let i = 0; i < customersToFix.length; i++) {
      const customer = customersToFix[i];

      try {
        if (customer.phoneNumber && customer.phoneNumber.length > 0) {
          const newCode = await generateUniqueReferralCode(
            customer.phoneNumber[0],
            customer._id
          );

          await this.updateOne(
            { _id: customer._id },
            { $set: { referralCode: newCode } }
          );

          console.log(`Fixed customer ${customer.name}: ${newCode}`);
        }
      } catch (error) {
        console.error(`Failed to fix customer ${customer._id}:`, error);
      }
    }

    console.log("Referral code migration completed");
  } catch (error) {
    console.error("Error in referral code migration:", error);
    throw error;
  }
};

// UTILITY METHOD - Regenerate referral code for specific customer
customerSchema.methods.regenerateReferralCode = async function () {
  try {
    const newCode = await generateUniqueReferralCode(
      this.phoneNumber[0],
      this._id
    );

    this.referralCode = newCode;
    await this.save();

    return newCode;
  } catch (error) {
    console.error("Error regenerating referral code:", error);
    throw error;
  }
};
customerSchema.methods.verifyItemForLoading = function (
  orderId,
  itemIndex,
  verified,
  notes,
  staffInfo
) {
  const orderIndex = this.shoppingHistory.findIndex(
    (o) => o.orderId === orderId
  );

  if (orderIndex === -1) {
    throw new Error("Order not found");
  }

  if (!this.shoppingHistory[orderIndex].items[itemIndex]) {
    throw new Error("Item not found");
  }

  // Update item loading verification
  this.shoppingHistory[orderIndex].items[itemIndex].loadingVerified = verified;
  this.shoppingHistory[orderIndex].items[itemIndex].loadingNotes = notes || "";
  this.shoppingHistory[orderIndex].items[itemIndex].loadingVerifiedAt =
    new Date();
  this.shoppingHistory[orderIndex].items[itemIndex].loadingVerifiedBy = {
    ...staffInfo,
    timestamp: new Date(),
  };

  // Update loading details progress
  const order = this.shoppingHistory[orderIndex];
  const verifiedItems = order.items.filter(
    (item) => item.loadingVerified === true
  ).length;
  const totalItems = order.items.length;

  if (!order.loadingDetails) order.loadingDetails = {};
  order.loadingDetails.totalItemsLoaded = verifiedItems;
  order.loadingDetails.totalItemsRequested = totalItems;
  order.loadingDetails.loadingProgress = Math.round(
    (verifiedItems / totalItems) * 100
  );

  return this.save();
};

// METHOD TO COMPLETE ORDER LOADING
// Add this method to customerSchema.methods

customerSchema.methods.completeOrderLoading = function (
  orderId,
  loadingNotes,
  staffInfo
) {
  const orderIndex = this.shoppingHistory.findIndex(
    (o) => o.orderId === orderId
  );

  if (orderIndex === -1) {
    throw new Error("Order not found");
  }

  const order = this.shoppingHistory[orderIndex];

  // Check if all items are verified
  const allItemsVerified = order.items.every(
    (item) => item.loadingVerified === true
  );

  if (!allItemsVerified) {
    throw new Error(
      "Cannot complete loading. Some items are still pending verification."
    );
  }

  // Update order status to ready for driver
  this.shoppingHistory[orderIndex].status = "ready for driver";

  // Update loading details
  if (!this.shoppingHistory[orderIndex].loadingDetails) {
    this.shoppingHistory[orderIndex].loadingDetails = {};
  }

  this.shoppingHistory[orderIndex].loadingDetails.verificationCompletedAt =
    new Date();
  this.shoppingHistory[orderIndex].loadingDetails.loadingNotes = loadingNotes;
  this.shoppingHistory[orderIndex].loadingDetails.loadingProgress = 100;
  this.shoppingHistory[orderIndex].loadingDetails.isReadyForDispatch = true;

  return this.save();
};

// METHOD TO GET ORDERS READY FOR VERIFICATION
// Add this static method to customerSchema.statics

customerSchema.statics.getOrdersForVerification = async function () {
  const customers = await this.find({
    "shoppingHistory.status": {
      $in: ["assigned-dispatch-officer-2", "ready for driver"],
    },
  }).lean();

  let orders = [];

  for (let customer of customers) {
    for (let order of customer.shoppingHistory) {
      if (
        ["assigned-dispatch-officer-2", "ready for driver"].includes(
          order.status
        )
      ) {
        orders.push({
          customerId: customer._id,
          customerName: customer.name,
          customerPhone: customer.phoneNumber[0] || "",
          ...order,
        });
      }
    }
  }

  return orders;
};

// METHOD TO GET VEHICLE ASSIGNMENTS
// Add this static method to customerSchema.statics

customerSchema.statics.getVehicleAssignments = async function () {
  const customers = await this.find({
    "shoppingHistory.status": {
      $in: ["assigned-dispatch-officer-2", "ready for driver"],
    },
  }).lean();

  let vehicleAssignments = {};

  for (let customer of customers) {
    for (let order of customer.shoppingHistory) {
      if (
        ["assigned-dispatch-officer-2", "ready for driver"].includes(
          order.status
        )
      ) {
        const assignmentDetails = order.assignmentDetails;

        if (assignmentDetails && assignmentDetails.assignedVehicle) {
          const vehicleId = assignmentDetails.assignedVehicle.vehicleId;

          if (!vehicleAssignments[vehicleId]) {
            vehicleAssignments[vehicleId] = {
              vehicleInfo: assignmentDetails.assignedVehicle,
              orders: [],
            };
          }

          vehicleAssignments[vehicleId].orders.push({
            orderId: order.orderId,
            customerName: customer.name,
            status: order.status,
            items: order.items || [],
            loadingDetails: order.loadingDetails || {},
          });
        }
      }
    }
  }

  return vehicleAssignments;
};
// ENHANCED METHODS FOR REFERRAL AND COMMISSION SYSTEM

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

// Method to create new order from cart (DEPRECATED - use addToShoppingHistory instead)
customerSchema.methods.createOrder = function () {
  const orderId = "ORD" + Date.now().toString().slice(-8);

  const newOrder = {
    orderId: orderId,
    items: [...this.cart.items],
    totalAmount: this.cart.totalAmount + (this.cart.deliveryCharge || 0),
    deliveryOption: this.cart.deliveryOption,
    deliveryLocation: this.cart.deliveryLocation,
    deliveryCharge: this.cart.deliveryCharge,
    paymentStatus: "pending",
    orderDate: new Date(),
  };

  this.orderHistory.push(newOrder);

  return this.save().then(() => orderId);
};

// ENHANCED METHODS FOR SHOPPING HISTORY

// Method to add order to shopping history
customerSchema.methods.addToShoppingHistory = function (orderData) {
  this.shoppingHistory.push(orderData);
  this.isFirstTimeCustomer = false;
  return this.save();
};

// ENHANCED METHODS FOR REFERRAL SYSTEM

// Method to add referral
customerSchema.methods.addReferral = function (referrerData, isPrimary = true) {
  if (!this.referralTracking) {
    this.referralTracking = {
      primaryReferrer: null,
      additionalReferrers: [],
      allReferralSources: [],
    };
  }

  const referralEntry = {
    ...referrerData,
    referralDate: new Date(),
  };

  // Add to all referral sources
  this.referralTracking.allReferralSources.push(referralEntry);

  if (isPrimary && !this.referralTracking.primaryReferrer) {
    // Set as primary referrer only if no primary exists
    this.referralTracking.primaryReferrer = referralEntry;
  } else {
    // Add to additional referrers
    this.referralTracking.additionalReferrers.push(referralEntry);
  }

  return this.save();
};

// ENHANCED METHODS FOR FOREMAN STATUS

// Method to update foreman status
customerSchema.methods.updateForemanStatus = function (
  isApproved,
  staffInfo,
  reason = ""
) {
  if (!this.foremanStatus) {
    this.foremanStatus = {
      isForemanApproved: false,
      isCommissionEligible: false,
      commissionRate: 5,
      statusHistory: [],
    };
  }

  this.foremanStatus.isForemanApproved = isApproved;

  if (isApproved) {
    this.foremanStatus.foremanApprovalDate = new Date();
    this.foremanStatus.foremanApprovedBy = staffInfo;
  }

  // Add to history
  this.foremanStatus.statusHistory.push({
    action: isApproved ? "foreman_approved" : "foreman_revoked",
    actionDate: new Date(),
    staffSignature: staffInfo,
    reason: reason,
  });

  return this.save();
};

// Method to update commission eligibility
customerSchema.methods.updateCommissionEligibility = function (
  isEligible,
  staffInfo,
  reason = ""
) {
  if (!this.foremanStatus) {
    this.foremanStatus = {
      isForemanApproved: false,
      isCommissionEligible: false,
      commissionRate: 5,
      statusHistory: [],
    };
  }

  this.foremanStatus.isCommissionEligible = isEligible;

  if (isEligible) {
    this.foremanStatus.commissionEligibilityDate = new Date();
    this.foremanStatus.commissionApprovedBy = staffInfo;

    // Initialize commission tracking if not exists
    if (!this.commissionTracking) {
      this.commissionTracking = {
        totalCommissionEarned: 0,
        totalCommissionPaid: 0,
        availableCommission: 0,
        commissionHistory: [],
      };
    }
  }

  // Add to history
  this.foremanStatus.statusHistory.push({
    action: isEligible ? "commission_approved" : "commission_revoked",
    actionDate: new Date(),
    staffSignature: staffInfo,
    reason: reason,
  });

  return this.save();
};

// ENHANCED METHODS FOR COMMISSION MANAGEMENT

// Method to calculate and add commission
customerSchema.methods.addCommissionEarned = function (
  orderData,
  referredCustomerData
) {
  // Only add commission if eligible and order date is after eligibility date
  if (!this.foremanStatus?.isCommissionEligible) {
    return Promise.resolve();
  }

  const eligibilityDate = this.foremanStatus.commissionEligibilityDate;
  const orderDate = new Date(orderData.orderDate);

  if (eligibilityDate && orderDate < eligibilityDate) {
    console.log(
      `Order ${orderData.orderId} placed before commission eligibility date`
    );
    return Promise.resolve();
  }

  // Calculate commission (exclude discounted products)
  const eligibleAmount = orderData.items.reduce((sum, item) => {
    return sum + (item.isDiscountedProduct ? 0 : item.totalPrice);
  }, 0);

  const commissionRate = this.foremanStatus.commissionRate || 5;
  const commissionAmount = (eligibleAmount * commissionRate) / 100;

  if (commissionAmount <= 0) {
    return Promise.resolve();
  }

  // Initialize commission tracking if not exists
  if (!this.commissionTracking) {
    this.commissionTracking = {
      totalCommissionEarned: 0,
      totalCommissionPaid: 0,
      availableCommission: 0,
      commissionHistory: [],
    };
  }

  // Update totals
  this.commissionTracking.totalCommissionEarned += commissionAmount;
  this.commissionTracking.availableCommission += commissionAmount;

  // Add to history
  this.commissionTracking.commissionHistory.push({
    type: "earned",
    amount: commissionAmount,
    date: new Date(),
    relatedOrderId: orderData.orderId,
    referredCustomerId: referredCustomerData.customerId,
    referredCustomerName: referredCustomerData.customerName,
    commissionRate: commissionRate,
    baseAmount: eligibleAmount,
    notes: `Commission earned from order ${orderData.orderId}`,
    isPaid: false,
  });

  return this.save();
};

// Method to pay commission
customerSchema.methods.payCommission = function (
  amount,
  staffInfo,
  notes = ""
) {
  if (!this.commissionTracking) {
    throw new Error("No commission tracking found");
  }

  if (amount > this.commissionTracking.availableCommission) {
    throw new Error("Cannot pay more than available commission");
  }

  // Update totals
  this.commissionTracking.totalCommissionPaid += amount;
  this.commissionTracking.availableCommission -= amount;

  // Add to history
  this.commissionTracking.commissionHistory.push({
    type: "paid",
    amount: amount,
    date: new Date(),
    notes: notes,
    isPaid: true,
    paidDate: new Date(),
    staffSignature: {
      ...staffInfo,
      signatureDate: new Date(),
    },
  });

  return this.save();
};

// Method to check if customer can see commission options
customerSchema.methods.canSeeCommissionOptions = function () {
  return this.foremanStatus?.isCommissionEligible === true;
};

// Method to get referral dashboard data
customerSchema.methods.getReferralDashboard = function () {
  return {
    referralCode: this.referralCode,
    customersReferred: this.customersReferred || [],
    totalReferrals: this.customersReferred?.length || 0,
    successfulReferrals:
      this.customersReferred?.filter((r) => r.hasPlacedOrder).length || 0,
    totalCommissionGenerated:
      this.customersReferred?.reduce(
        (sum, r) => sum + (r.commissionGenerated || 0),
        0
      ) || 0,
    isForemanApproved: this.foremanStatus?.isForemanApproved || false,
    isCommissionEligible: this.foremanStatus?.isCommissionEligible || false,
    commissionData: this.commissionTracking || {
      totalCommissionEarned: 0,
      totalCommissionPaid: 0,
      availableCommission: 0,
    },
  };
};

// SUPPORT SYSTEM METHODS (keeping existing functionality)

// Method to create support ticket with media
customerSchema.methods.createSupportTicket = function (ticketData) {
  if (!this.supportTickets) {
    this.supportTickets = [];
  }

  const ticket = {
    ticketId: "TICK" + Date.now().toString().slice(-8),
    ...ticketData,
    createdAt: new Date(),
    lastUpdated: new Date(),
  };

  this.supportTickets.push(ticket);
  return this.save().then(() => ticket.ticketId);
};

// Method to add media to support ticket
customerSchema.methods.addMediaToTicket = function (ticketId, mediaData) {
  const ticket = this.supportTickets.find((t) => t.ticketId === ticketId);
  if (ticket) {
    if (!ticket.mediaAttachments) {
      ticket.mediaAttachments = [];
    }
    ticket.mediaAttachments.push({
      ...mediaData,
      uploadedAt: new Date(),
    });
    ticket.lastUpdated = new Date();
    return this.save();
  }
  return Promise.reject(new Error("Ticket not found"));
};

// Method to create complaint with media
customerSchema.methods.createComplaint = function (complaintData) {
  if (!this.complaints) {
    this.complaints = [];
  }

  const complaint = {
    complaintId: "COMP" + Date.now().toString().slice(-8),
    ...complaintData,
    submittedAt: new Date(),
  };

  this.complaints.push(complaint);
  return this.save().then(() => complaint.complaintId);
};

// Method to update support flow state
customerSchema.methods.updateSupportFlow = function (flowData) {
  if (!this.currentSupportFlow) {
    this.currentSupportFlow = {};
  }

  this.currentSupportFlow = {
    ...this.currentSupportFlow,
    ...flowData,
    lastInteraction: new Date(),
  };
  return this.save();
};

// Method to clear support flow
customerSchema.methods.clearSupportFlow = function () {
  this.currentSupportFlow = {
    mainCategory: null,
    subCategory: null,
    specificIssue: null,
    currentStep: null,
    tempData: {},
    mediaExpected: false,
    lastInteraction: new Date(),
    sessionId: null,
  };
  return this.save();
};

// Method to log support interaction
customerSchema.methods.logSupportInteraction = function (action, details = {}) {
  if (!this.supportInteractionHistory) {
    this.supportInteractionHistory = [];
  }

  const sessionId = this.currentSupportFlow?.sessionId || "SESS" + Date.now();

  let currentSession = this.supportInteractionHistory.find(
    (session) => session.sessionId === sessionId
  );

  if (currentSession) {
    currentSession.totalMessages += 1;
    currentSession.lastAction = action;
    currentSession.lastActionTime = new Date();
    if (details.mediaShared) {
      currentSession.mediaShared += 1;
    }
  } else {
    // Create new session
    this.supportInteractionHistory.push({
      sessionId: sessionId,
      startTime: new Date(),
      category: this.currentSupportFlow?.mainCategory || "unknown",
      totalMessages: 1,
      mediaShared: details.mediaShared ? 1 : 0,
      lastAction: action,
      lastActionTime: new Date(),
    });

    // Update current support flow with session ID
    if (this.currentSupportFlow) {
      this.currentSupportFlow.sessionId = sessionId;
    }
  }

  return this.save();
};

// Method to add payment issue
customerSchema.methods.addPaymentIssue = function (issueData) {
  if (!this.paymentIssues) {
    this.paymentIssues = [];
  }

  const paymentIssue = {
    issueId: "PAY" + Date.now().toString().slice(-8),
    ...issueData,
    reportedAt: new Date(),
  };

  this.paymentIssues.push(paymentIssue);
  return this.save().then(() => paymentIssue.issueId);
};

// Method to add address change request
customerSchema.methods.addAddressChangeRequest = function (changeData) {
  if (!this.addressChangeHistory) {
    this.addressChangeHistory = [];
  }

  const addressChange = {
    ...changeData,
    requestedAt: new Date(),
    status: "pending",
  };

  this.addressChangeHistory.push(addressChange);
  return this.save();
};

// Method to add FAQ interaction
customerSchema.methods.addFAQInteraction = function (question, category) {
  if (!this.faqInteractions) {
    this.faqInteractions = [];
  }

  this.faqInteractions.push({
    question: question,
    category: category,
    timestamp: new Date(),
    helpful: true,
  });

  return this.save();
};

// Method to save support media
customerSchema.methods.saveSupportMedia = function (mediaData) {
  if (!this.supportMedia) {
    this.supportMedia = [];
  }

  const supportMediaItem = {
    ...mediaData,
    uploadedAt: new Date(),
  };

  this.supportMedia.push(supportMediaItem);
  return this.save();
};

// Method to update order status (DEPRECATED - use shoppingHistory instead)
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

// UTILITY METHODS

// Method to calculate performance score
customerSchema.methods.calculatePerformanceScore = function () {
  const referrals = this.customersReferred?.length || 0;
  const videos = this.referralvideos ? this.referralvideos.length : 0;
  const totalSpent = this.getTotalSpent();
  const orders = this.shoppingHistory ? this.shoppingHistory.length : 0;

  // Performance scoring algorithm
  const referralScore = Math.min(referrals * 10, 40); // Max 40 points
  const videoScore = Math.min(videos * 5, 20); // Max 20 points
  const spendingScore = Math.min(totalSpent / 50, 25); // Max 25 points ($50 = 1 point)
  const loyaltyScore = Math.min(orders * 3, 15); // Max 15 points

  const totalScore = referralScore + videoScore + spendingScore + loyaltyScore;

  return Math.round(totalScore);
};

// Method to get total spent
customerSchema.methods.getTotalSpent = function () {
  if (!this.shoppingHistory || this.shoppingHistory.length === 0) {
    return 0;
  }

  return this.shoppingHistory.reduce((total, order) => {
    return total + (order.totalAmount || 0);
  }, 0);
};

// METHOD TO CALCULATE ORDER REQUIREMENTS
// Add this method to customerSchema.methods

customerSchema.methods.calculateOrderRequirements = function (orderId) {
  const order = this.shoppingHistory.find((o) => o.orderId === orderId);
  if (!order) return null;

  const items = order.items || [];

  let totalVolume = 0;
  let totalWeight = 0;
  let totalPackages = items.length;

  items.forEach((item) => {
    // Estimate volume based on quantity (rough estimate)
    totalVolume += (item.quantity || 1) * 0.1; // 0.1 cubic meters per item

    // Extract weight from weight string if available
    if (item.weight) {
      const weightMatch = item.weight.match(/(\d+(?:\.\d+)?)/);
      if (weightMatch) {
        totalWeight += parseFloat(weightMatch[1]) * (item.quantity || 1);
      }
    } else {
      // Default weight estimate
      totalWeight += (item.quantity || 1) * 0.5; // 0.5 kg per item
    }
  });

  const requirements = {
    calculatedVolume: Math.round(totalVolume * 100) / 100,
    calculatedWeight: Math.round(totalWeight * 100) / 100,
    totalPackages: totalPackages,
    lastCalculated: new Date(),
  };

  // Update the order with calculated requirements
  const orderIndex = this.shoppingHistory.findIndex(
    (o) => o.orderId === orderId
  );
  if (orderIndex !== -1) {
    this.shoppingHistory[orderIndex].orderRequirements = requirements;
  }

  return requirements;
};

// METHOD TO ASSIGN VEHICLE AND DRIVER
// Add this method to customerSchema.methods

customerSchema.methods.assignVehicleAndDriver = function (
  orderId,
  assignmentData
) {
  const orderIndex = this.shoppingHistory.findIndex(
    (o) => o.orderId === orderId
  );

  if (orderIndex === -1) {
    throw new Error("Order not found");
  }

  // Update assignment details
  this.shoppingHistory[orderIndex].assignmentDetails = {
    ...assignmentData,
    assignedAt: new Date(),
  };

  // Update status
  this.shoppingHistory[orderIndex].status = "assigned-dispatch-officer-2";

  // Update driver1 field for backward compatibility
  this.shoppingHistory[orderIndex].driver1 =
    assignmentData.assignedDriver.employeeName;

  return this.save();
};

// METHOD TO GET ORDERS READY FOR ASSIGNMENT
// Add this static method to customerSchema.statics

customerSchema.statics.getOrdersReadyForAssignment = async function () {
  const customers = await this.find({
    "shoppingHistory.status": "ready to pickup",
  }).lean();

  let orders = [];

  for (let customer of customers) {
    for (let order of customer.shoppingHistory) {
      if (order.status === "ready to pickup") {
        // Check if already assigned
        if (
          !order.assignmentDetails ||
          !order.assignmentDetails.assignedVehicle
        ) {
          orders.push({
            customerId: customer._id,
            customerName: customer.name,
            customerPhone: customer.phoneNumber[0] || "",
            ...order,
          });
        }
      }
    }
  }

  return orders;
};
// Method to check if eligible for foreman
customerSchema.methods.isEligibleForForeman = function () {
  const performanceScore = this.calculatePerformanceScore();
  const totalSpent = this.getTotalSpent();
  const hasVideos = this.referralvideos && this.referralvideos.length > 0;
  const hasOrders = this.shoppingHistory && this.shoppingHistory.length >= 2;

  // Eligibility criteria
  return (
    performanceScore >= 30 && // Minimum performance score
    totalSpent >= 100 && // Minimum spending
    hasVideos && // Has uploaded at least one video
    hasOrders // Has placed at least 2 orders
  );
};

// Method to get commission dashboard data
customerSchema.methods.getCommissionDashboard = function () {
  return {
    commissionEarned: this.commissionTracking?.totalCommissionEarned || 0,
    commissionPaid: this.commissionTracking?.totalCommissionPaid || 0,
    availableCommission: this.commissionTracking?.availableCommission || 0,
    commissionApproved: this.foremanStatus?.isCommissionEligible || false,
    commissionRate: this.foremanStatus?.commissionRate || 5,
    successfulReferrals:
      this.customersReferred?.filter((r) => r.hasPlacedOrder).length || 0,
    totalReferrals: this.customersReferred?.length || 0,
    commissionHistory: this.commissionTracking?.commissionHistory || [],
  };
};

// Method to get support dashboard data
customerSchema.methods.getSupportDashboard = function () {
  return {
    activeTickets:
      this.supportTickets?.filter((t) => t.status === "open").length || 0,
    totalTickets: this.supportTickets?.length || 0,
    complaints: this.complaints?.length || 0,
    paymentIssues:
      this.paymentIssues?.filter((p) => p.status === "reported").length || 0,
    addressChanges:
      this.addressChangeHistory?.filter((a) => a.status === "pending").length ||
      0,
    supportPreferences: this.supportPreferences || {},
    lastSupportInteraction: this.currentSupportFlow?.lastInteraction || null,
  };
};

// Add this method to customerSchema.methods
customerSchema.methods.addReferredCustomer = async function (
  referredCustomerData
) {
  // Ensure the referred customer exists as a separate document
  const referredCustomer = await mongoose
    .model("Customer")
    .findById(referredCustomerData.customerId);

  if (!referredCustomer) {
    throw new Error("Referred customer not found");
  }

  // Update the referred customer's referredBy field
  referredCustomer.referredBy = {
    customerId: this._id,
    phoneNumber: this.phoneNumber[0],
    name: this.name,
    videoId: referredCustomerData.videoUsed,
    dateReferred: new Date(),
  };

  await referredCustomer.save();

  // Add to this customer's referral list
  if (!this.customersReferred) {
    this.customersReferred = [];
  }

  // Check if this customer is already in the referral list
  const existingReferralIndex = this.customersReferred.findIndex(
    (ref) =>
      ref.customerId.toString() === referredCustomerData.customerId.toString()
  );

  if (existingReferralIndex === -1) {
    this.customersReferred.push({
      customerId: referredCustomer._id,
      customerName: referredCustomer.name,
      phoneNumber: referredCustomer.phoneNumber[0],
      referralDate: new Date(),
      videoUsed: referredCustomerData.videoUsed,
      hasPlacedOrder: false,
      firstOrderDate: null,
      totalOrdersCount: 0,
      totalSpentAmount: 0,
      commissionGenerated: 0,
    });
  }

  return this.save();
};

// Add this method to customerSchema.methods
customerSchema.methods.updateReferredCustomerOrder = async function (
  referredCustomerId,
  orderAmount
) {
  if (!this.customersReferred) {
    return;
  }

  const referral = this.customersReferred.find(
    (ref) => ref.customerId.toString() === referredCustomerId.toString()
  );

  if (referral) {
    if (!referral.hasPlacedOrder) {
      referral.hasPlacedOrder = true;
      referral.firstOrderDate = new Date();
    }

    referral.totalOrdersCount += 1;
    referral.totalSpentAmount += orderAmount;

    // Calculate commission if applicable
    if (this.foremanStatus?.isCommissionEligible) {
      const commissionRate = this.foremanStatus.commissionRate || 5;
      const commission = (orderAmount * commissionRate) / 100;
      referral.commissionGenerated += commission;
    }

    await this.save();
  }
};

// Add this pre-save hook
customerSchema.pre("save", async function (next) {
  // If this is a new customer with referredBy data, ensure the referrer's customersReferred is updated
  if (this.isNew && this.referredBy) {
    try {
      const referrer = await mongoose
        .model("Customer")
        .findById(this.referredBy.customerId);
      if (referrer) {
        await referrer.addReferredCustomer({
          customerId: this._id,
          videoUsed: this.referredBy.videoId,
        });
      }
    } catch (error) {
      console.error("Error updating referrer:", error);
    }
  }
  next();
});
// Create the model
const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;
