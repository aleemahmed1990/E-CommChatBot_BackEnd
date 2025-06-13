// routes/foremanCustomers.js
const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");

// GET /api/foreman-customers - Fetch customers by foreman status
router.get("/", async (req, res) => {
  try {
    const { status = "customers" } = req.query;

    console.log(`Fetching customers for status: ${status}`);

    let matchCondition = {};

    // Set match condition based on status
    switch (status) {
      case "customers":
        // All customers (regular customers who are not foreman)
        matchCondition = {
          $or: [
            { foremanStatus: { $exists: false } },
            { foremanStatus: "regular" },
          ],
        };
        break;
      case "approved_foreman":
        matchCondition = { foremanStatus: "approved" };
        break;
      case "approved_commission":
        matchCondition = {
          foremanStatus: "approved",
          commissionApproved: true,
        };
        break;
      default:
        matchCondition = {};
    }

    // Aggregate to get comprehensive customer data
    const customers = await Customer.aggregate([
      { $match: matchCondition },

      // Add calculated fields
      {
        $addFields: {
          // Calculate total spent from order history
          totalSpent: {
            $reduce: {
              input: { $ifNull: ["$orderHistory", []] },
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.totalAmount", 0] }] },
            },
          },

          // Count total orders
          totalOrders: { $size: { $ifNull: ["$orderHistory", []] } },

          // Count videos uploaded
          videosUploaded: { $size: { $ifNull: ["$referralvideos", []] } },

          // Calculate total shares (phone numbers given)
          totalPhoneNumbersGiven: {
            $reduce: {
              input: { $ifNull: ["$referralvideos", []] },
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  { $size: { $ifNull: ["$$this.sharedWith", []] } },
                ],
              },
            },
          },

          // Count addresses
          totalAddresses: { $size: { $ifNull: ["$addresses", []] } },

          // Get first phone number
          phoneNumber: { $arrayElemAt: ["$phoneNumber", 0] },

          // Commission fields with defaults
          commissionEarned: { $ifNull: ["$commissionEarned", 0] },
          commissionPaid: { $ifNull: ["$commissionPaid", 0] },
          commissionNotPaid: {
            $subtract: [
              { $ifNull: ["$commissionEarned", 0] },
              { $ifNull: ["$commissionPaid", 0] },
            ],
          },
          commissionApproved: { $ifNull: ["$commissionApproved", false] },
          successfulReferrals: { $ifNull: ["$successfulReferrals", 0] },
        },
      },

      // Lookup to count people referred by this customer who have made orders
      {
        $lookup: {
          from: "customers",
          let: { customerReferralCode: "$referralCode" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        "$referredBy.referralCode",
                        "$$customerReferralCode",
                      ],
                    },
                    { $gt: [{ $size: { $ifNull: ["$orderHistory", []] } }, 0] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "successfulReferralCount",
        },
      },

      // Add successful referrals field
      {
        $addFields: {
          calculatedSuccessfulReferrals: {
            $ifNull: [
              { $arrayElemAt: ["$successfulReferralCount.count", 0] },
              0,
            ],
          },
        },
      },

      // Project only needed fields
      {
        $project: {
          _id: 1,
          name: 1,
          phoneNumber: 1,
          referralCode: 1,
          foremanStatus: { $ifNull: ["$foremanStatus", "regular"] },
          foremanAppliedAt: 1,
          foremanApprovedAt: 1,
          foremanNotes: 1,
          totalSpent: 1,
          totalOrders: 1,
          videosUploaded: 1,
          totalPhoneNumbersGiven: 1,
          successfulReferrals: "$calculatedSuccessfulReferrals",
          totalAddresses: 1,
          createdAt: 1,
          lastInteraction: 1,
          // Commission fields
          commissionEarned: 1,
          commissionPaid: 1,
          commissionNotPaid: 1,
          commissionApproved: 1,
          commissionHistory: 1,
        },
      },

      // Sort by commission earned and successful referrals
      {
        $sort: {
          commissionEarned: -1,
          successfulReferrals: -1,
          totalSpent: -1,
        },
      },
    ]);

    console.log(`Found ${customers.length} customers for status: ${status}`);

    res.json({
      success: true,
      customers: customers,
      count: customers.length,
      status: status,
    });
  } catch (error) {
    console.error("Error fetching foreman customers:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error: error.message,
    });
  }
});

