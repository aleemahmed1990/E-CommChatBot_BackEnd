// routes/packingRoutes.js - Complete packing staff routes
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

// Get packing queue - orders ready for packing
router.get("/queue", async (req, res) => {
  try {
    // Get orders that are confirmed and ready for packing
    const customers = await Customer.find({
      "shoppingHistory.status": {
        $in: ["order-confirmed", "picking-order", "allocated-driver"],
      },
    }).lean();

    let packingQueue = [];

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        if (
          ["order-confirmed", "picking-order", "allocated-driver"].includes(
            order.status
          )
        ) {
          // Get delivery tracking for workflow status
          let tracking = await DeliveryTracking.findOne({
            orderId: order.orderId,
          });

          if (!tracking) {
            tracking = await DeliveryTracking.createFromCustomerOrder(
              customer,
              order
            );
          }

          // Calculate priority based on order amount
          const totalAmount = order.totalAmount || 0;
          const priority =
            totalAmount >= 200 ? "high" : totalAmount >= 100 ? "medium" : "low";

          // Calculate pack-by time (2-3 hours before delivery)
          const deliveryTime = new Date(order.deliveryDate || Date.now());
          const packByTime = new Date(
            deliveryTime.getTime() - 2.5 * 60 * 60 * 1000
          ); // 2.5 hours before

          // Count packed items
          const totalItems = order.items ? order.items.length : 0;
          const packedItems = order.items
            ? order.items.filter((item) => item.packingStatus === "packed")
                .length
            : 0;

          packingQueue.push({
            orderId: order.orderId,
            customerName: customer.name,
            customerPhone: customer.phoneNumber[0] || "",
            priority: priority,
            deliveryDate: order.deliveryDate,
            packByTime: packByTime,
            isOverdue: new Date() > packByTime,
            status: order.status,
            itemsCount: totalItems,
            packedItemsCount: packedItems,
            packingProgress:
              totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0,
            deliveryAddress: order.deliveryAddress,
            specialInstructions: order.adminReason || "",
            timeSlot: order.timeSlot || "",
          });
        }
      }
    }

    // Sort by priority and pack-by time
    packingQueue.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff =
        priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return new Date(a.packByTime) - new Date(b.packByTime);
    });

    res.json(packingQueue);
  } catch (error) {
    console.error("Error fetching packing queue:", error);
    res.status(500).json({ error: "Failed to fetch packing queue" });
  }
});

// Get packing statistics
router.get("/stats", async (req, res) => {
  try {
    const customers = await Customer.find({
      "shoppingHistory.status": {
        $in: ["order-confirmed", "picking-order", "allocated-driver"],
      },
    }).lean();

    let stats = {
      pending: 0,
      packing: 0,
      completed: 0,
    };

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        if (order.status === "order-confirmed") {
          stats.pending++;
        } else if (order.status === "picking-order") {
          stats.packing++;
        } else if (order.status === "allocated-driver") {
          stats.completed++;
        }
      }
    }

    res.json(stats);
  } catch (error) {
    console.error("Error fetching packing stats:", error);
    res.status(500).json({ error: "Failed to fetch packing stats" });
  }
});

// Get detailed order for packing
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

    // Initialize packing status for items if not exists
    if (order.items) {
      order.items.forEach((item, index) => {
        if (!item.packingStatus) {
          item.packingStatus = "pending";
        }
        if (!item.itemComplaints) {
          item.itemComplaints = [];
        }
      });
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
      packingDetails: order.packingDetails || {
        packingStartedAt: null,
        packingCompletedAt: null,
        packingStaff: {},
        packingNotes: "",
        totalItemsPacked: 0,
        totalItemsRequested: order.items ? order.items.length : 0,
        packingProgress: 0,
        hasPackingComplaints: false,
      },
    };

    res.json(orderDetails);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

