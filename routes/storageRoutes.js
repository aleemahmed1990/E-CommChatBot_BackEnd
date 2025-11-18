// routes/storageRoutes.js - Delivery Storage Officer routes
const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");
const DeliveryTracking = require("../models/Deliverytracking");

// Helper function to get workflow progress
function getWorkflowProgress(tracking) {
  if (
    tracking.getWorkflowProgress &&
    typeof tracking.getWorkflowProgress === "function"
  ) {
    return tracking.getWorkflowProgress();
  }

  const workflow = tracking.workflowStatus || {};
  return {
    pending: workflow.pending?.completed || false,
    packed: workflow.packed?.completed || false,
    storage: workflow.storage?.completed || false,
    assigned: workflow.assigned?.completed || false,
    loaded: workflow.loaded?.completed || false,
    inTransit: workflow.inTransit?.completed || false,
    delivered: workflow.delivered?.completed || false,
  };
}

// Get storage queue - orders that are packed and ready for verification
router.get("/queue", async (req, res) => {
  try {
    const customers = await Customer.find({
      "shoppingHistory.status": "allocated-driver",
    });

    let storageQueue = [];

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        if (order.status === "allocated-driver") {
          let tracking = await DeliveryTracking.findOne({
            orderId: order.orderId,
          });

          if (!tracking) {
            tracking = await DeliveryTracking.createFromCustomerOrder(
              customer,
              order
            );
          }

          const progress = getWorkflowProgress(tracking);
          if (progress.packed && !progress.storage) {
            const totalAmount = order.totalAmount || 0;
            const priority =
              totalAmount >= 200
                ? "high"
                : totalAmount >= 100
                ? "medium"
                : "low";

            // ✅ FIXED: Get packing details from items - packedBy contains staffName and staffId
            let packedBy = "Unknown";
            let packedAt = null;

            // Get packing info from first packed item
            if (order.items && order.items.length > 0) {
              const packedItem = order.items.find(
                (item) => item.packedBy && item.packedBy.staffName
              );
              if (packedItem) {
                packedBy = packedItem.packedBy.staffName; // Get exact staff name
                packedAt = packedItem.packedAt; // Get exact timestamp when item was packed
              }
            }

            const receivedAt = packedAt || order.orderDate;

            storageQueue.push({
              orderId: order.orderId,
              customerName: customer.name,
              customerPhone: customer.phoneNumber[0] || "",
              priority: priority,
              packedBy: packedBy, // ✅ Shows exact staff name
              packedAt: packedAt, // ✅ Shows exact packed timestamp
              receivedAt: receivedAt,
              deliveryDate: order.deliveryDate,
              deliveryTime: order.timeSlot || "",
              status: tracking.workflowStatus.storage.completed
                ? "verified"
                : "pending",
              totalItems: order.items ? order.items.length : 0,
              verifiedItems: order.items
                ? order.items.filter((item) => item.storageVerified === true)
                    .length
                : 0,
              deliveryAddress: order.deliveryAddress,
              specialInstructions: order.adminReason || "",
              hasComplaints: order.items
                ? order.items.some(
                    (item) =>
                      item.storageComplaints &&
                      item.storageComplaints.length > 0
                  )
                : false,
            });
          }
        }
      }
    }

    storageQueue.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff =
        priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return new Date(a.deliveryDate) - new Date(b.deliveryDate);
    });

    res.json(storageQueue);
  } catch (error) {
    console.error("Error fetching storage queue:", error);
    res.status(500).json({ error: "Failed to fetch storage queue" });
  }
});

// Get storage statistics
router.get("/stats", async (req, res) => {
  try {
    const customers = await Customer.find({
      "shoppingHistory.status": "allocated-driver",
    }).lean();

    let stats = {
      pending: 0,
      verifying: 0,
      completed: 0,
    };

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        if (order.status === "allocated-driver") {
          const tracking = await DeliveryTracking.findOne({
            orderId: order.orderId,
          });
          if (tracking) {
            if (tracking.workflowStatus.storage.completed) {
              stats.completed++;
            } else {
              const hasVerifiedItems =
                order.items &&
                order.items.some((item) => item.storageVerified === true);
              if (hasVerifiedItems) {
                stats.verifying++;
              } else {
                stats.pending++;
              }
            }
          }
        }
      }
    }

    res.json(stats);
  } catch (error) {
    console.error("Error fetching storage stats:", error);
    res.status(500).json({ error: "Failed to fetch storage stats" });
  }
});