// POST /api/foreman-customers/update-status - Update customer foreman status
router.post("/update-status", async (req, res) => {
  try {
    const { customerId, status } = req.body;

    if (!customerId || !status) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: customerId, status",
      });
    }

    const validStatuses = ["regular", "approved"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    console.log(`Updating customer ${customerId} foreman status to: ${status}`);

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Update foreman status
    customer.foremanStatus = status;

    if (status === "approved") {
      customer.foremanApprovedAt = new Date();
    }

    // Add to foreman status history
    if (!customer.foremanStatusHistory) {
      customer.foremanStatusHistory = [];
    }

    customer.foremanStatusHistory.push({
      status: status,
      updatedAt: new Date(),
      updatedBy: "admin",
      reason: `Status updated to ${status}`,
    });

    await customer.save();

    console.log(
      `Successfully updated customer ${customerId} to foreman status: ${status}`
    );

    res.json({
      success: true,
      message: `Customer foreman status updated to ${status}`,
      customer: {
        _id: customer._id,
        name: customer.name,
        foremanStatus: status,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error updating foreman status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating foreman status",
      error: error.message,
    });
  }
});

// POST /api/foreman-customers/mark-commission-approved - Approve customer for commission
router.post("/mark-commission-approved", async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: customerId",
      });
    }

    console.log(`Approving customer ${customerId} for commission`);

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (customer.foremanStatus !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Customer must be approved foreman first",
      });
    }

    // Approve for commission
    customer.commissionApproved = true;
    customer.commissionApprovedAt = new Date();

    // Set default commission rate if not set
    if (!customer.commissionRate) {
      customer.commissionRate = 5; // 5% default
    }

    // Add to foreman status history
    if (!customer.foremanStatusHistory) {
      customer.foremanStatusHistory = [];
    }

    customer.foremanStatusHistory.push({
      status: "commission_approved",
      updatedAt: new Date(),
      updatedBy: "admin",
      reason: "Approved for commission earning",
    });

    await customer.save();

    console.log(`Successfully approved customer ${customerId} for commission`);

    res.json({
      success: true,
      message: "Customer approved for commission",
      customer: {
        _id: customer._id,
        name: customer.name,
        commissionApproved: true,
        commissionApprovedAt: customer.commissionApprovedAt,
      },
    });
  } catch (error) {
    console.error("Error approving for commission:", error);
    res.status(500).json({
      success: false,
      message: "Error approving for commission",
      error: error.message,
    });
  }
});

// POST /api/foreman-customers/pay-commission - Pay commission to customer
router.post("/pay-commission", async (req, res) => {
  try {
    const { customerId, amount } = req.body;

    if (!customerId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: customerId, amount (must be > 0)",
      });
    }

    console.log(`Paying commission of $${amount} to customer ${customerId}`);

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (!customer.commissionApproved) {
      return res.status(400).json({
        success: false,
        message: "Customer not approved for commission",
      });
    }

    const unpaidCommission =
      (customer.commissionEarned || 0) - (customer.commissionPaid || 0);

    if (amount > unpaidCommission) {
      return res.status(400).json({
        success: false,
        message: `Cannot pay more than unpaid commission amount: $${unpaidCommission.toFixed(
          2
        )}`,
      });
    }

    // Update commission paid
    customer.commissionPaid = (customer.commissionPaid || 0) + amount;

    // Add to commission history
    if (!customer.commissionHistory) {
      customer.commissionHistory = [];
    }

    customer.commissionHistory.push({
      amount: amount,
      type: "paid",
      date: new Date(),
      isPaid: true,
      paidDate: new Date(),
      notes: `Commission payment of $${amount}`,
    });

    await customer.save();

    console.log(
      `Successfully paid commission of $${amount} to customer ${customerId}`
    );

    res.json({
      success: true,
      message: `Commission of $${amount} paid successfully`,
      customer: {
        _id: customer._id,
        name: customer.name,
        commissionPaid: customer.commissionPaid,
        remainingUnpaid:
          (customer.commissionEarned || 0) - customer.commissionPaid,
      },
    });
  } catch (error) {
    console.error("Error paying commission:", error);
    res.status(500).json({
      success: false,
      message: "Error paying commission",
      error: error.message,
    });
  }
});

