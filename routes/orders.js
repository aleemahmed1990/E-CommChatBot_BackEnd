const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");

// ─── GET /api/orders ─────────────────────────────────────
// returns paged summary plus items for expand
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

    const skip = (page - 1) * limit;
    const pipeline = [
      { $unwind: "$orderHistory" },
      Object.keys(match).length ? { $match: match } : null,
      { $sort: { "orderHistory.orderDate": -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: +limit }],
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
                orderId: "$$d.orderHistory.orderId",
                created: "$$d.orderHistory.orderDate",
                customer: "$name",
                totalAmount: "$$d.orderHistory.totalAmount",
                status: "$$d.orderHistory.status",
                items: "$$d.orderHistory.items",
                receiptImage: "$$d.orderHistory.receiptImage", // keep raw data
                accountHolderName: "$$d.orderHistory.accountHolderName",
                paidBankName: "$$d.orderHistory.paidBankName",
              },
            },
          },
        },
      },
    ].filter(Boolean);

    const results = await Customer.aggregate(pipeline);
    const result = results[0] || { orders: [], total: 0 };

    res.json({ orders: result.orders || [], total: result.total || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /api/orders/:orderId ───────────────────────────
// full detail for one order
router.get("/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const cust = await Customer.findOne(
      { "orderHistory.orderId": orderId },
      { orderHistory: { $elemMatch: { orderId } }, name: 1 }
    );
    if (!cust || !cust.orderHistory.length)
      return res.status(404).json({ error: "Order not found" });

    const o = cust.orderHistory[0].toObject();
    o.customer = cust.name;
    // No conversion to data URI for receiptImage
    res.json(o);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PUT /api/orders/:orderId/status ────────────────────
// body: { status: "...", reason?: "..."}
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
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
