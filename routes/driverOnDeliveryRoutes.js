// routes/driverOnDeliveryRoutes.js - FIXED: Complete delivery only with photo requirement

const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");
const DeliveryTracking = require("../models/Deliverytracking");
const multer = require("multer");

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
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

// Get active deliveries - orders with "on-way" status
router.get("/active-deliveries", async (req, res) => {
  try {
    const { driverId } = req.query;

    const customers = await Customer.find({
      "shoppingHistory.status": "on-way",
    }).lean();

    let activeDeliveries = [];

    for (let customer of customers) {
      for (let order of customer.shoppingHistory) {
        if (order.status === "on-way") {
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

    activeDeliveries.sort(
      (a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate)
    );

    res.json(activeDeliveries);
  } catch (error) {
    console.error("Error fetching active deliveries:", error);
    res.status(500).json({ error: "Failed to fetch active deliveries" });
  }
});

// Mark as arrived
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

    customer.shoppingHistory[orderIndex].arrivedAt = new Date();
    customer.shoppingHistory[orderIndex].arrivedBy = {
      driverId: driverId,
      driverName: driverName,
    };

    if (location) {
      customer.shoppingHistory[orderIndex].arrivalLocation = location;
    }

    await customer.save();

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

    console.log(`✅ Driver marked as arrived for order ${orderId}`);

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

// Upload delivery photo - REQUIRED before completion
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

      console.log(`📸 Uploading delivery photo for order ${orderId}`);

      const customer = await Customer.findOne({
        "shoppingHistory.orderId": orderId,
      });

      if (!customer) {
        return res.status(404).json({ error: "Order not found" });
      }

      const orderIndex = customer.shoppingHistory.findIndex(
        (o) => o.orderId === orderId
      );

      if (!customer.shoppingHistory[orderIndex].deliveryPhotos) {
        customer.shoppingHistory[orderIndex].deliveryPhotos = [];
      }

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

      console.log(`✅ Delivery photo uploaded for order ${orderId}`);

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

// Complete delivery - ONLY with photo upload + customer confirmation
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

    console.log(`🎉 Completing delivery for order ${orderId}`);

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

    // CRITICAL: Photo is REQUIRED
    if (!order.deliveryPhotos || order.deliveryPhotos.length === 0) {
      console.log(`❌ Cannot complete - No photos for ${orderId}`);
      return res.status(400).json({
        error: "Delivery photo is REQUIRED to complete delivery",
        details:
          "Please upload a photo/video of the receiver before completing",
      });
    }

    // Customer confirmation is required
    if (!customerConfirmed) {
      console.log(
        `❌ Cannot complete - No customer confirmation for ${orderId}`
      );
      return res.status(400).json({
        error: "Customer confirmation is required",
        details: "Customer must confirm receipt of delivery",
      });
    }

    console.log(`✅ All checks passed - Marking ${orderId} as order-complete`);

    // Update order status to "order-complete"
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

    console.log(`✅ Customer record updated to 'order-complete'`);

    // Update DeliveryTracking
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

      tracking.currentStatus = "order-complete";
      tracking.timingMetrics.actualDeliveryTime = new Date();

      await tracking.save();

      console.log(`✅ Delivery tracking updated to 'order-complete'`);
    }

    console.log(`🎉 Order ${orderId} COMPLETED!`);

    res.json({
      success: true,
      message: `Order ${orderId} delivered successfully`,
      deliveredAt: new Date(),
      newStatus: "order-complete",
      photosCount: order.deliveryPhotos.length,
    });
  } catch (error) {
    console.error("Error completing delivery:", error);
    res.status(500).json({ error: "Failed to complete delivery" });
  }
});

// Get stats
router.get("/stats", async (req, res) => {
  try {
    const { driverId } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const customers = await Customer.find({
      "shoppingHistory.status": {
        $in: ["on-way", "order-complete"],
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
        if (driverId) {
          const orderDriverId =
            order.routeStartedBy?.driverId || order.deliveredBy?.driverId;
          if (orderDriverId !== driverId) {
            continue;
          }
        }

        if (order.status === "on-way") {
          stats.totalDeliveries++;
          stats.inProgress++;

          if (order.routeStartedAt && new Date(order.routeStartedAt) >= today) {
            stats.todayDeliveries++;
          }
        } else if (order.status === "order-complete") {
          stats.totalDeliveries++;
          stats.completed++;

          if (order.deliveredAt && new Date(order.deliveredAt) >= today) {
            stats.todayDeliveries++;
          }
        }
      }
    }

    console.log("📊 Driver on delivery stats:", stats);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching delivery stats:", error);
    res.status(500).json({ error: "Failed to fetch delivery stats" });
  }
});

// Get order details
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
      photosCount: order.deliveryPhotos?.length || 0,
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