// GET /api/foreman-customers/:customerId/referral-details - Get detailed referral information
router.get("/:customerId/referral-details", async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Get all customers referred by this customer
    const referredCustomers = await Customer.find({
      "referredBy.referralCode": customer.referralCode,
    });

    // Filter successful referrals (those who made orders)
    const successfulReferrals = referredCustomers
      .filter((ref) => ref.orderHistory && ref.orderHistory.length > 0)
      .map((ref) => {
        const totalAmountOrdered = ref.orderHistory.reduce((sum, order) => {
          return sum + (order.totalAmount || 0);
        }, 0);

        // Calculate commission approved amount (excluding discounted products)
        const commissionApprovedAmount = ref.orderHistory.reduce(
          (sum, order) => {
            // For now, assume all orders are commission eligible
            // You can add logic here to exclude discounted products
            return sum + (order.totalAmount || 0);
          },
          0
        );

        return {
          _id: ref._id,
          name: ref.name,
          phoneNumber: ref.phoneNumber[0] || "",
          dateReferred: ref.referredBy?.dateReferred,
          totalAmountOrdered,
          commissionApprovedAmount,
          orderCount: ref.orderHistory.length,
        };
      });

    // Get all referred phone numbers from referral videos
    const allReferredNumbers = [];
    if (customer.referralvideos) {
      customer.referralvideos.forEach((video) => {
        if (video.sharedWith) {
          video.sharedWith.forEach((contact) => {
            // Check if this phone number became a customer
            const hasOrdered = referredCustomers.some(
              (ref) =>
                ref.phoneNumber &&
                ref.phoneNumber.includes(contact.phoneNumber) &&
                ref.orderHistory &&
                ref.orderHistory.length > 0
            );

            const matchedCustomer = referredCustomers.find(
              (ref) =>
                ref.phoneNumber && ref.phoneNumber.includes(contact.phoneNumber)
            );

            allReferredNumbers.push({
              name: contact.name,
              phoneNumber: contact.phoneNumber,
              dateShared: contact.dateShared,
              hasOrdered,
              totalSpent:
                matchedCustomer && matchedCustomer.orderHistory
                  ? matchedCustomer.orderHistory.reduce(
                      (sum, order) => sum + (order.totalAmount || 0),
                      0
                    )
                  : 0,
            });
          });
        }
      });
    }

    res.json({
      success: true,
      successfulReferrals,
      allReferredNumbers,
      summary: {
        totalReferred: referredCustomers.length,
        successfulConversions: successfulReferrals.length,
        totalPhoneNumbersGiven: allReferredNumbers.length,
        conversionRate:
          allReferredNumbers.length > 0
            ? (
                (successfulReferrals.length / allReferredNumbers.length) *
                100
              ).toFixed(2) + "%"
            : "0%",
      },
    });
  } catch (error) {
    console.error("Error fetching referral details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching referral details",
      error: error.message,
    });
  }
});

