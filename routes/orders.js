// routes/orders.js - Complete Orders Router - CLEAN VERSION

const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");

function getOrdersFromCustomer(customer) {
  const orders =
    customer.shoppingHistory && customer.shoppingHistory.length > 0
      ? customer.shoppingHistory
      : customer.orderHistory || [];

  return orders.map((order) => {
    const orderObj = order.toObject();
    return {
      orderId: orderObj.orderId,
      orderDate: orderObj.orderDate,
      created: orderObj.orderDate,
      customer: customer.name,
      customerName: customer.name,
      customerId: customer._id,
      phoneNumber:
        customer.phoneNumber && customer.phoneNumber.length > 0
          ? customer.phoneNumber[0]
          : "N/A",
      customerPhone:
        customer.phoneNumber && customer.phoneNumber.length > 0
          ? customer.phoneNumber[0]
          : "N/A",
      items: orderObj.items || [],
      totalAmount: orderObj.totalAmount,
      deliveryCharge: orderObj.deliveryCharge || 0,
      status: customer.currentOrderStatus,
      currentOrderStatus: customer.currentOrderStatus,
      orderStatus: orderObj.status,
      paymentStatus: orderObj.paymentStatus || "pending",
      paymentMethod: orderObj.paymentMethod,
      transactionId: orderObj.transactionId,
      accountHolderName: orderObj.accountHolderName || "",
      paidBankName: orderObj.paidBankName || "",
      receiptImage: orderObj.receiptImage || null,
      receiptImageMetadata: orderObj.receiptImageMetadata || null,
      deliveryAddress: orderObj.deliveryAddress || {},
      deliveryOption: orderObj.deliveryOption,
      deliveryLocation: orderObj.deliveryLocation,
      deliveryType: orderObj.deliveryType,
      deliverySpeed: orderObj.deliverySpeed,
      timeSlot: orderObj.timeSlot,
      driver1: orderObj.driver1,
      driver2: orderObj.driver2,
      pickupType: orderObj.pickupType,
      truckOnDeliver: orderObj.truckOnDeliver || false,
      ecoDeliveryDiscount: orderObj.ecoDeliveryDiscount || 0,
      firstOrderDiscount:
        orderObj.discounts?.firstOrderDiscount ||
        orderObj.firstOrderDiscount ||
        0,
      adminReason: orderObj.adminReason,
      pickupAllocated: orderObj.pickupAllocated || false,
      allocatedAt: orderObj.allocatedAt,
      complaints: orderObj.complaints || [],
      refunds: orderObj.refunds || [],
      replacements: orderObj.replacements || [],
      corrections: orderObj.corrections || [],
    };
  });
}

function findOrderInCustomer(customer, orderId) {
  if (customer.shoppingHistory && customer.shoppingHistory.length > 0) {
    const order = customer.shoppingHistory.find((o) => o.orderId === orderId);
    if (order) {
      return {
        order: order,
        isShoppingHistory: true,
        index: customer.shoppingHistory.findIndex((o) => o.orderId === orderId),
      };
    }
  }

  if (customer.orderHistory && customer.orderHistory.length > 0) {
    const order = customer.orderHistory.find((o) => o.orderId === orderId);
    if (order) {
      return {
        order: order,
        isShoppingHistory: false,
        index: customer.orderHistory.findIndex((o) => o.orderId === orderId),
      };
    }
  }

  return null;
}

