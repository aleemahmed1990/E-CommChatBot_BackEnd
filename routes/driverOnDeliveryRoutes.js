// routes/driverOnDeliveryRoutes.js - Complete Driver on Delivery routes
const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");
const DeliveryTracking = require("../models/Deliverytracking");
const multer = require("multer");

// Configure multer for handling file uploads (photos/videos)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed!"), false);
    }
  },
});

// Get orders that are on-route (for driver on delivery)
router.get("/active-deliveries", async (req, res) => {
  try {
    const { driverId } = req.query;

    const customers = await Customer.find({
      "shoppingHistory.status": "on-route",
    }).lean();

    let activeDeliveries = [];

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        if (order.status === "on-route") {
          // Filter by driver if specified
          if (driverId && order.routeStartedBy?.driverId !== driverId) {
            continue;
          }

          activeDeliveries.push({
            orderId: order.orderId,
            customerName: customer.name,
            customerPhone: customer.phoneNumber[0] || "",
            deliveryDate: order.deliveryDate,
            timeSlot: order.timeSlot || "",
            deliveryAddress: order.deliveryAddress,
            specialInstructions: order.adminReason || "",
            routeStartedAt: order.routeStartedAt,
            routeStartedBy: order.routeStartedBy,
            items: order.items || [],
            totalItems: order.items ? order.items.length : 0,
            assignmentDetails: order.assignmentDetails,
            deliveryPhotos: order.deliveryPhotos || [],
            isArrived: order.arrivedAt ? true : false,
            arrivedAt: order.arrivedAt,
          });
        }
      }
    }

    // Sort by delivery time
    activeDeliveries.sort(
      (a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate)
    );

    res.json(activeDeliveries);
  } catch (error) {
    console.error("Error fetching active deliveries:", error);
    res.status(500).json({ error: "Failed to fetch active deliveries" });
  }
});

// Mark as arrived at delivery location
router.post("/mark-arrived/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { driverId, driverName, location } = req.body;

    const customer = await Customer.findOne({
      "shoppingHistory.orderId": orderId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderIndex = customer.shoppingHistory.findIndex(
      (o) => o.orderId === orderId
    );

    // Mark as arrived
    customer.shoppingHistory[orderIndex].arrivedAt = new Date();
    customer.shoppingHistory[orderIndex].arrivedBy = {
      driverId: driverId,
      driverName: driverName,
    };

    if (location) {
      customer.shoppingHistory[orderIndex].arrivalLocation = location;
    }

    await customer.save();

    // Update delivery tracking
    const tracking = await DeliveryTracking.findOne({ orderId: orderId });
    if (tracking && tracking.workflowStatus.inTransit) {
      tracking.workflowStatus.inTransit.currentLocation = {
        address: location?.address || "Delivery location",
        latitude: location?.latitude,
        longitude: location?.longitude,
        lastUpdated: new Date(),
      };
      await tracking.save();
    }

    res.json({
      success: true,
      message: `Marked as arrived for order ${orderId}`,
      arrivedAt: new Date(),
    });
  } catch (error) {
    console.error("Error marking as arrived:", error);
    res.status(500).json({ error: "Failed to mark as arrived" });
  }
});

// Upload delivery photo/video
router.post(
  "/upload-delivery-photo/:orderId",
  upload.single("deliveryPhoto"),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { driverId, driverName, notes } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const customer = await Customer.findOne({
        "shoppingHistory.orderId": orderId,
      });

      if (!customer) {
        return res.status(404).json({ error: "Order not found" });
      }

      const orderIndex = customer.shoppingHistory.findIndex(
        (o) => o.orderId === orderId
      );

      // Initialize delivery photos array if not exists
      if (!customer.shoppingHistory[orderIndex].deliveryPhotos) {
        customer.shoppingHistory[orderIndex].deliveryPhotos = [];
      }

      // Convert file to base64 for storage
      const base64Data = req.file.buffer.toString("base64");

      const photoData = {
        photoId: `PHOTO_${Date.now()}`,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        fileSize: req.file.size,
        base64Data: base64Data,
        uploadedAt: new Date(),
        uploadedBy: {
          driverId: driverId,
          driverName: driverName,
        },
        notes: notes || "",
      };

      customer.shoppingHistory[orderIndex].deliveryPhotos.push(photoData);
      await customer.save();

      res.json({
        success: true,
        message: "Delivery photo uploaded successfully",
        photoId: photoData.photoId,
        uploadedAt: photoData.uploadedAt,
      });
    } catch (error) {
      console.error("Error uploading delivery photo:", error);
      res.status(500).json({ error: "Failed to upload delivery photo" });
    }
  }
);

