// seedSingleTestOrder.js - Simple script to create ONE test order for manual workflow testing
const mongoose = require("mongoose");
const Customer = require("./models/customer"); // Adjust path as needed
const DeliveryTracking = require("./models/Deliverytracking"); // Adjust path as needed

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://chatbiz50_db_user:hv2Lr5GNFG3vo0Mt@cluster0.m8czptr.mongodb.net/?appName=Cluster0",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Generate sample items for the order
const generateSampleItems = () => {
  const sampleProducts = [
    { name: "Fresh Apples", category: "Fruits", weight: "1kg", price: 15 },
    { name: "Organic Bananas", category: "Fruits", weight: "500g", price: 8 },
    { name: "Whole Milk", category: "Dairy", weight: "1L", price: 12 },
    { name: "Brown Bread", category: "Bakery", weight: "400g", price: 6 },
    { name: "Free Range Eggs", category: "Dairy", weight: "12pcs", price: 18 },
    { name: "Chicken Breast", category: "Meat", weight: "1kg", price: 35 },
  ];

  return sampleProducts.map((product, index) => ({
    productId: `PROD_${Date.now()}_${index}`,
    productName: product.name,
    category: product.category,
    subCategory: product.category,
    weight: product.weight,
    quantity: 2, // Fixed quantity for simplicity
    unitPrice: product.price,
    totalPrice: product.price * 2,
    isDiscountedProduct: false,
    onTruck: false,

    // Packing fields - all pending initially
    packingStatus: "pending",
    packedAt: null,
    packedBy: null,
    packingNotes: "",
    itemComplaints: [],

    // Storage fields - all unverified initially
    storageVerified: false,
    storageCondition: "good",
    verifiedAt: null,
    verifiedBy: null,
    storageComplaints: [],
  }));
};

// Create single test customer with ONE order
const createSingleTestOrder = async () => {
  try {
    console.log("🚀 Creating test customer with ONE order...");

    // Delete existing test customer if exists
    await Customer.deleteOne({ phoneNumber: "923329934858" });
    await DeliveryTracking.deleteMany({
      orderId: "TEST_ORD_SINGLE",
    });

    const testCustomer = new Customer({
      phoneNumber: ["923329934858"],
      name: "Ahmed Hassan Test",
      email: "ahmed.test@email.com",
      isFirstTimeCustomer: false,

      addresses: [
        {
          nickname: "Home",
          fullAddress: "Sheikh Zayed Road, Building 12, Apt 305, Dubai",
          area: "Sheikh Zayed",
          googleMapLink: "https://maps.google.com/test-location",
          isDefault: true,
        },
      ],

      bankAccounts: [
        {
          accountHolderName: "Ahmed Hassan",
          bankName: "Emirates NBD",
          accountNumber: "1234567890",
        },
      ],

      // Create ONLY ONE order with order-confirmed status
      shoppingHistory: [
        {
          orderId: "TEST_ORD_SINGLE",
          orderDate: new Date(), // Just placed
          items: generateSampleItems(), // 6 items
          totalAmount: 188.0, // Total of all items (2 * sum of prices)
          deliveryCharge: 15,

          // IMPORTANT: Current order status - this is what matters for Customer schema
          status: "order-confirmed",

          paymentStatus: "paid",
          paymentMethod: "bank_transfer",
          deliveryOption: "Normal Delivery",
          deliveryLocation: "Sheikh Zayed",
          deliveryType: "truck",
          deliverySpeed: "normal",
          deliveryAddress: {
            nickname: "Home",
            area: "Sheikh Zayed",
            fullAddress: "Sheikh Zayed Road, Building 12, Apt 305, Dubai",
            googleMapLink: "https://maps.google.com/test-location",
          },
          deliveryDate: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours from now
          timeSlot: "2:00 PM - 5:00 PM",
          adminReason: "Please handle fruits with care",

          // Packing details - all empty/pending initially
          packingDetails: {
            packingStartedAt: null,
            packingCompletedAt: null,
            packingStaff: {},
            packingNotes: "",
            totalItemsPacked: 0,
            totalItemsRequested: 6,
            packingProgress: 0,
            hasPackingComplaints: false,
          },

          // Storage details - all empty/pending initially
          storageDetails: {
            verificationStartedAt: null,
            verificationCompletedAt: null,
            verificationStaff: {},
            storageNotes: "",
            storageLocation: "",
            totalItemsVerified: 0,
            totalItemsRequested: 6,
            verificationProgress: 0,
            hasStorageComplaints: false,
          },
        },
      ],
    });

    // Save the test customer
    const savedCustomer = await testCustomer.save();
    console.log("✅ Test customer created successfully");

    // Create delivery tracking record - this is separate from Customer status
    console.log("🚀 Creating delivery tracking record...");

    const order = savedCustomer.shoppingHistory[0];
    const tracking = await DeliveryTracking.createFromCustomerOrder(
      savedCustomer,
      order
    );

    // Initially, all workflow statuses are false (pending)
    // You'll update these through the dashboards
    console.log("✅ Delivery tracking created");

    console.log("\n🎉 Single test order created successfully!");
    console.log("📱 Test customer phone: 923329934858");
    console.log("👤 Customer name: Ahmed Hassan Test");
    console.log("📦 Order ID: TEST_ORD_SINGLE");
    console.log("📋 Order status: order-confirmed");
    console.log("🛍️  Items: 6 products (2 quantity each)");
    console.log("💰 Total amount: AED 203.00 (including delivery)");
    console.log("\n🧪 Testing workflow:");
    console.log(
      "1. Go to Packing Staff Dashboard → Start packing TEST_ORD_SINGLE"
    );
    console.log("2. Pack all items → Complete packing");
    console.log("3. Go to Storage Officer Dashboard → Start verifying");
    console.log("4. Verify all items → Complete verification");
    console.log("5. Check Order Overview → See green checkmarks appear!");
  } catch (error) {
    console.error("❌ Error creating test order:", error);
  }
};

// Main execution function
const runSeed = async () => {
  try {
    await connectDB();
    await createSingleTestOrder();

    console.log("\n✅ Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

// Run the script
if (require.main === module) {
  runSeed();
}

module.exports = { createSingleTestOrder, runSeed };