// GET /api/foreman-customers/:customerId - Get detailed customer information
router.get("/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Get customers referred by this customer
    const referredCustomers = await Customer.find({
      "referredBy.referralCode": customer.referralCode,
    }).select("name phoneNumber referredBy createdAt orderHistory");

    // Calculate comprehensive stats
    const totalSpent = customer.orderHistory
      ? customer.orderHistory.reduce(
          (sum, order) => sum + (order.totalAmount || 0),
          0
        )
      : 0;

    const totalOrders = customer.orderHistory
      ? customer.orderHistory.length
      : 0;
    const videosUploaded = customer.referralvideos
      ? customer.referralvideos.length
      : 0;

    // Calculate total phone numbers given
    const totalPhoneNumbersGiven = customer.referralvideos
      ? customer.referralvideos.reduce(
          (sum, video) =>
            sum + (video.sharedWith ? video.sharedWith.length : 0),
          0
        )
      : 0;

    // Count successful referrals (those who made orders)
    const successfulReferrals = referredCustomers.filter(
      (ref) => ref.orderHistory && ref.orderHistory.length > 0
    ).length;

    // Get commission data
    const commissionEarned = customer.commissionEarned || 0;
    const commissionPaid = customer.commissionPaid || 0;
    const commissionNotPaid = commissionEarned - commissionPaid;

    // Get recent activity
    const recentActivity = [];

    // Add recent orders
    if (customer.orderHistory) {
      customer.orderHistory.slice(-5).forEach((order) => {
        recentActivity.push({
          action: `Placed order ${order.orderId}`,
          date: order.orderDate,
          amount: order.totalAmount,
          type: "order",
        });
      });
    }

    // Add recent videos
    if (customer.referralvideos) {
      customer.referralvideos.slice(-3).forEach((video) => {
        recentActivity.push({
          action: `Uploaded referral video ${video.imageId}`,
          date: video.approvalDate,
          type: "video",
        });
      });
    }

    // Add recent commission activities
    if (customer.commissionHistory) {
      customer.commissionHistory.slice(-3).forEach((commission) => {
        recentActivity.push({
          action: `Commission ${commission.type}: $${commission.amount}`,
          date: commission.date,
          amount: commission.amount,
          type: "commission",
        });
      });
    }

    // Sort by date (most recent first)
    recentActivity.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      customer: {
        _id: customer._id,
        name: customer.name,
        phoneNumber: customer.phoneNumber[0] || "",
        referralCode: customer.referralCode,
        foremanStatus: customer.foremanStatus || "regular",
        foremanAppliedAt: customer.foremanAppliedAt,
        foremanApprovedAt: customer.foremanApprovedAt,
        foremanNotes: customer.foremanNotes,
        totalSpent,
        totalOrders,
        videosUploaded,
        totalPhoneNumbersGiven,
        successfulReferrals,
        totalAddresses: customer.addresses ? customer.addresses.length : 0,
        createdAt: customer.createdAt,
        lastInteraction: customer.lastInteraction,
        // Commission data
        commissionEarned,
        commissionPaid,
        commissionNotPaid,
        commissionApproved: customer.commissionApproved || false,
        commissionApprovedAt: customer.commissionApprovedAt,
        commissionRate: customer.commissionRate || 5,
        commissionHistory: customer.commissionHistory || [],
        recentActivity: recentActivity.slice(0, 10),
      },
      referredCustomers: referredCustomers.map((ref) => ({
        _id: ref._id,
        name: ref.name,
        phoneNumber: ref.phoneNumber[0] || "",
        dateReferred: ref.referredBy?.dateReferred,
        hasOrders: ref.orderHistory && ref.orderHistory.length > 0,
        totalSpent: ref.orderHistory
          ? ref.orderHistory.reduce(
              (sum, order) => sum + (order.totalAmount || 0),
              0
            )
          : 0,
        orderCount: ref.orderHistory ? ref.orderHistory.length : 0,
      })),
      foremanStatusHistory: customer.foremanStatusHistory || [],
    });
  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customer details",
      error: error.message,
    });
  }
});