// Complete delivery
router.post("/complete-delivery/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      driverId,
      driverName,
      customerConfirmed,
      deliveryNotes,
      customerSatisfaction,
      customerSignature,
    } = req.body;

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

    // Check if delivery photo is uploaded
    if (!order.deliveryPhotos || order.deliveryPhotos.length === 0) {
      return res.status(400).json({
        error: "Delivery photo is required to complete delivery",
      });
    }

    // Update order status to completed
    customer.shoppingHistory[orderIndex].status = "order-complete";
    customer.shoppingHistory[orderIndex].deliveredAt = new Date();
    customer.shoppingHistory[orderIndex].deliveredBy = {
      driverId: driverId,
      driverName: driverName,
    };
    customer.shoppingHistory[orderIndex].customerConfirmed =
      Boolean(customerConfirmed);
    customer.shoppingHistory[orderIndex].deliveryNotes = deliveryNotes || "";
    customer.shoppingHistory[orderIndex].customerSatisfaction =
      customerSatisfaction || 5;
    customer.shoppingHistory[orderIndex].customerSignature =
      customerSignature || "";

    await customer.save();

    // Update delivery tracking - mark as delivered
    const tracking = await DeliveryTracking.findOne({ orderId: orderId });
    if (tracking) {
      tracking.workflowStatus.delivered.completed = true;
      tracking.workflowStatus.delivered.completedAt = new Date();
      tracking.workflowStatus.delivered.deliveredBy = {
        employeeId: driverId,
        employeeName: driverName,
      };
      tracking.workflowStatus.delivered.customerSignature =
        customerSignature || "";
      tracking.workflowStatus.delivered.deliveryNotes = deliveryNotes || "";
      tracking.workflowStatus.delivered.customerSatisfaction =
        customerSatisfaction || 5;

      // Update current status and timing
      tracking.currentStatus = "order-complete";
      tracking.timingMetrics.actualDeliveryTime = new Date();

      await tracking.save();
    }

    res.json({
      success: true,
      message: `Order ${orderId} delivered successfully`,
      deliveredAt: new Date(),
      newStatus: "order-complete",
    });
  } catch (error) {
    console.error("Error completing delivery:", error);
    res.status(500).json({ error: "Failed to complete delivery" });
  }
});

// Get delivery statistics for driver
router.get("/stats", async (req, res) => {
  try {
    const { driverId } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const customers = await Customer.find({
      "shoppingHistory.status": {
        $in: ["on-route", "order-complete"],
      },
    }).lean();

    let stats = {
      totalDeliveries: 0,
      completed: 0,
      inProgress: 0,
      todayDeliveries: 0,
    };

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        // Filter by driver if specified
        if (driverId) {
          const orderDriverId =
            order.routeStartedBy?.driverId || order.deliveredBy?.driverId;
          if (orderDriverId !== driverId) {
            continue;
          }
        }

        if (order.status === "on-route") {
          stats.totalDeliveries++;
          stats.inProgress++;

          // Check if started today
          if (order.routeStartedAt && new Date(order.routeStartedAt) >= today) {
            stats.todayDeliveries++;
          }
        } else if (order.status === "order-complete") {
          stats.totalDeliveries++;
          stats.completed++;

          // Check if delivered today
          if (order.deliveredAt && new Date(order.deliveredAt) >= today) {
            stats.todayDeliveries++;
          }
        }
      }
    }

    res.json(stats);
  } catch (error) {
    console.error("Error fetching delivery stats:", error);
    res.status(500).json({ error: "Failed to fetch delivery stats" });
  }
});

// Get order details for delivery
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
      assignmentDetails: order.assignmentDetails || {},
      routeStartedAt: order.routeStartedAt,
      routeStartedBy: order.routeStartedBy,
      arrivedAt: order.arrivedAt,
      arrivedBy: order.arrivedBy,
      deliveryPhotos: order.deliveryPhotos || [],
      deliveredAt: order.deliveredAt,
      deliveredBy: order.deliveredBy,
      customerConfirmed: order.customerConfirmed,
      deliveryNotes: order.deliveryNotes,
      customerSatisfaction: order.customerSatisfaction,
    };

    res.json(orderDetails);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

module.exports = router;
