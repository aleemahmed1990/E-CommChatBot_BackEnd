const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");

// ─── GET /api/orders ─────────────────────────────────────
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
    } = req.query;
    const match = {};

    if (status) match["orderHistory.status"] = { $in: status.split(",") };
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
                totalAmount: "$d.orderHistory.totalAmount",
                status: "$d.orderHistory.status",
                items: "$d.orderHistory.items",
                deliveryCharge: "$d.orderHistory.deliveryCharge",
                ecoDeliveryDiscount: "$d.orderHistory.ecoDeliveryDiscount",
                // Include the receipt image directly
                receiptImage: "$d.orderHistory.receiptImage", // No conversion here
                receiptImageMetadata: "$d.orderHistory.receiptImageMetadata", // No conversion here
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

router.put("/orders/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, timeSlot, driver1, driver2, pickupType, truckOnDeliver } =
      req.body;

    // Ensure all required fields are provided
    if (
      !status ||
      !timeSlot ||
      !driver1 ||
      !driver2 ||
      !pickupType ||
      truckOnDeliver === undefined
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the order and update it with the new status and fields
    const order = await Customer.findOneAndUpdate(
      { "orderHistory.orderId": orderId },
      {
        $set: {
          "orderHistory.$.status": status,
          "orderHistory.$.timeSlot": timeSlot,
          "orderHistory.$.driver1": driver1,
          "orderHistory.$.driver2": driver2,
          "orderHistory.$.pickupType": pickupType,
          "orderHistory.$.truckOnDeliver": truckOnDeliver,
        },
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });

    // Return success message
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /orders/:orderId/status error:", err);
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
        orderHistory: {
          $elemMatch: { orderId },
        },
      }
    );

    if (!cust || !cust.orderHistory.length)
      return res.status(404).json({ error: "Order not found" });

    const o = cust.orderHistory[0].toObject();
    o.customer = cust.name;

    // Just pass the receiptImage as is without modification
    o.receiptImage = o.receiptImage;

    res.json(o);
  } catch (err) {
    console.error("GET /api/orders/:orderId error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /api/orders/:orderId/status ────────────────────
// { status, reason? }
router.put("/orders/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, reason } = req.body;
    const cust = await Customer.findOneAndUpdate(
      { "orderHistory.orderId": orderId },
      {
        $set: {
          "orderHistory.$.status": status,
          "orderHistory.$.adminReason": reason || null,
          currentOrderStatus: status,
        },
      },
      { new: true }
    );
    if (!cust) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /api/orders/:orderId/status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