// Get detailed order for verification
router.get("/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const customer = await Customer.findOne({
      "shoppingHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = customer.shoppingHistory.find((o) => o.orderId === orderId);

    // Initialize storage verification status for items if not exists
    if (order.items) {
      order.items.forEach((item, index) => {
        if (item.storageVerified === undefined) {
          item.storageVerified = false;
        }
        if (!item.storageComplaints) {
          item.storageComplaints = [];
        }
      });
    }

    // ✅ FIXED: Get packing details from items - packedBy contains staffName, staffId, and timestamp
    let packingStaffName = "Unknown";
    let packingStaffId = null;
    let packingCompletedAt = null;

    if (order.items && order.items.length > 0) {
      const packedItem = order.items.find(
        (item) => item.packedBy && item.packedBy.staffName
      );
      if (packedItem) {
        packingStaffName = packedItem.packedBy.staffName;
        packingStaffId = packedItem.packedBy.staffId;
        packingCompletedAt = packedItem.packedAt;
      }
    }

    const orderDetails = {
      orderId: order.orderId,
      customerName: customer.name,
      customerPhone: customer.phoneNumber[0] || "",
      status: order.status,
      deliveryDate: order.deliveryDate,
      timeSlot: order.timeSlot,
      deliveryAddress: order.deliveryAddress,
      specialInstructions: order.adminReason || "",
      items: order.items || [],
      packingDetails: {
        packingStaff: {
          staffName: packingStaffName, // ✅ Exact staff name from items
          staffId: packingStaffId, // ✅ Staff ID from items
        },
        packedAt: packingCompletedAt, // ✅ Exact timestamp from items
        packingStartedAt: order.packingDetails?.packingStartedAt || null,
      },
      storageDetails: order.storageDetails || {
        verificationStartedAt: null,
        verificationCompletedAt: null,
        verificationStaff: {},
        storageNotes: "",
        storageLocation: "",
        totalItemsVerified: 0,
        totalItemsRequested: order.items ? order.items.length : 0,
        verificationProgress: 0,
        hasStorageComplaints: false,
      },
    };

    res.json(orderDetails);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

// Start verification process
router.post("/start/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { employeeId, employeeName } = req.body;

    const result = await Customer.updateOne(
      { "shoppingHistory.orderId": orderId },
      {
        $set: {
          "shoppingHistory.$.storageDetails.verificationStartedAt": new Date(),
          "shoppingHistory.$.storageDetails.verificationStaff.staffId":
            employeeId,
          "shoppingHistory.$.storageDetails.verificationStaff.staffName":
            employeeName,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({
      success: true,
      message: `Storage verification started for order ${orderId}`,
    });
  } catch (error) {
    console.error("Error starting verification:", error);
    res.status(500).json({ error: "Failed to start verification" });
  }
});

// Verify individual item
router.put("/item/:orderId/:itemIndex", async (req, res) => {
  try {
    const { orderId, itemIndex } = req.params;
    const { employeeId, employeeName, verified, condition } = req.body;

    const customer = await Customer.findOne({
      "shoppingHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderIndex = customer.shoppingHistory.findIndex(
      (o) => o.orderId === orderId
    );
    const order = customer.shoppingHistory[orderIndex];

    if (!order.items[itemIndex]) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Mark item as verified
    order.items[itemIndex].storageVerified = verified;
    order.items[itemIndex].storageCondition = condition || "good";
    order.items[itemIndex].verifiedAt = new Date();
    order.items[itemIndex].verifiedBy = {
      staffId: employeeId,
      staffName: employeeName,
      timestamp: new Date(),
    };

    // Update storage verification details
    const verifiedItems = order.items.filter(
      (item) => item.storageVerified === true
    ).length;
    const totalItems = order.items.length;

    if (!order.storageDetails) order.storageDetails = {};
    order.storageDetails.totalItemsVerified = verifiedItems;
    order.storageDetails.totalItemsRequested = totalItems;
    order.storageDetails.verificationProgress = Math.round(
      (verifiedItems / totalItems) * 100
    );

    await customer.save();

    res.json({
      success: true,
      message: `Item ${itemIndex} verification updated`,
      verifiedItems: verifiedItems,
      totalItems: totalItems,
      verificationProgress: Math.round((verifiedItems / totalItems) * 100),
    });
  } catch (error) {
    console.error("Error verifying item:", error);
    res.status(500).json({ error: "Failed to verify item" });
  }
});

// Add storage complaint for item
router.post("/complaint/:orderId/:itemIndex", async (req, res) => {
  try {
    const { orderId, itemIndex } = req.params;
    const { complaintType, complaintDetails, employeeId, employeeName } =
      req.body;

    const customer = await Customer.findOne({
      "shoppingHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderIndex = customer.shoppingHistory.findIndex(
      (o) => o.orderId === orderId
    );
    const order = customer.shoppingHistory[orderIndex];

    if (!order.items[itemIndex]) {
      return res.status(404).json({ error: "Item not found" });
    }

    const complaintId = `STORAGE_COMP_${Date.now()}`;

    if (!order.items[itemIndex].storageComplaints) {
      order.items[itemIndex].storageComplaints = [];
    }

    order.items[itemIndex].storageComplaints.push({
      complaintId: complaintId,
      complaintType: complaintType,
      complaintDetails: complaintDetails,
      reportedBy: {
        staffId: employeeId,
        staffName: employeeName,
        timestamp: new Date(),
      },
      status: "open",
    });

    // Mark item as having complaint (counts as processed)
    order.items[itemIndex].storageVerified = false;

    if (!order.storageDetails) order.storageDetails = {};
    order.storageDetails.hasStorageComplaints = true;

    await customer.save();

    res.json({
      success: true,
      message: "Storage complaint added successfully",
      complaintId: complaintId,
    });
  } catch (error) {
    console.error("Error adding storage complaint:", error);
    res.status(500).json({ error: "Failed to add storage complaint" });
  }
});

// Complete storage verification for entire order
router.post("/complete/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { storageNotes, storageLocation, employeeId, employeeName } =
      req.body;

    const customer = await Customer.findOne({
      "shoppingHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderIndex = customer.shoppingHistory.findIndex(
      (o) => o.orderId === orderId
    );
    const order = customer.shoppingHistory[orderIndex];

    // Check if all items are verified or have complaints
    const allItemsVerified = order.items.every(
      (item) =>
        item.storageVerified === true || item.storageComplaints?.length > 0
    );

    if (!allItemsVerified) {
      return res.status(400).json({
        error:
          "Cannot complete verification. Some items are still pending verification.",
      });
    }

    // Update order status to ready to pickup
    order.status = "ready-to-pickup";

    // Update storage details
    if (!order.storageDetails) order.storageDetails = {};
    order.storageDetails.verificationCompletedAt = new Date();
    order.storageDetails.storageNotes = storageNotes;
    order.storageDetails.storageLocation = storageLocation;
    order.storageDetails.verificationProgress = 100;

    await customer.save();

    // Update delivery tracking workflow - mark storage as completed
    let tracking = await DeliveryTracking.findOne({ orderId: orderId });
    if (!tracking) {
      tracking = await DeliveryTracking.createFromCustomerOrder(
        customer,
        order
      );
    }

    tracking.workflowStatus.storage.completed = true;
    tracking.workflowStatus.storage.completedAt = new Date();
    tracking.workflowStatus.storage.completedBy = {
      employeeId: employeeId,
      employeeName: employeeName,
    };
    tracking.workflowStatus.storage.storageLocation = storageLocation;
    tracking.currentStatus = "ready-to-pickup";

    await tracking.save();

    res.json({
      success: true,
      message: `Order ${orderId} storage verification completed successfully`,
      newStatus: "ready-to-pickup",
    });
  } catch (error) {
    console.error("Error completing storage verification:", error);
    res.status(500).json({ error: "Failed to complete storage verification" });
  }
});

module.exports = router;