// GET /api/foreman-customers/stats/overview - Get foreman statistics
router.get("/stats/overview", async (req, res) => {
  try {
    const stats = await Customer.aggregate([
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          regularCustomers: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$foremanStatus", "regular"] },
                    { $not: { $ifNull: ["$foremanStatus", false] } },
                  ],
                },
                1,
                0,
              ],
            },
          },
          approvedForeman: {
            $sum: { $cond: [{ $eq: ["$foremanStatus", "approved"] }, 1, 0] },
          },
          commissionApproved: {
            $sum: { $cond: [{ $eq: ["$commissionApproved", true] }, 1, 0] },
          },
          totalCommissionEarned: {
            $sum: { $ifNull: ["$commissionEarned", 0] },
          },
          totalCommissionPaid: {
            $sum: { $ifNull: ["$commissionPaid", 0] },
          },
          totalRevenue: {
            $sum: {
              $reduce: {
                input: { $ifNull: ["$orderHistory", []] },
                initialValue: 0,
                in: {
                  $add: ["$$value", { $ifNull: ["$$this.totalAmount", 0] }],
                },
              },
            },
          },
        },
      },
    ]);

    const overview = stats[0] || {
      totalCustomers: 0,
      regularCustomers: 0,
      approvedForeman: 0,
      commissionApproved: 0,
      totalCommissionEarned: 0,
      totalCommissionPaid: 0,
      totalRevenue: 0,
    };

    // Add calculated fields
    overview.totalCommissionUnpaid =
      overview.totalCommissionEarned - overview.totalCommissionPaid;

    res.json({
      success: true,
      stats: overview,
    });
  } catch (error) {
    console.error("Error fetching foreman stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching statistics",
      error: error.message,
    });
  }
});

// POST /api/foreman-customers/calculate-commission - Calculate commission for a referral order
router.post("/calculate-commission", async (req, res) => {
  try {
    const { foremanId, orderAmount, isDiscountedProduct = false } = req.body;

    if (!foremanId || !orderAmount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: foremanId, orderAmount",
      });
    }

    const foreman = await Customer.findById(foremanId);

    if (!foreman) {
      return res.status(404).json({
        success: false,
        message: "Foreman not found",
      });
    }

    if (!foreman.commissionApproved) {
      return res.status(400).json({
        success: false,
        message: "Foreman not approved for commission",
      });
    }

    // Calculate commission (no commission on discounted products)
    let commissionAmount = 0;
    if (!isDiscountedProduct) {
      const commissionRate = foreman.commissionRate || 5;
      commissionAmount = (orderAmount * commissionRate) / 100;
    }

    res.json({
      success: true,
      commission: {
        foremanId: foreman._id,
        foremanName: foreman.name,
        orderAmount,
        commissionRate: foreman.commissionRate || 5,
        commissionAmount,
        isDiscountedProduct,
      },
    });
  } catch (error) {
    console.error("Error calculating commission:", error);
    res.status(500).json({
      success: false,
      message: "Error calculating commission",
      error: error.message,
    });
  }
});

// POST /api/foreman-customers/add-commission-earned - Add commission earned from referral order
router.post("/add-commission-earned", async (req, res) => {
  try {
    const { foremanId, amount, orderId, referredCustomerId } = req.body;

    if (!foremanId || !amount || !orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: foremanId, amount, orderId",
      });
    }

    const foreman = await Customer.findById(foremanId);

    if (!foreman) {
      return res.status(404).json({
        success: false,
        message: "Foreman not found",
      });
    }

    if (!foreman.commissionApproved) {
      return res.status(400).json({
        success: false,
        message: "Foreman not approved for commission",
      });
    }

    // Add commission earned
    foreman.commissionEarned = (foreman.commissionEarned || 0) + amount;

    // Add to commission history
    if (!foreman.commissionHistory) {
      foreman.commissionHistory = [];
    }

    foreman.commissionHistory.push({
      amount: amount,
      type: "earned",
      date: new Date(),
      orderId: orderId,
      referredCustomerId: referredCustomerId,
      isPaid: false,
    });

    await foreman.save();

    console.log(
      `Added commission of $${amount} for foreman ${foremanId} from order ${orderId}`
    );

    res.json({
      success: true,
      message: `Commission of $${amount} added successfully`,
      foreman: {
        _id: foreman._id,
        name: foreman.name,
        commissionEarned: foreman.commissionEarned,
        commissionUnpaid:
          (foreman.commissionEarned || 0) - (foreman.commissionPaid || 0),
      },
    });
  } catch (error) {
    console.error("Error adding commission:", error);
    res.status(500).json({
      success: false,
      message: "Error adding commission",
      error: error.message,
    });
  }
});

module.exports = router;
