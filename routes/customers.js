const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");

// ─── GET /api/orders ─────────────────────────────────
// list + filter + paginate orders
router.get("/orders", async (req, res) => {
  try {
    const {
      status,
      search,
      page = 1,
      limit = 10,
      startDate,
      endDate,
      deliveryType,
    } = req.query;
    const match = {};

    if (status) match["orderHistory.status"] = { $in: status.split(",") };
    if (deliveryType) match["orderHistory.deliveryType"] = deliveryType;
    if (search)
      match["orderHistory.orderId"] = { $regex: search, $options: "i" };
    if (startDate || endDate) {
      match["orderHistory.orderDate"] = {};
      if (startDate) match["orderHistory.orderDate"].$gte = new Date(startDate);
      if (endDate) match["orderHistory.orderDate"].$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const pipeline = [
      { $unwind: "$orderHistory" },
      Object.keys(match).length ? { $match: match } : null,
      { $sort: { "orderHistory.orderDate": -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: Number(limit) }],
        },
      },
      { $unwind: "$metadata" },
      {
        $project: {
          total: "$metadata.total",
          orders: {
            $map: {
              input: "$data",
              as: "d",
              in: {
                orderId: "$d.orderHistory.orderId",
                created: "$d.orderHistory.orderDate",
                customer: "$d.name",
                customerId: "$d._id",
                phoneNumber: { $arrayElemAt: ["$d.phoneNumber", 0] },
                totalAmount: "$d.orderHistory.totalAmount",
                status: "$d.orderHistory.status",
                items: "$d.orderHistory.items",
                deliveryCharge: "$d.orderHistory.deliveryCharge",
                deliveryType: "$d.orderHistory.deliveryType",
                deliverySpeed: "$d.orderHistory.deliverySpeed",
                deliveryAddress: "$d.orderHistory.deliveryAddress",
                ecoDeliveryDiscount: "$d.orderHistory.ecoDeliveryDiscount",
                timeSlot: "$d.orderHistory.timeSlot",
                driver1: "$d.orderHistory.driver1",
                driver2: "$d.orderHistory.driver2",
                pickupType: "$d.orderHistory.pickupType",
                truckOnDeliver: "$d.orderHistory.truckOnDeliver",
                // Receipt image data
                receiptImage: "$d.orderHistory.receiptImage",
                receiptImageMetadata: "$d.orderHistory.receiptImageMetadata",
                // Payment fields
                accountHolderName: "$d.orderHistory.accountHolderName",
                paidBankName: "$d.orderHistory.paidBankName",
              },
            },
          },
        },
      },
    ].filter(Boolean);

    const [result = { orders: [], total: 0 }] = await Customer.aggregate(
      pipeline
    );

    res.json({ orders: result.orders, total: result.total });
  } catch (err) {
    console.error("GET /api/orders error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /api/orders/:orderId/status ────────────────────
// Update order status and additional fields
router.put("/orders/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      status,
      timeSlot,
      driver1,
      driver2,
      pickupType,
      truckOnDeliver,
      reason,
    } = req.body;

    const updateFields = {
      "orderHistory.$.status": status,
    };

    // Add optional fields if provided
    if (timeSlot !== undefined)
      updateFields["orderHistory.$.timeSlot"] = timeSlot;
    if (driver1 !== undefined) updateFields["orderHistory.$.driver1"] = driver1;
    if (driver2 !== undefined) updateFields["orderHistory.$.driver2"] = driver2;
    if (pickupType !== undefined)
      updateFields["orderHistory.$.pickupType"] = pickupType;
    if (truckOnDeliver !== undefined)
      updateFields["orderHistory.$.truckOnDeliver"] = truckOnDeliver;
    if (reason !== undefined)
      updateFields["orderHistory.$.adminReason"] = reason;

    // Also update the customer's current order status
    updateFields.currentOrderStatus = status;

    const order = await Customer.findOneAndUpdate(
      { "orderHistory.orderId": orderId },
      { $set: updateFields },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("PUT /orders/:orderId/status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /api/orders/:orderId/item-status ────────────────────
// Update individual item status in an order
router.put("/orders/:orderId/item-status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { itemIndex, onTruck } = req.body;

    if (itemIndex === undefined || onTruck === undefined) {
      return res
        .status(400)
        .json({ error: "itemIndex and onTruck are required" });
    }

    // Find the customer with the order
    const customer = await Customer.findOne({
      "orderHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Find the order
    const orderIndex = customer.orderHistory.findIndex(
      (order) => order.orderId === orderId
    );
    const order = customer.orderHistory[orderIndex];

    if (!order.items[itemIndex]) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Update the item's onTruck status
    customer.orderHistory[orderIndex].items[itemIndex].onTruck = onTruck;

    // Check if all items are now on truck
    const allItemsOnTruck = customer.orderHistory[orderIndex].items.every(
      (item) => item.onTruck === true
    );

    if (allItemsOnTruck) {
      // Update order status to allocated-driver and set truckOnDeliver to true
      customer.orderHistory[orderIndex].status = "allocated-driver";
      customer.orderHistory[orderIndex].truckOnDeliver = true;
      customer.currentOrderStatus = "allocated-driver";
    }

    await customer.save();

    res.json({
      success: true,
      allItemsOnTruck,
      orderStatus: customer.orderHistory[orderIndex].status,
    });
  } catch (err) {
    console.error("PUT /orders/:orderId/item-status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /api/orders/:orderId ───────────────────────────
// single-order detail
router.get("/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const cust = await Customer.findOne(
      { "orderHistory.orderId": orderId },
      {
        name: 1,
        phoneNumber: 1,
        orderHistory: {
          $elemMatch: { orderId },
        },
      }
    );

    if (!cust || !cust.orderHistory.length)
      return res.status(404).json({ error: "Order not found" });

    const o = cust.orderHistory[0].toObject();
    o.customer = cust.name;
    o.customerId = cust._id;
    o.phoneNumber = cust.phoneNumber[0];

    // Just pass the receiptImage as is without modification
    o.receiptImage = o.receiptImage;

    res.json(o);
  } catch (err) {
    console.error("GET /api/orders/:orderId error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /api/orders/:orderId/allocate ────────────────────
// Allocate order to time slot with drivers
router.put("/orders/:orderId/allocate", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { timeSlot, driver1, driver2, pickupType } = req.body;

    if (!timeSlot || !driver1 || !driver2 || !pickupType) {
      return res
        .status(400)
        .json({ error: "All allocation fields are required" });
    }

    const order = await Customer.findOneAndUpdate(
      { "orderHistory.orderId": orderId },
      {
        $set: {
          "orderHistory.$.timeSlot": timeSlot,
          "orderHistory.$.driver1": driver1,
          "orderHistory.$.driver2": driver2,
          "orderHistory.$.pickupType": pickupType,
          "orderHistory.$.truckOnDeliver": false,
          // Don't change status yet - will change when all items are checked
        },
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("PUT /orders/:orderId/allocate error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// New route for changing order status to "ready-to-pickup"
router.put("/orders/:orderId/ready", async (req, res) => {
  try {
    const { orderId } = req.params;

    // Update the order status to "ready-to-pickup"
    const order = await Customer.findOneAndUpdate(
      { "orderHistory.orderId": orderId },
      {
        $set: {
          "orderHistory.$.status": "ready-to-pickup",
        },
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /orders/:orderId/ready error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /api/orders ─────────────────────────────────
// list + filter + paginate orders (existing endpoint with updates)
router.get("/orders", async (req, res) => {
  try {
    const {
      status,
      search,
      page = 1,
      limit = 10,
      startDate,
      endDate,
      deliveryType,
      area,
      driver1,
      driver2,
    } = req.query;
    const match = {};

    if (status) {
      if (status.includes(",")) {
        match["orderHistory.status"] = { $in: status.split(",") };
      } else {
        match["orderHistory.status"] = status;
      }
    }
    if (deliveryType) match["orderHistory.deliveryType"] = deliveryType;
    if (area)
      match["orderHistory.deliveryAddress.area"] = {
        $regex: area,
        $options: "i",
      };
    if (driver1) match["orderHistory.driver1"] = driver1;
    if (driver2) match["orderHistory.driver2"] = driver2;
    if (search)
      match["orderHistory.orderId"] = { $regex: search, $options: "i" };
    if (startDate || endDate) {
      match["orderHistory.orderDate"] = {};
      if (startDate) match["orderHistory.orderDate"].$gte = new Date(startDate);
      if (endDate) match["orderHistory.orderDate"].$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const pipeline = [
      { $unwind: "$orderHistory" },
      Object.keys(match).length ? { $match: match } : null,
      { $sort: { "orderHistory.orderDate": -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: Number(limit) }],
        },
      },
      { $unwind: "$metadata" },
      {
        $project: {
          total: "$metadata.total",
          orders: {
            $map: {
              input: "$data",
              as: "d",
              in: {
                orderId: "$d.orderHistory.orderId",
                created: "$d.orderHistory.orderDate",
                customer: "$d.name",
                customerId: "$d._id",
                phoneNumber: { $arrayElemAt: ["$d.phoneNumber", 0] },
                totalAmount: "$d.orderHistory.totalAmount",
                status: "$d.orderHistory.status",
                items: "$d.orderHistory.items",
                deliveryCharge: "$d.orderHistory.deliveryCharge",
                deliveryType: "$d.orderHistory.deliveryType",
                deliverySpeed: "$d.orderHistory.deliverySpeed",
                deliveryAddress: "$d.orderHistory.deliveryAddress",
                ecoDeliveryDiscount: "$d.orderHistory.ecoDeliveryDiscount",
                timeSlot: "$d.orderHistory.timeSlot",
                driver1: "$d.orderHistory.driver1",
                driver2: "$d.orderHistory.driver2",
                pickupType: "$d.orderHistory.pickupType",
                truckOnDeliver: "$d.orderHistory.truckOnDeliver",
                complaints: "$d.orderHistory.complaints",
                // Receipt image data
                receiptImage: "$d.orderHistory.receiptImage",
                receiptImageMetadata: "$d.orderHistory.receiptImageMetadata",
                // Payment fields
                accountHolderName: "$d.orderHistory.accountHolderName",
                paidBankName: "$d.orderHistory.paidBankName",
              },
            },
          },
        },
      },
    ].filter(Boolean);

    const [result = { orders: [], total: 0 }] = await Customer.aggregate(
      pipeline
    );

    res.json({ orders: result.orders, total: result.total });
  } catch (err) {
    console.error("GET /api/orders error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/orders/:orderId/complaint ────────────────────
// Add complaint to an order
router.post("/orders/:orderId/complaint", async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      issueTypes,
      additionalDetails,
      solutions,
      solutionDetails,
      customerRequests,
      customerRequestDetails,
      driverId,
      driverName,
    } = req.body;

    // Validate required fields
    if (!issueTypes || !Array.isArray(issueTypes) || issueTypes.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one issue type is required" });
    }

    // Create complaint object
    const complaint = {
      complaintId: "COMP" + Date.now().toString().slice(-8),
      issueTypes: issueTypes,
      additionalDetails: additionalDetails || "",
      solutions: solutions || [],
      solutionDetails: solutionDetails || "",
      customerRequests: customerRequests || [],
      customerRequestDetails: customerRequestDetails || "",
      reportedBy: {
        driverId: driverId,
        driverName: driverName,
      },
      reportedAt: new Date(),
      status: "open", // open, in_progress, resolved
      resolution: "",
      resolvedAt: null,
    };

    // Find customer and add complaint to order
    const customer = await Customer.findOne({
      "orderHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Find the order and add complaint
    const orderIndex = customer.orderHistory.findIndex(
      (order) => order.orderId === orderId
    );

    if (orderIndex === -1) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Initialize complaints array if it doesn't exist
    if (!customer.orderHistory[orderIndex].complaints) {
      customer.orderHistory[orderIndex].complaints = [];
    }

    // Add complaint to order
    customer.orderHistory[orderIndex].complaints.push(complaint);

    // Update order status to indicate there's an issue
    customer.orderHistory[orderIndex].status = "issue-driver";

    await customer.save();

    res.json({
      success: true,
      complaintId: complaint.complaintId,
      message: "Complaint submitted successfully",
    });
  } catch (err) {
    console.error("POST /orders/:orderId/complaint error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /api/complaints ────────────────────────────
// Get all complaints with filters
router.get("/complaints", async (req, res) => {
  try {
    const {
      status,
      driverId,
      orderId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 10,
    } = req.query;

    const match = {
      "orderHistory.complaints": { $exists: true, $ne: [] },
    };

    // Build aggregation pipeline
    const pipeline = [
      { $match: match },
      { $unwind: "$orderHistory" },
      { $match: { "orderHistory.complaints": { $exists: true, $ne: [] } } },
      { $unwind: "$orderHistory.complaints" },
    ];

    // Add filters
    if (status) {
      pipeline.push({ $match: { "orderHistory.complaints.status": status } });
    }
    if (driverId) {
      pipeline.push({
        $match: { "orderHistory.complaints.reportedBy.driverId": driverId },
      });
    }
    if (orderId) {
      pipeline.push({ $match: { "orderHistory.orderId": orderId } });
    }
    if (dateFrom || dateTo) {
      const dateMatch = {};
      if (dateFrom) dateMatch.$gte = new Date(dateFrom);
      if (dateTo) dateMatch.$lte = new Date(dateTo);
      pipeline.push({
        $match: { "orderHistory.complaints.reportedAt": dateMatch },
      });
    }

    // Sort by complaint date
    pipeline.push({ $sort: { "orderHistory.complaints.reportedAt": -1 } });

    // Project final structure
    pipeline.push({
      $project: {
        orderId: "$orderHistory.orderId",
        orderDate: "$orderHistory.orderDate",
        customer: "$name",
        customerId: "$_id",
        totalAmount: "$orderHistory.totalAmount",
        deliveryType: "$orderHistory.deliveryType",
        complaint: "$orderHistory.complaints",
        items: "$orderHistory.items",
      },
    });

    // Add pagination
    const skip = (Number(page) - 1) * Number(limit);
    pipeline.push(
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: Number(limit) }],
        },
      },
      { $unwind: "$metadata" }
    );

    const [result = { data: [], metadata: { total: 0 } }] =
      await Customer.aggregate(pipeline);

    res.json({
      complaints: result.data,
      total: result.metadata.total,
    });
  } catch (err) {
    console.error("GET /api/complaints error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /api/complaints/:complaintId/status ────────────────────
// Update complaint status
router.put("/complaints/:complaintId/status", async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { status, resolution } = req.body;

    const customer = await Customer.findOne({
      "orderHistory.complaints.complaintId": complaintId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    // Find and update complaint
    for (let order of customer.orderHistory) {
      const complaint = order.complaints?.find(
        (c) => c.complaintId === complaintId
      );
      if (complaint) {
        complaint.status = status;
        if (resolution) complaint.resolution = resolution;
        if (status === "resolved") complaint.resolvedAt = new Date();
        break;
      }
    }

    await customer.save();
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /complaints/:complaintId/status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// GET /api/refunds ───────────────────────────────
// List all orders with status "refund"
router.get("/refunds", async (req, res) => {
  try {
    const pipeline = [
      { $unwind: "$orderHistory" },
      { $match: { "orderHistory.status": "refund" } },
      {
        $project: {
          _id: 0,
          orderId: "$orderHistory.orderId",
          customer: "$name",
          phoneNumber: { $arrayElemAt: ["$phoneNumber", 0] },
          totalAmount: "$orderHistory.totalAmount",
        },
      },
    ];

    const refunds = await Customer.aggregate(pipeline);
    res.json({ refunds });
  } catch (err) {
    console.error("GET /api/refunds error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Return only the customer's phone number *and* name for a given order
router.get("/orders/:orderId/phone", async (req, res) => {
  try {
    const { orderId } = req.params;
    // now also project in the `name` field
    const cust = await Customer.findOne(
      { "orderHistory.orderId": orderId },
      { phoneNumber: 1, name: 1 }
    );
    if (!cust) {
      return res.status(404).json({ error: "Order not found" });
    }
    // grab first phone, strip all non‐digits
    const raw = cust.phoneNumber[0] || "";
    const cleaned = raw.replace(/\D+/g, "");
    // return both cleaned phone and the name
    res.json({
      phoneNumber: cleaned,
      name: cust.name,
    });
  } catch (err) {
    console.error("GET /api/orders/:orderId/phone error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
router.put("/orders/:orderId/pickup-status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { pickupStatus } = req.body;

    // Use the actual status values from your ORDER_STATUSES
    const validStatuses = [
      "ready to pickup",
      "order-not-pickedup",
      "order-pickuped-up",
    ];

    if (!validStatuses.includes(pickupStatus)) {
      return res.status(400).json({ error: "Invalid pickup status" });
    }

    const order = await Customer.findOneAndUpdate(
      { "orderHistory.orderId": orderId },
      {
        $set: {
          "orderHistory.$.status": pickupStatus, // Sets to actual database status
        },
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /orders/:orderId/pickup-status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