router.get("/", async (req, res) => {
  try {
    const {
      currentOrderStatus,
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

    let customerMatch = {};
    if (currentOrderStatus) {
      const statusArray = currentOrderStatus.split(",");
      if (statusArray.length === 1) {
        customerMatch.currentOrderStatus = statusArray[0];
      } else {
        customerMatch.currentOrderStatus = { $in: statusArray };
      }
    }

    const baseMatch = {
      $or: [
        { "shoppingHistory.0": { $exists: true } },
        { "orderHistory.0": { $exists: true } },
      ],
    };

    const finalMatch =
      Object.keys(customerMatch).length > 0
        ? { $and: [baseMatch, customerMatch] }
        : baseMatch;

    const customers = await Customer.find(finalMatch);

    let allOrders = [];
    customers.forEach((customer) => {
      const orders = getOrdersFromCustomer(customer);
      allOrders.push(...orders);
    });

    let filteredOrders = allOrders;

    if (status && !currentOrderStatus) {
      const statusArray = status.includes(",") ? status.split(",") : [status];
      filteredOrders = filteredOrders.filter((order) =>
        statusArray.includes(order.status)
      );
    }

    if (search) {
      filteredOrders = filteredOrders.filter((order) =>
        order.orderId.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (startDate || endDate) {
      filteredOrders = filteredOrders.filter((order) => {
        const orderDate = new Date(order.orderDate);
        if (startDate && orderDate < new Date(startDate)) return false;
        if (endDate && orderDate > new Date(endDate)) return false;
        return true;
      });
    }

    if (deliveryType) {
      filteredOrders = filteredOrders.filter(
        (order) => order.deliveryType === deliveryType
      );
    }
    if (driver1) {
      filteredOrders = filteredOrders.filter(
        (order) => order.driver1 === driver1
      );
    }
    if (driver2) {
      filteredOrders = filteredOrders.filter(
        (order) => order.driver2 === driver2
      );
    }
    if (area) {
      filteredOrders = filteredOrders.filter((order) =>
        order.deliveryAddress?.area?.toLowerCase().includes(area.toLowerCase())
      );
    }

    filteredOrders.sort(
      (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
    );

    const total = filteredOrders.length;
    const skip = (Number(page) - 1) * Number(limit);
    const paginatedOrders = filteredOrders.slice(skip, skip + Number(limit));

    res.json({
      success: true,
      orders: paginatedOrders,
      total: total,
      count: paginatedOrders.length,
    });
  } catch (error) {
    console.error("Orders API Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
});

router.get("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const customer = await Customer.findOne({
      $or: [
        { "shoppingHistory.orderId": orderId },
        { "orderHistory.orderId": orderId },
      ],
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const orderInfo = findOrderInCustomer(customer, orderId);
    if (!orderInfo) {
      return res.status(404).json({
        success: false,
        message: "Order not found in customer data",
      });
    }

    const order = orderInfo.order;

    const formattedOrder = {
      orderId: order.orderId,
      orderDate: order.orderDate,
      created: order.orderDate,
      customer: customer.name,
      customerName: customer.name,
      customerId: customer._id,
      phoneNumber:
        customer.phoneNumber && customer.phoneNumber.length > 0
          ? customer.phoneNumber[0]
          : "N/A",
      customerPhone:
        customer.phoneNumber && customer.phoneNumber.length > 0
          ? customer.phoneNumber[0]
          : "N/A",
      items: order.items || [],
      totalAmount: order.totalAmount,
      deliveryCharge: order.deliveryCharge || 0,
      status: customer.currentOrderStatus,
      currentOrderStatus: customer.currentOrderStatus,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus || "pending",
      paymentMethod: order.paymentMethod,
      transactionId: order.transactionId,
      accountHolderName: order.accountHolderName || "",
      paidBankName: order.paidBankName || "",
      receiptImage: order.receiptImage || null,
      receiptImageMetadata: order.receiptImageMetadata || null,
      deliveryAddress: order.deliveryAddress || {},
      deliveryOption: order.deliveryOption,
      deliveryLocation: order.deliveryLocation,
      deliveryType: order.deliveryType,
      deliverySpeed: order.deliverySpeed,
      timeSlot: order.timeSlot,
      driver1: order.driver1,
      driver2: order.driver2,
      pickupType: order.pickupType,
      truckOnDeliver: order.truckOnDeliver || false,
      ecoDeliveryDiscount: order.ecoDeliveryDiscount || 0,
      firstOrderDiscount:
        order.discounts?.firstOrderDiscount || order.firstOrderDiscount || 0,
      adminReason: order.adminReason,
      pickupAllocated: order.pickupAllocated || false,
      allocatedAt: order.allocatedAt,
      complaints: order.complaints || [],
      refunds: order.refunds || [],
      replacements: order.replacements || [],
      corrections: order.corrections || [],
    };

    res.json(formattedOrder);
  } catch (error) {
    console.error("Error fetching specific order:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching order",
      error: error.message,
    });
  }
});

router.put("/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const customer = await Customer.findOne({
      $or: [
        { "shoppingHistory.orderId": orderId },
        { "orderHistory.orderId": orderId },
      ],
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const orderInfo = findOrderInCustomer(customer, orderId);

    if (!orderInfo) {
      return res.status(404).json({
        success: false,
        message: "Order not found in customer data",
      });
    }

    if (orderInfo.isShoppingHistory) {
      customer.shoppingHistory[orderInfo.index].status = status;
      if (reason) {
        customer.shoppingHistory[orderInfo.index].adminReason = reason;
      }
    } else {
      customer.orderHistory[orderInfo.index].status = status;
      if (reason) {
        customer.orderHistory[orderInfo.index].adminReason = reason;
      }
    }

    customer.currentOrderStatus = status;

    await customer.save();

    res.json({
      success: true,
      message: "Order status updated successfully",
      orderId: orderId,
      newStatus: status,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating order status",
      error: error.message,
    });
  }
});

module.exports = router;
