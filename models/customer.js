// models/customer.js
const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },
    conversationState: {
      type: String,
      default: "new", // Tracks where they are in the conversation flow
    },
    contextData: {
      // Store additional context for the current conversation state
      categoryId: String,
      categoryName: String,
      subCategoryId: String,
      subCategoryName: String,
      productId: String,
      productName: String,
      selectedWeight: String,
      quantity: Number,
      deliveryOption: String,

      editAddressIndex: Number, // <-- Add this field to fix the issue
      editAddressField: String, // <-- Also add this field for completeness

      // Modify tempAddress to have a default empty object
      tempAddress: {
        type: {
          nickname: { type: String, default: "" },
          fullAddress: { type: String, default: "" },
          area: { type: String, default: "" },
          googleMapLink: { type: String, default: "" },
        },
        default: () => ({
          nickname: "",
          fullAddress: "",
          area: "",
          googleMapLink: "",
        }),
      },

      deliveryLocation: String,
      locationDetails: String,
      paymentMethod: String,
      email: String,
      bankName: String,
      transactionId: String,
      temporaryItemDetails: Object, // For temporary storage during shopping process
    },
    lastInteraction: {
      type: Date,
      default: Date.now,
    },
    orderHistory: [
      {
        orderId: String,
        items: [
          {
            productId: String,
            productName: String,
            quantity: Number,
            price: Number,
            weight: String,
            totalPrice: Number,
          },
        ],
        totalAmount: Number,
        deliveryOption: String,
        deliveryLocation: String,
        deliveryCharge: Number,
        paymentStatus: {
          type: String,
          enum: ["pending", "paid", "failed"],
          default: "pending",
        },
        paymentMethod: String,
        transactionId: String,
        orderDate: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: [
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
          ],
          default: "pending",
        },
        deliveryDate: Date,
      },
    ],
    cart: {
      items: [
        {
          productId: String,
          productName: String,
          category: String,
          subCategory: String,
          weight: String,
          quantity: Number,
          price: Number,
          totalPrice: Number,
          imageUrl: String,
        },
      ],
      totalAmount: {
        type: Number,
        default: 0,
      },
      deliveryOption: {
        type: String,
        default: "Normal Delivery",
      },
      deliveryLocation: String,
      deliveryCharge: {
        type: Number,
        default: 0,
      },
    },
    chatHistory: [
      {
        message: String,
        sender: {
          type: String,
          enum: ["customer", "bot"],
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    addresses: [
      {
        nickname: String, // e.g., "Home", "Office"
        fullAddress: String,
        area: String,
        googleMapLink: String,
        isDefault: Boolean,
      },
    ],
    referralCode: String,
    referredBy: String,
    discountCodes: [
      {
        code: String,
        discountPercentage: Number,
        validUntil: Date,
        isUsed: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Method to add a message to chat history
customerSchema.methods.addToChatHistory = function (message, sender) {
  this.chatHistory.push({
    message,
    sender,
    timestamp: new Date(),
  });
  this.lastInteraction = new Date();
  return this.save();
};

// Method to update conversation state
customerSchema.methods.updateConversationState = function (newState) {
  this.conversationState = newState;
  this.lastInteraction = new Date();
  return this.save();
};

// Method to add item to cart
customerSchema.methods.addToCart = function (product, quantity, weight) {
  // Check if product already exists in cart with same weight
  const existingItemIndex = this.cart.items.findIndex(
    (item) => item.productId === product.id && item.weight === weight
  );

  if (existingItemIndex > -1) {
    // Update existing item quantity
    this.cart.items[existingItemIndex].quantity += quantity;
    this.cart.items[existingItemIndex].totalPrice =
      this.cart.items[existingItemIndex].price *
      this.cart.items[existingItemIndex].quantity;
  } else {
    // Add new item to cart
    this.cart.items.push({
      productId: product.id,
      productName: product.name,
      category: product.category,
      subCategory: product.subCategory,
      weight: weight,
      quantity: quantity,
      price: product.price,
      totalPrice: product.price * quantity,
      imageUrl: product.imageUrl,
    });
  }

  // Recalculate total amount
  this.cart.totalAmount = this.cart.items.reduce(
    (total, item) => total + item.totalPrice,
    0
  );

  return this.save();
};

// Method to remove item from cart
customerSchema.methods.removeFromCart = function (productId, weight) {
  // Filter out the item to remove
  this.cart.items = this.cart.items.filter(
    (item) => !(item.productId === productId && item.weight === weight)
  );

  // Recalculate total amount
  this.cart.totalAmount = this.cart.items.reduce(
    (total, item) => total + item.totalPrice,
    0
  );

  return this.save();
};

// Method to empty cart
customerSchema.methods.emptyCart = function () {
  this.cart.items = [];
  this.cart.totalAmount = 0;
  this.cart.deliveryCharge = 0;
  this.cart.deliveryOption = "Normal Delivery";
  this.cart.deliveryLocation = "";

  return this.save();
};

// Method to create new order from cart
customerSchema.methods.createOrder = function () {
  const orderId = "ORD" + Date.now().toString().slice(-8);

  const newOrder = {
    orderId: orderId,
    items: [...this.cart.items],
    totalAmount: this.cart.totalAmount + this.cart.deliveryCharge,
    deliveryOption: this.cart.deliveryOption,
    deliveryLocation: this.cart.deliveryLocation,
    deliveryCharge: this.cart.deliveryCharge,
    paymentStatus: "pending",
    orderDate: new Date(),
  };

  this.orderHistory.push(newOrder);

  return this.save().then(() => orderId);
};

// Method to update order status
customerSchema.methods.updateOrderStatus = function (orderId, status) {
  const orderIndex = this.orderHistory.findIndex(
    (order) => order.orderId === orderId
  );

  if (orderIndex > -1) {
    this.orderHistory[orderIndex].status = status;
    return this.save();
  }

  return Promise.reject(new Error("Order not found"));
};

// Then create a new model with the updated schema
const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;
