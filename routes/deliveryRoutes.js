// routes/deliveryRoutes.js - Fixed implementation
const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");
const Employee = require("../models/Employee");
const DeliveryTracking = require("../models/Deliverytracking");

// Helper function to get workflow progress (since method might not be available)
function getWorkflowProgress(tracking) {
  if (
    tracking.getWorkflowProgress &&
    typeof tracking.getWorkflowProgress === "function"
  ) {
    return tracking.getWorkflowProgress();
  }

  // Fallback: manually extract workflow progress
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

// Initialize delivery tracking for existing orders
router.post("/initialize-tracking", async (req, res) => {
  try {
    console.log("🚀 Initializing delivery tracking for existing orders...");

    const customers = await Customer.find({
      shoppingHistory: { $exists: true, $ne: [] },
    });

    let createdCount = 0;
    let skippedCount = 0;

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        // Check if tracking already exists
        const existingTracking = await DeliveryTracking.findOne({
          orderId: order.orderId,
        });

        if (!existingTracking) {
          try {
            await DeliveryTracking.createFromCustomerOrder(customer, order);
            createdCount++;
            console.log(`✅ Created tracking for order: ${order.orderId}`);
          } catch (error) {
            console.error(
              `❌ Error creating tracking for ${order.orderId}:`,
              error.message
            );
          }
        } else {
          skippedCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Initialized tracking for ${createdCount} orders, skipped ${skippedCount} existing`,
      created: createdCount,
      skipped: skippedCount,
    });
  } catch (error) {
    console.error("Error initializing tracking:", error);
    res.status(500).json({ error: "Failed to initialize tracking" });
  }
});

// Get orders overview with real customer data
router.get("/orders/overview", async (req, res) => {
  try {
    const { status, priority, search } = req.query;

    // Build query for customers with active orders
    let customerQuery = {
      shoppingHistory: {
        $elemMatch: {
          status: {
            $in: [
              "order-confirmed",
              "picking-order",
              "allocated-driver",
              "ready to pickup",
              "order-pickuped-up",
              "on-way",
              "driver-confirmed",
              "order-processed",
            ],
          },
        },
      },
    };

    // Add search filter
    if (search) {
      customerQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { "shoppingHistory.orderId": { $regex: search, $options: "i" } },
      ];
    }

    const customers = await Customer.find(customerQuery).lean();

    let allOrders = [];

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        // Filter active orders only
        if (
          [
            "order-confirmed",
            "picking-order",
            "allocated-driver",
            "ready to pickup",
            "order-pickuped-up",
            "on-way",
            "driver-confirmed",
            "order-processed",
          ].includes(order.status)
        ) {
          // Get or create delivery tracking
          let tracking = await DeliveryTracking.findOne({
            orderId: order.orderId,
          });
          if (!tracking) {
            tracking = await DeliveryTracking.createFromCustomerOrder(
              customer,
              order
            );
          }

          // Calculate priority
          const totalAmount = order.totalAmount || 0;
          const orderPriority =
            totalAmount >= 200 ? "HIGH" : totalAmount >= 100 ? "MEDIUM" : "LOW";

          // Apply priority filter
          if (
            priority &&
            priority !== "All Priorities" &&
            orderPriority !== priority
          ) {
            continue;
          }

          // Calculate total items
          const totalItems = order.items
            ? order.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
            : 0;

          // Get workflow progress from tracking using helper function
          const workflowProgress = getWorkflowProgress(tracking);

          // Format order data
          const formattedOrder = {
            id: order.orderId,
            location: order.deliveryAddress?.area || "Unknown Area",
            items: `${totalItems} items`,
            amount: `AED ${totalAmount.toFixed(2)}`,
            customer: customer.name,
            phone: customer.phoneNumber[0] || "",
            address:
              order.deliveryAddress?.fullAddress || "Address not provided",
            schedule: order.deliveryDate
              ? new Date(order.deliveryDate).toLocaleString()
              : "Not scheduled",
            status: mapStatusToDisplay(order.status),
            priority: orderPriority,
            officer: order.driver1 || order.driver2 || "",

            // Workflow progress from tracking
            progress: workflowProgress,

            // Additional details
            hasComplaints: order.complaints && order.complaints.length > 0,
            deliveryType: order.deliveryType || "truck",
            timeSlot: order.timeSlot || "",
            isOverdue: isOrderOverdue(order.deliveryDate),
            specialInstructions: order.adminReason || "",

            // Raw data for actions
            rawOrder: order,
            customerId: customer._id,
            customerName: customer.name,
            whatsappPhone: customer.phoneNumber[0] || "",

            // NEW: Customer and Order Details for the new columns
            customerDetails: {
              name: customer.name,
              phone: customer.phoneNumber[0] || "",
              email: customer.email || "Not provided",
              totalOrders: customer.shoppingHistory
                ? customer.shoppingHistory.length
                : 0,
              customerSince: customer.createdAt
                ? new Date(customer.createdAt).toLocaleDateString()
                : "Unknown",
            },
            orderDetails: {
              orderId: order.orderId,
              orderDate: order.orderDate
                ? new Date(order.orderDate).toLocaleDateString()
                : "Unknown",
              itemCount: totalItems,
              totalAmount: totalAmount,
              paymentStatus: order.paymentStatus || "pending",
              paymentMethod: order.paymentMethod || "Not specified",
              deliveryType: order.deliveryType || "truck",
            },
          };

          allOrders.push(formattedOrder);
        }
      }
    }

    // Apply status filter
    if (status && status !== "All Status") {
      allOrders = allOrders.filter((order) => order.status === status);
    }

    // Sort by delivery date and priority
    allOrders.sort((a, b) => {
      // First by priority
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const priorityDiff =
        priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by delivery date
      const aDate = new Date(a.rawOrder.deliveryDate || a.rawOrder.orderDate);
      const bDate = new Date(b.rawOrder.deliveryDate || b.rawOrder.orderDate);
      return aDate - bDate;
    });

    res.json(allOrders);
  } catch (error) {
    console.error("Error fetching orders overview:", error);
    res.status(500).json({ error: "Failed to fetch orders overview" });
  }
});

// Get workflow status counts
router.get("/workflow-status", async (req, res) => {
  try {
    const trackingRecords = await DeliveryTracking.find({ isActive: true });

    const statusCounts = {
      pending: 0,
      packed: 0,
      storage: 0,
      assigned: 0,
      loaded: 0,
      inTransit: 0,
      delivered: 0,
    };

    trackingRecords.forEach((tracking) => {
      const progress = getWorkflowProgress(tracking); // Use helper function

      if (progress.pending) statusCounts.pending++;
      if (progress.packed) statusCounts.packed++;
      if (progress.storage) statusCounts.storage++;
      if (progress.assigned) statusCounts.assigned++;
      if (progress.loaded) statusCounts.loaded++;
      if (progress.inTransit) statusCounts.inTransit++;
      if (progress.delivered) statusCounts.delivered++;
    });

    res.json(statusCounts);
  } catch (error) {
    console.error("Error fetching workflow status:", error);
    res.status(500).json({ error: "Failed to fetch workflow status" });
  }
});

// Get specific order details
router.get("/orders/:orderId/details", async (req, res) => {
  try {
    const { orderId } = req.params;

    const customer = await Customer.findOne({
      "shoppingHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = customer.shoppingHistory.find((o) => o.orderId === orderId);
    const tracking = await DeliveryTracking.findOne({ orderId: orderId });

    const orderDetails = {
      orderId: order.orderId,
      customer: {
        name: customer.name,
        phone: customer.phoneNumber[0] || "",
        email: customer.email || "",
        address: order.deliveryAddress,
      },
      items: order.items || [],
      totalAmount: order.totalAmount,
      deliveryCharge: order.deliveryCharge,
      status: order.status,
      deliveryDate: order.deliveryDate,
      timeSlot: order.timeSlot,
      deliveryType: order.deliveryType,
      driver1: order.driver1,
      driver2: order.driver2,
      complaints: order.complaints || [],
      orderDate: order.orderDate,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      specialInstructions: order.adminReason,

      // Workflow progress using helper function
      workflowProgress: tracking ? getWorkflowProgress(tracking) : null,

      // WhatsApp details
      whatsappPhone: customer.phoneNumber[0] || "",
    };

    res.json(orderDetails);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

// Update workflow status (called from other dashboards)
router.put("/orders/:orderId/workflow/:step", async (req, res) => {
  try {
    const { orderId, step } = req.params;
    const { completed, employeeId, employeeName, details } = req.body;

    // Find and update tracking
    const tracking = await DeliveryTracking.findOne({ orderId: orderId });
    if (!tracking) {
      return res.status(404).json({ error: "Order tracking not found" });
    }

    // Update workflow step
    const updateDetails = {
      completedBy: {
        employeeId: employeeId || "SYSTEM",
        employeeName: employeeName || "System",
      },
      ...details,
    };

    await tracking.updateWorkflowStatus(step, completed, updateDetails);

    // Also update customer order status if needed
    if (step === "packed" && completed) {
      await Customer.updateOne(
        { "shoppingHistory.orderId": orderId },
        { $set: { "shoppingHistory.$.status": "allocated-driver" } }
      );
    }

    res.json({
      success: true,
      message: `Workflow step '${step}' updated to ${
        completed ? "completed" : "pending"
      }`,
      workflowProgress: getWorkflowProgress(tracking), // Use helper function
    });
  } catch (error) {
    console.error("Error updating workflow status:", error);
    res.status(500).json({ error: "Failed to update workflow status" });
  }
});

// WhatsApp integration - Send message to customer
router.post("/orders/:orderId/whatsapp", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { messageType, customMessage } = req.body;

    const customer = await Customer.findOne({
      "shoppingHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = customer.shoppingHistory.find((o) => o.orderId === orderId);
    const phone = customer.phoneNumber[0];

    if (!phone) {
      return res.status(400).json({ error: "Customer phone number not found" });
    }

    // Generate WhatsApp URL
    let message = customMessage;

    if (!customMessage) {
      // Generate default message based on type
      switch (messageType) {
        case "status_update":
          message = `Hello ${
            customer.name
          }, your order ${orderId} status has been updated. Current status: ${mapStatusToDisplay(
            order.status
          )}`;
          break;
        case "delivery_notification":
          message = `Hello ${
            customer.name
          }, your order ${orderId} is ready for delivery. Estimated delivery: ${
            order.deliveryDate
              ? new Date(order.deliveryDate).toLocaleDateString()
              : "TBD"
          }`;
          break;
        case "general_inquiry":
          message = `Hello ${customer.name}, regarding your order ${orderId}. How can we help you today?`;
          break;
        default:
          message = `Hello ${customer.name}, regarding your order ${orderId}.`;
      }
    }

    const whatsappUrl = `https://wa.me/${phone.replace(
      /[^0-9]/g,
      ""
    )}?text=${encodeURIComponent(message)}`;

    // Update tracking with message history
    await DeliveryTracking.updateOne(
      { orderId: orderId },
      {
        $push: {
          "whatsappDetails.messageHistory": {
            messageType: messageType,
            sentAt: new Date(),
            content: message,
          },
        },
        $set: {
          "whatsappDetails.lastMessageSent": new Date(),
        },
      }
    );

    res.json({
      success: true,
      whatsappUrl: whatsappUrl,
      message: message,
      customerPhone: phone,
    });
  } catch (error) {
    console.error("Error generating WhatsApp URL:", error);
    res.status(500).json({ error: "Failed to generate WhatsApp URL" });
  }
});

// Get available drivers
router.get("/drivers/available", async (req, res) => {
  try {
    const drivers = await Employee.find({
      employeeCategory: "Driver",
      isActivated: true,
      isBlocked: false,
    }).select("employeeId name email phone roles");

    res.json(drivers);
  } catch (error) {
    console.error("Error fetching available drivers:", error);
    res.status(500).json({ error: "Failed to fetch available drivers" });
  }
});

// Helper function to map status to display
function mapStatusToDisplay(status) {
  const statusMap = {
    "order-confirmed": "Pending",
    "picking-order": "Packing",
    "allocated-driver": "Assigned",
    "ready to pickup": "Ready",
    "order-pickuped-up": "Loaded",
    "on-way": "In Transit",
    "driver-confirmed": "In Transit",
    "order-processed": "Delivered",
  };
  return statusMap[status] || status;
}

// Helper function to check if order is overdue
function isOrderOverdue(deliveryDate) {
  if (!deliveryDate) return false;
  const now = new Date();
  const delivery = new Date(deliveryDate);
  return delivery < now;
}

module.exports = router;