// Start packing process
router.post("/start/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { employeeId, employeeName } = req.body;

    // Update customer order status
    const result = await Customer.updateOne(
      { "shoppingHistory.orderId": orderId },
      {
        $set: {
          "shoppingHistory.$.status": "picking-order",
          "shoppingHistory.$.packingDetails.packingStartedAt": new Date(),
          "shoppingHistory.$.packingDetails.packingStaff.staffId": employeeId,
          "shoppingHistory.$.packingDetails.packingStaff.staffName":
            employeeName,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Update delivery tracking workflow
    const tracking = await DeliveryTracking.findOne({ orderId: orderId });
    if (tracking) {
      tracking.workflowStatus.pending.completed = true;
      tracking.workflowStatus.pending.completedAt = new Date();
      tracking.workflowStatus.pending.completedBy = {
        employeeId: employeeId,
        employeeName: employeeName,
      };
      await tracking.save();
    }

    res.json({
      success: true,
      message: `Packing started for order ${orderId}`,
      newStatus: "picking-order",
    });
  } catch (error) {
    console.error("Error starting packing:", error);
    res.status(500).json({ error: "Failed to start packing" });
  }
});

// Mark individual item as packed
router.put("/item/:orderId/:itemIndex", async (req, res) => {
  try {
    const { orderId, itemIndex } = req.params;
    const { employeeId, employeeName } = req.body;

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

    // Mark item as packed
    order.items[itemIndex].packingStatus = "packed";
    order.items[itemIndex].packedAt = new Date();
    order.items[itemIndex].packedBy = {
      staffId: employeeId,
      staffName: employeeName,
      timestamp: new Date(),
    };

    // Update packing details
    const packedItems = order.items.filter(
      (item) => item.packingStatus === "packed"
    ).length;
    const totalItems = order.items.length;

    order.packingDetails = order.packingDetails || {};
    order.packingDetails.totalItemsPacked = packedItems;
    order.packingDetails.totalItemsRequested = totalItems;
    order.packingDetails.packingProgress = Math.round(
      (packedItems / totalItems) * 100
    );

    await customer.save();

    res.json({
      success: true,
      message: `Item ${itemIndex} marked as packed`,
      packedItems: packedItems,
      totalItems: totalItems,
      packingProgress: Math.round((packedItems / totalItems) * 100),
    });
  } catch (error) {
    console.error("Error marking item as packed:", error);
    res.status(500).json({ error: "Failed to mark item as packed" });
  }
});

// Add complaint for item
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

    const complaintId = `ITEM_COMP_${Date.now()}`;

    // Add complaint to item
    if (!order.items[itemIndex].itemComplaints) {
      order.items[itemIndex].itemComplaints = [];
    }

    order.items[itemIndex].itemComplaints.push({
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

    // Mark item as unavailable if complaint indicates so
    if (
      ["not_available", "damaged", "expired", "insufficient_stock"].includes(
        complaintType
      )
    ) {
      order.items[itemIndex].packingStatus = "unavailable";
    }

    // Update packing details
    order.packingDetails = order.packingDetails || {};
    order.packingDetails.hasPackingComplaints = true;

    await customer.save();

    res.json({
      success: true,
      message: "Complaint added successfully",
      complaintId: complaintId,
    });
  } catch (error) {
    console.error("Error adding complaint:", error);
    res.status(500).json({ error: "Failed to add complaint" });
  }
});

// Complete packing for entire order
router.post("/complete/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { packingNotes, employeeId, employeeName } = req.body;

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

    // Check if all items are packed or handled
    const allItemsHandled = order.items.every(
      (item) =>
        item.packingStatus === "packed" || item.packingStatus === "unavailable"
    );

    if (!allItemsHandled) {
      return res.status(400).json({
        error: "Cannot complete packing. Some items are still pending.",
      });
    }

    // Update order status to allocated-driver (next stage)
    order.status = "allocated-driver";

    // Update packing details
    order.packingDetails = order.packingDetails || {};
    order.packingDetails.packingCompletedAt = new Date();
    order.packingDetails.packingNotes = packingNotes;
    order.packingDetails.packingProgress = 100;

    await customer.save();

    // Update delivery tracking workflow - mark as packed
    const tracking = await DeliveryTracking.findOne({ orderId: orderId });
    if (tracking) {
      tracking.workflowStatus.packed.completed = true;
      tracking.workflowStatus.packed.completedAt = new Date();
      tracking.workflowStatus.packed.completedBy = {
        employeeId: employeeId,
        employeeName: employeeName,
      };
      tracking.workflowStatus.packed.packingNotes = packingNotes;

      // Update current status
      tracking.currentStatus = "allocated-driver";

      await tracking.save();
    }

    res.json({
      success: true,
      message: `Order ${orderId} packing completed successfully`,
      newStatus: "allocated-driver",
    });
  } catch (error) {
    console.error("Error completing packing:", error);
    res.status(500).json({ error: "Failed to complete packing" });
  }
});

// Get item complaints for order
router.get("/complaints/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const customer = await Customer.findOne({
      "shoppingHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = customer.shoppingHistory.find((o) => o.orderId === orderId);

    let complaints = [];

    order.items.forEach((item, index) => {
      if (item.itemComplaints && item.itemComplaints.length > 0) {
        item.itemComplaints.forEach((complaint) => {
          complaints.push({
            itemIndex: index,
            itemName: item.productName,
            ...complaint,
          });
        });
      }
    });

    res.json(complaints);
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

// Resolve item complaint
router.put("/complaint/:orderId/:itemIndex/:complaintId", async (req, res) => {
  try {
    const { orderId, itemIndex, complaintId } = req.params;
    const { resolution, employeeId, employeeName } = req.body;

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

    const complaint = order.items[itemIndex].itemComplaints.find(
      (c) => c.complaintId === complaintId
    );

    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    // Update complaint
    complaint.status = "resolved";
    complaint.resolution = resolution;
    complaint.resolvedAt = new Date();

    await customer.save();

    res.json({
      success: true,
      message: "Complaint resolved successfully",
    });
  } catch (error) {
    console.error("Error resolving complaint:", error);
    res.status(500).json({ error: "Failed to resolve complaint" });
  }
});

module.exports = router;
