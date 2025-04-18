const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");
const fs = require("fs");
const mkdirp = require("mkdirp"); // You might need to install this: npm install mkdirp

// At the top of your file, add:
const referralImagesDir = path.join(__dirname, "../referral_images");
mkdirp.sync(referralImagesDir);

// Import Customer model
const Customer = require("../models/customer");

// MongoDB Connection
const mongoURI =
  "mongodb+srv://realahmedali4:HcPqEvYvWK4Yvrgs@cluster0.cjdum.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Connect to MongoDB
mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Initialize WhatsApp Web.js client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// Add this before initializing the client
client.on("authenticated", () => {
  console.log("Client authenticated successfully");
});

client.on("auth_failure", (error) => {
  console.error("Authentication failure:", error);
});

// Product database (In a real application, this would come from MongoDB)
const productDatabase = {
  categories: [
    {
      id: "screws",
      name: "Screws",
      subCategories: [
        {
          id: "wood_screws",
          name: "Wood Screws",
          products: [
            {
              id: "wood_screw_1",
              name: "Wood Screw Type A",
              price: 500,
              details:
                "Material: Stainless Steel\nBrand: BuildRight\nSize: 2 inches\nItem dimensions: 2 x 0.3 x 0.3 inches\nFinish: Polished\nAbout this item:\n• Perfect for woodworking projects\n• Anti-rust coating for long durability\n• Hardened steel for better penetration",
              weights: ["100g pack", "500g pack", "1kg pack"],
              imageUrl: "/images/wood_screw.png",
            },
            {
              id: "wood_screw_2",
              name: "Wood Screw Type B",
              price: 700,
              details:
                "Material: Stainless Steel\nBrand: CraftMaster\nSize: 3 inches\nItem dimensions: 3 x 0.4 x 0.4 inches\nFinish: Galvanized\nAbout this item:\n• Heavy-duty for structural woodworking\n• Deep threading for stronger hold\n• Weather resistant for outdoor use",
              weights: ["100g pack", "500g pack", "1kg pack"],
              imageUrl: "/images/wood_screw2.png",
            },
          ],
        },
        {
          id: "metal_screws",
          name: "Metal Screws",
          products: [
            {
              id: "metal_screw_1",
              name: "Self-Tapping Metal Screw",
              price: 600,
              details:
                "Material: Hardened Steel\nBrand: MetalPro\nSize: 1.5 inches\nItem dimensions: 1.5 x 0.25 x 0.25 inches\nFinish: Black Oxide\nAbout this item:\n• Self-tapping for easy installation\n• No pre-drilling required\n• Heat treated for maximum strength",
              weights: ["100g pack", "500g pack", "1kg pack"],
              imageUrl: "/images/metal_screw.png",
            },
          ],
        },
      ],
    },
    {
      id: "cement",
      name: "Cement",
      subCategories: [
        {
          id: "pool_cement",
          name: "Pool Cement",
          products: [
            {
              id: "pool_cement_1",
              name: "Ultra Water Resistant Pool Cement",
              price: 1200,
              details:
                "Material: Special Blend Cement\nBrand: AquaBuild\nColor: Gray\nItem weight: Available in multiple weights\nAbout this item:\n• Specially formulated for underwater applications\n• Highly water-resistant\n• Fast setting even in wet conditions\n• Prevents water seepage and leakage",
              weights: ["1kg bag", "5kg bag", "10kg bag"],
              imageUrl: "/images/pool_cement.png",
            },
          ],
        },
        {
          id: "large_cement",
          name: "Larger Cement Products for Construction",
          products: [
            {
              id: "ultra_cement",
              name: "Ultra Tech Cement",
              price: 1220,
              details:
                "Material: Portland Cement\nBrand: UltraTech\nColor: Gray\nItem weight: Available in multiple weights\nStrength grade: 53 grade\nAbout this item:\n• High-strength cement for all structural applications\n• Superior quality and durability\n• Sets in one hour, dries in 15 minutes\n• Safe, permanent and easy to use",
              weights: ["1kg bag", "5kg bag", "10kg bag"],
              imageUrl: "/images/ultra_cement.png",
            },
            {
              id: "rocket_cement",
              name: "Rocket Cement",
              price: 1400,
              details:
                "Material: Adhesive, Sealant\nBrand: H.B. Fuller\nColor: No Color\nItem dimensions: L x W x H4 x 0.68 x 0.68 inches\nExterior Finish: Steel\nAbout this item:\n• SAVE YOUR BACK: Quick, lightweight patent pending technology replaces 80-100lbs of concrete\n• FAST & SECURE: Ready to build in 15 minutes, and mixes in seconds\n• NO WATER, NO MESS!\n• THIS BAG REPLACES 2 BAGS OF CONCRETE!",
              weights: ["1kg bag", "5kg bag", "10kg bag"],
              imageUrl: "/images/rocket_cement.png",
            },
            {
              id: "fast_cement",
              name: "Fast Cement",
              price: 1400,
              details:
                "Material: Adhesive, Sealant\nBrand: H.B. Fuller\nColor: No Color\nItem dimensions: L x W x H4 x 0.68 x 0.68 inches\nExterior Finish: Steel\nAbout this item:\n• SAVE YOUR BACK: Quick, lightweight patent pending technology replaces 80-100lbs of concrete with a lightweight bag that does not require messy mixing with water that requires cleanup & preparation for filling post holes\n• FAST & SECURE: Ready to build in 15 minutes, and mixes in seconds in place and in the bag\n• PRO TECHNOLOGY: It's the same technology used to set utility poles by the professionals\n• EXPANDING COMPOSITE TECHNOLOGY: Uses an expanding composite technology which is stronger than traditional concrete\n• HYDROPHOBIC TO PREVENT ROT: Unlike concrete which absorbs water, this product is waterproof and hydrophobic which prevents water damage",
              weights: ["1kg bag", "5kg bag", "10kg bag"],
              imageUrl: "/images/fast_cement.png",
            },
            {
              id: "white_cement",
              name: "White Cement",
              price: 1500,
              details:
                "Material: White Portland Cement\nBrand: SnowCrete\nColor: Pure White\nItem weight: Available in multiple weights\nAbout this item:\n• Premium quality white cement for decorative finishes\n• Perfect for terrazzo, tiles and ornamental work\n• Superior whiteness and consistency\n• Easy workability and smooth finish",
              weights: ["1kg bag", "5kg bag", "10kg bag"],
              imageUrl: "/images/white_cement.png",
            },
            {
              id: "abc_cement",
              name: "ABC Cement",
              price: 1300,
              details:
                "Material: Adhesive, Sealant\nBrand: H.B. Fuller\nColor: No Color\nItem dimensions: L x W x H4 x 0.68 x 0.68 inches\nExterior Finish: Steel\nAbout this item:\n• SAVE YOUR BACK: Quick, lightweight patent pending technology replaces 80-100lbs of concrete with a lightweight bag\n• Fast setting and high strength formula\n• Excellent for general construction and repairs",
              weights: ["1kg bag", "5kg bag", "10kg bag"],
              imageUrl: "/images/abc_cement.png",
            },
          ],
        },
        {
          id: "sika_cement",
          name: "Sika Cement",
          products: [
            {
              id: "sikacryl",
              name: "SikaCryl Ready-Mix Concrete Patch",
              price: 950,
              details:
                "Material: Acrylic Polymer\nBrand: Sika\nColor: Gray\nNet volume: 32 FL. OZ. 1 Quart (0.95 L)\nAbout this item:\n• Perfect for concrete repairs and patching\n• Ready to use, no mixing required\n• Excellent adhesion to concrete surfaces\n• Waterproof and durable finish",
              weights: ["1 Quart (0.95 L)", "1 Gallon (3.8 L)"],
              imageUrl: "/images/sikacryl.png",
            },
          ],
        },
        {
          id: "colored_cement",
          name: "Colored Cement",
          products: [
            {
              id: "red_cement",
              name: "Red Colored Cement",
              price: 1700,
              details:
                "Material: Portland Cement with Pigment\nBrand: ChromaCrete\nColor: Red\nItem weight: Available in multiple weights\nAbout this item:\n• Permanent color that won't fade with time\n• Perfect for decorative concrete applications\n• Color consistent throughout the mix\n• Easy to work with and finish",
              weights: ["1kg bag", "5kg bag", "10kg bag"],
              imageUrl: "/images/red_cement.png",
            },
          ],
        },
      ],
    },
    {
      id: "bricks",
      name: "Bricks",
      subCategories: [
        {
          id: "clay_bricks",
          name: "Clay Bricks",
          products: [
            {
              id: "clay_brick_standard",
              name: "Standard Clay Brick",
              price: 500,
              details:
                "Material: Clay\nBrand: ClayMaster\nColor: Terracotta\nDimensions: 230 x 110 x 75mm\nAbout this item:\n• Traditional clay brick for all construction needs\n• High durability and compression strength\n• Thermal and sound insulation properties\n• Naturally fire resistant",
              weights: ["Single brick", "Pack of 50", "Pack of 100"],
              imageUrl: "/images/clay_brick.png",
            },
          ],
        },
        {
          id: "concrete_bricks",
          name: "Concrete Bricks",
          products: [
            {
              id: "concrete_brick_standard",
              name: "Standard Concrete Brick",
              price: 450,
              details:
                "Material: Concrete\nBrand: BuildBlock\nColor: Gray\nDimensions: 220 x 100 x 70mm\nAbout this item:\n• Versatile concrete brick for all construction projects\n• Excellent load-bearing capacity\n• Uniform size and shape for easy construction\n• Resistant to weather and pests",
              weights: ["Single brick", "Pack of 50", "Pack of 100"],
              imageUrl: "/images/concrete_brick.png",
            },
          ],
        },
      ],
    },
    {
      id: "steel_rods",
      name: "Steel Rods",
      subCategories: [
        {
          id: "reinforcement_rods",
          name: "Reinforcement Rods",
          products: [
            {
              id: "rebar_8mm",
              name: "8mm Reinforcement Bar (Rebar)",
              price: 650,
              details:
                "Material: High-tensile Steel\nBrand: SteelPro\nDiameter: 8mm\nLength: 12m\nGrade: Fe500\nAbout this item:\n• High tensile strength for reinforced concrete structures\n• Corrosion resistant coating\n• Ribbed surface for better concrete bonding\n• Meets international quality standards",
              weights: ["Single 12m rod", "Bundle of 5", "Bundle of 10"],
              imageUrl: "/images/rebar.png",
            },
          ],
        },
        {
          id: "smooth_rods",
          name: "Smooth Steel Rods",
          products: [
            {
              id: "smooth_rod_10mm",
              name: "10mm Smooth Steel Rod",
              price: 700,
              details:
                "Material: Mild Steel\nBrand: MetalCraft\nDiameter: 10mm\nLength: 6m\nFinish: Galvanized\nAbout this item:\n• General purpose steel rod for various applications\n• Smooth surface for easy handling\n• Rust resistant galvanized coating\n• Can be easily cut and bent to required shape",
              weights: ["Single 6m rod", "Bundle of 5", "Bundle of 10"],
              imageUrl: "/images/smooth_rod.png",
            },
          ],
        },
      ],
    },
    {
      id: "sand_aggregates",
      name: "Sand and Aggregates",
      subCategories: [
        {
          id: "sand",
          name: "Sand",
          products: [
            {
              id: "river_sand",
              name: "River Sand",
              price: 350,
              details:
                "Type: Natural River Sand\nColor: Light brown\nGrain size: Medium\nAbout this item:\n• Washed and screened for construction use\n• Free from impurities and organic matter\n• Ideal for concrete, mortar and plaster mixes\n• Provides excellent workability and finish",
              weights: ["25kg bag", "50kg bag", "100kg bag"],
              imageUrl: "/images/river_sand.png",
            },
          ],
        },
        {
          id: "gravel",
          name: "Gravel",
          products: [
            {
              id: "construction_gravel",
              name: "Construction Gravel",
              price: 400,
              details:
                "Type: Crushed stone\nSize: 20mm\nColor: Mixed gray\nAbout this item:\n• High quality crushed stone aggregate\n• Ideal for concrete mixing and foundations\n• Provides excellent strength and durability to concrete\n• Well-graded for optimal performance",
              weights: ["25kg bag", "50kg bag", "100kg bag"],
              imageUrl: "/images/gravel.png",
            },
          ],
        },
      ],
    },
    {
      id: "others",
      name: "Others",
      subCategories: [
        {
          id: "tools",
          name: "Construction Tools",
          products: [
            {
              id: "trowel",
              name: "Professional Plastering Trowel",
              price: 250,
              details:
                "Material: Stainless Steel with Wooden Handle\nBrand: ToolMaster\nSize: 11 inches\nWeight: 350g\nAbout this item:\n• Professional grade plastering trowel\n• Ergonomic wooden handle for comfortable grip\n• High quality stainless steel blade\n• Perfect for applying and smoothing plaster, mortar and concrete",
              weights: ["Standard"],
              imageUrl: "/images/trowel.png",
            },
          ],
        },
        {
          id: "safety_equipment",
          name: "Safety Equipment",
          products: [
            {
              id: "safety_helmet",
              name: "Construction Safety Helmet",
              price: 180,
              details:
                "Material: High-density polyethylene\nBrand: SafeGuard\nColor: Yellow\nCertification: ANSI Z89.1\nAbout this item:\n• Impact resistant construction helmet\n• Adjustable harness for comfortable fit\n• Ventilated design for air circulation\n• Meets international safety standards",
              weights: ["Standard"],
              imageUrl: "/images/safety_helmet.png",
            },
          ],
        },
      ],
    },
  ],
};

client.on("message", async (message) => {
  try {
    const from = message.from; // e.g., '923325173276@c.us'
    const phone = from.replace("@c.us", "");

    let customer = await Customer.findOne({ phoneNumber: phone });

    // Handle Media Messages First
    if (message.hasMedia && customer) {
      const media = await message.downloadMedia();

      // ✅ Referral Image Upload
      if (
        media.mimetype.startsWith("image/") &&
        customer.conversationState === "referral_create_image"
      ) {
        const imageId = "IMG" + Date.now().toString().slice(-8);
        const imageFilename = `${imageId}.jpg`;
        const imagePath = path.join(referralImagesDir, imageFilename);

        fs.writeFileSync(imagePath, media.data, "base64");

        if (!customer.referralImages) customer.referralImages = [];

        customer.referralImages.push({
          imageId,
          imagePath: `/referral_images/${imageFilename}`,
          approvalDate: new Date(),
          sharedWith: [],
        });

        await customer.save();

        await sendWhatsAppMessage(
          from,
          `Video #${customer.referralImages.length}\n` +
            `Approved on: ${new Date().toLocaleDateString()}\n` +
            `Duration: 3 min\n` +
            `Shared till now: 0 contact`
        );

        await customer.updateConversationState("referral_add_contacts");

        return;
      }

      // ✅ Handle Contact (vCard)
      if (media.mimetype === "text/vcard") {
        const vcard = media.data.toString("utf8");

        let contactName = "";
        const nameMatch = vcard.match(/FN:(.*)/i);
        if (nameMatch && nameMatch[1]) contactName = nameMatch[1].trim();

        let contactNumber = "";
        const phoneMatch = vcard.match(/TEL;[^:]*:(.*)/i);
        if (phoneMatch && phoneMatch[1]) {
          contactNumber = phoneMatch[1].trim().replace(/[^0-9+]/g, "");

          if (!contactNumber.includes("@c.us")) {
            if (!contactNumber.startsWith("+")) {
              contactNumber = "+" + contactNumber;
            }
            contactNumber = contactNumber.replace("+", "") + "@c.us";
          }
        }

        if (
          contactNumber &&
          ["referral_add_contacts", "referral_contact_number"].includes(
            customer.conversationState
          )
        ) {
          if (
            !customer.referralImages ||
            customer.referralImages.length === 0
          ) {
            await sendWhatsAppMessage(
              from,
              "Error: No referral video found. Please create a video first."
            );
            await sendMainMenu(from, customer);
            return;
          }

          const latestImage =
            customer.referralImages[customer.referralImages.length - 1];

          latestImage.sharedWith.push({
            name: contactName || "Contact",
            phoneNumber: contactNumber,
            dateShared: new Date(),
            status: "pending",
          });

          await customer.save();

          await sendWhatsAppMessage(from, contactNumber.replace("@c.us", ""));

          await customer.updateConversationState("referral_more_contacts");
          await sendWhatsAppMessage(
            from,
            "Do you want to refer more friends?\n1. Yes\n2. No"
          );

          return;
        }
      }
    }

    // ✅ Process Normal Text Messages
    await processChatMessage(from, message.body, message);
  } catch (err) {
    console.error("Error handling WhatsApp message:", err);
  }
});

function normalizeWhatsAppId(rawPhone) {
  if (rawPhone.includes("@c.us")) return rawPhone;
  return rawPhone.replace(/\D/g, "") + "@c.us";
}

function cleanPhoneNumber(phoneNumber) {
  // Remove @c.us, @s.whatsapp.net, or any similar suffix
  let cleanNumber = phoneNumber.replace(/@(c\.us|s\.whatsapp\.net)$/, "");

  // Remove any non-digit characters
  cleanNumber = cleanNumber.replace(/\D/g, "");

  return cleanNumber;
}
// Helper function to find product by ID with better fallback for discounted products
function findProductById(productId) {
  // First try to find the product in the regular product database
  for (const category of productDatabase.categories) {
    for (const subCategory of category.subCategories) {
      const product = subCategory.products.find((p) => p.id === productId);
      if (product) {
        return {
          ...product,
          category: category.name,
          subCategory: subCategory.name,
        };
      }
    }
  }

  // If not found, check if it's a discounted product
  // We need to get the base product ID and merge with discount info
  const allDiscountProducts = [];
  for (let i = 1; i <= 5; i++) {
    allDiscountProducts.push(...getDiscountProductsForCategory(i.toString()));
  }

  const discountProduct = allDiscountProducts.find((p) => p.id === productId);

  if (discountProduct) {
    // We found a discounted version, now get the base product details
    for (const category of productDatabase.categories) {
      for (const subCategory of category.subCategories) {
        const baseProduct = subCategory.products.find(
          (p) => p.id === productId
        );
        if (baseProduct) {
          // Return merged product with discount information
          return {
            ...baseProduct,
            price: discountProduct.discountPrice, // Use discounted price
            originalPrice: discountProduct.originalPrice,
            category: category.name,
            subCategory: subCategory.name,
            name: discountProduct.name, // Use the discounted product name
          };
        }
      }
    }
  }

  return null;
}
// New helper function for sending reliable sequential messages
async function sendSequentialMessages(
  phoneNumber,
  message1,
  message2,
  delayMs = 5000
) {
  // Flag to track delivery in the customer's session
  let customer = await Customer.findOne({ phoneNumber });

  // Create a unique message tracking ID
  const messageTrackerId = `msg_${Date.now()}`;

  // First message
  try {
    console.log(`Sending first message with tracking ID ${messageTrackerId}`);
    await client.sendMessage(phoneNumber, message1);

    // Store in database that we've sent the first message
    if (customer) {
      if (!customer.contextData) customer.contextData = {};
      customer.contextData[messageTrackerId] = "first_sent";
      await customer.save();
    }

    // Debug log
    console.log(
      `First message sent successfully, waiting ${delayMs}ms before sending second`
    );

    // Set up a timer to send the second message after delay
    setTimeout(async () => {
      try {
        console.log(
          `Sending second message for tracking ID ${messageTrackerId}`
        );
        await client.sendMessage(phoneNumber, message2);

        // Update tracking status
        customer = await Customer.findOne({ phoneNumber });
        if (customer && customer.contextData) {
          customer.contextData[messageTrackerId] = "both_sent";
          await customer.save();

          // Clean up tracking data after another delay
          setTimeout(async () => {
            customer = await Customer.findOne({ phoneNumber });
            if (
              customer &&
              customer.contextData &&
              customer.contextData[messageTrackerId]
            ) {
              delete customer.contextData[messageTrackerId];
              await customer.save();
            }
          }, 10000);
        }

        console.log(
          `Second message sent successfully for tracking ID ${messageTrackerId}`
        );
      } catch (error) {
        console.error(`Error sending second message: ${error.message}`);
        // One more attempt with direct sendWhatsAppMessage
        try {
          await sendWhatsAppMessage(phoneNumber, message2);
        } catch (finalError) {
          console.error(`Final attempt failed: ${finalError.message}`);
        }
      }
    }, delayMs);
  } catch (error) {
    console.error(`Error sending first message: ${error.message}`);
    // Fallback to standard message sending
    await sendWhatsAppMessage(phoneNumber, message1);
    setTimeout(() => sendWhatsAppMessage(phoneNumber, message2), delayMs);
  }
}
// Helper function to find category by ID
function findCategoryById(categoryId) {
  return productDatabase.categories.find((cat) => cat.id === categoryId);
}

// Helper function to find subcategory by ID within a category
function findSubCategoryById(categoryId, subCategoryId) {
  const category = findCategoryById(categoryId);
  if (!category) return null;
  return category.subCategories.find((sub) => sub.id === subCategoryId);
}

// Generate and display QR code
client.on("qr", (qr) => {
  console.log("QR Code received, scan with WhatsApp:");
  qrcode.generate(qr, { small: true });
});

// Client ready event
client.on("ready", () => {
  console.log("WhatsApp client is ready!");
});

async function createOrder(customer, phoneNumber) {
  // Generate a unique order ID
  const orderId = "ORD" + Date.now().toString().slice(-8);

  // Calculate total with all applicable discounts
  const totalWithDiscounts =
    customer.cart.totalAmount +
    customer.cart.deliveryCharge -
    (customer.cart.firstOrderDiscount || 0) -
    (customer.cart.ecoDeliveryDiscount || 0);

  // Create the order
  const newOrder = {
    orderId: orderId,
    items: [...customer.cart.items],
    totalAmount: totalWithDiscounts,
    deliveryOption: customer.cart.deliveryOption,
    deliveryLocation: customer.cart.deliveryLocation,
    deliveryCharge: customer.cart.deliveryCharge,
    firstOrderDiscount: customer.cart.firstOrderDiscount || 0,
    ecoDeliveryDiscount: customer.cart.ecoDeliveryDiscount || 0,
    paymentStatus: "pending",
    status: "confirmed",
    paymentMethod: "Bank Transfer",
    transactionId: customer.contextData.transactionId || "Pending verification",
    orderDate: new Date(),
    deliveryDate: new Date(
      Date.now() +
        (customer.cart.deliveryOption === "Speed Delivery"
          ? 2
          : customer.cart.deliveryOption === "Normal Delivery"
          ? 5
          : customer.cart.deliveryOption === "Eco Delivery"
          ? 10
          : 5) *
          24 *
          60 *
          60 *
          1000
    ),
  };

  // Add order to customer's history
  customer.orderHistory.push(newOrder);

  // Handle pickup timing based on order total
  let pickupMessage = "";
  if (customer.cart.deliveryOption === "Self Pickup") {
    if (newOrder.totalAmount < 2000000) {
      pickupMessage =
        "Your order will be ready in:\n\n" +
        "if smaller than 2million straight away just come and picket up";
    } else if (newOrder.totalAmount > 25000000) {
      pickupMessage =
        "Your order will be ready in:\n\n" +
        "if order is larger then 25 million: in 1 hours time you can pickup";
    } else {
      pickupMessage =
        "Your order will be ready for pickup soon. We'll notify you when it's ready.";
    }
  }

  // Empty the cart
  customer.cart.items = [];
  customer.cart.totalAmount = 0;
  customer.cart.deliveryCharge = 0;
  customer.cart.firstOrderDiscount = 0;
  customer.cart.ecoDeliveryDiscount = 0;
  customer.cart.deliveryOption = "Normal Delivery";
  customer.cart.deliveryLocation = "";

  await customer.save();

  // Send pickup message if applicable
  if (pickupMessage && phoneNumber) {
    await sendWhatsAppMessage(phoneNumber, pickupMessage);
  }

  return orderId;
}
async function sendWhatsAppMessage(to, content) {
  try {
    console.log(
      `Attempting to send message to ${to}: "${content.substring(0, 50)}..."`
    );
    await client.sendMessage(to, content);
    console.log(`Successfully sent message to ${to}`);
  } catch (error) {
    console.error(`Error sending WhatsApp message to ${to}:`, error);
    // Try reconnecting the client if there's an authentication error
    if (
      error.message.includes("not authenticated") ||
      error.message.includes("connection closed")
    ) {
      console.log("Attempting to reinitialize the WhatsApp client...");
      client.initialize();
    }
  }
}
// Function to send an image with caption
async function sendImageWithCaption(to, imagePath, caption) {
  try {
    // Check if image exists
    if (!fs.existsSync(imagePath)) {
      console.error(`Image does not exist: ${imagePath}`);
      await sendWhatsAppMessage(to, caption); // Send just the caption if image doesn't exist
      return;
    }

    const media = MessageMedia.fromFilePath(imagePath);
    await client.sendMessage(to, media, { caption });
  } catch (error) {
    console.error("Error sending image:", error);
    // Fallback to sending just the text
    await sendWhatsAppMessage(to, caption);
  }
}

async function processChatMessage(phoneNumber, text, message) {
  try {
    // Handle "0" to return to main menu from anywhere
    const isMainMenuRequest = text === "0";

    // Fetch or create customer
    let customer = await Customer.findOne({ phoneNumber });

    // If this is a new customer
    if (!customer) {
      // Only trigger the bot if first message is "hi" (case insensitive)
      if (text.toLowerCase() !== "hi") {
        return; // Don't respond if first message isn't "hi"
      }

      customer = new Customer({
        phoneNumber,
        name: "Guest", // Temporary name
        conversationState: "greeting",
      });
      await customer.save();

      // Send welcome message
      await sendWhatsAppMessage(
        phoneNumber,
        "Hello! Welcome to Construction Materials Hub, your one-stop shop for construction materials. 😊 How can I assist you today?"
      );

      // Ask for name if first time
      await sendWhatsAppMessage(
        phoneNumber,
        "I see this is your first time contacting us, can I ask your name?"
      );

      // Save bot messages to chat history
      await customer.addToChatHistory(
        "Hello! Welcome to Construction Materials Hub, your one-stop shop for construction materials. 😊 How can I assist you today?",
        "bot"
      );
      await customer.addToChatHistory(
        "I see this is your first time contacting us, can I ask your name?",
        "bot"
      );

      return;
    }

    // Save customer message to chat history
    await customer.addToChatHistory(text, "customer");

    // If user wants to return to main menu
    if (isMainMenuRequest) {
      await sendMainMenu(phoneNumber, customer);
      return;
    }

    // Process based on conversation state
    switch (customer.conversationState) {
      // Add this to the greeting case
      case "greeting":
        // Save customer name
        customer.name = text;
        await customer.save();

        // Send personalized greeting and main menu
        await sendWhatsAppMessage(
          phoneNumber,
          `Hi ${text}, how can I assist you?`
        );

        await sendMainMenu(phoneNumber, customer);
        break;

        break;
      case "main_menu":
        // Process main menu selection
        switch (text) {
          case "1":
            // Explore materials for shopping
            await customer.updateConversationState("shopping_categories");
            await sendCategoriesList(phoneNumber, customer);
            break;

          case "2":
            // Check order history
            if (customer.orderHistory && customer.orderHistory.length > 0) {
              await customer.updateConversationState("order_history");
              const orderListMessage = generateOrderHistoryList(customer);
              await sendWhatsAppMessage(phoneNumber, orderListMessage);
            } else {
              await sendWhatsAppMessage(
                phoneNumber,
                "You don't have any order history yet. Start shopping to create your first order!"
              );
              await sendMainMenu(phoneNumber, customer);
            }
            break;

          // Add this to the switch statement in processChatMessage function to handle discount selection
          // In the main menu "case 3" section - simplify this to just set up initial state

          // In the main menu handler for "case 3"
          case "3":
            // Only set up the initial state and send the categories menu
            await customer.updateConversationState("discounts");

            // Send welcome message for discounts
            await sendWhatsAppMessage(
              phoneNumber,
              "First Order: 10% off your first order on anything that is not discounted\n"
            );

            // Send the discount categories menu
            await sendWhatsAppMessage(
              phoneNumber,
              "🎁 *Available Discounts* 🎁\n\n" +
                "Please select a discount category:\n\n" +
                "1. General\n" +
                "2. For your referral\n" +
                "3. As forman for your referral\n" +
                "4. As forman\n" +
                "5. Only for you\n\n" +
                "Type 0 to return to main menu."
            );
            break;
          case "4":
            // Learn about referral program - update state and immediately process
            await customer.updateConversationState("referral");
            // Then immediately process the state
            await processChatMessage(phoneNumber, "", message);
            break;
          case "5":
            // Support
            await customer.updateConversationState("support");
            await sendWhatsAppMessage(
              phoneNumber,
              "📞 *Customer Support* 📞\n\n" +
                "How can we assist you today?\n\n" +
                "1. Delivery Issues\n" +
                "2. Product Questions\n" +
                "3. Payment Problems\n" +
                "4. Speak to an Agent\n" +
                "5. Submit a Complaint\n\n" +
                "Type 0 to return to main menu."
            );
            break;

          case "6":
            // My profile
            await customer.updateConversationState("profile");

            let updatedProfileMessage =
              `👤 *Your Profile* 👤\n\n` +
              `Name: ${customer.name}\n` +
              `📱 Master Number: ${cleanPhoneNumber(
                customer.phoneNumber?.[0] || ""
              )}\n`;

            if (customer.phoneNumber.length > 1) {
              updatedProfileMessage += `🔗 Connected Numbers:\n`;
              customer.phoneNumber.slice(1).forEach((num, index) => {
                updatedProfileMessage += `   ${index + 1}. ${cleanPhoneNumber(
                  num
                )}\n`;
              });
            }

            updatedProfileMessage +=
              `Email: ${customer.contextData?.email || "Not provided"}\n\n` +
              `Total Orders: ${customer.orderHistory.length}\n` +
              `Referral Code: ${
                customer.referralCode ||
                "CM" + customer._id.toString().substring(0, 6)
              }\n\n` +
              `What would you like to do?\n\n` +
              `1. Update Name\n` +
              `2. Update Email\n` +
              `3. Manage Addresses\n` +
              `4. My Account 💰\n` +
              `5. Return to Main Menu`;

            await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);

            break;

          case "7":
            // Go to cart
            await goToCart(phoneNumber, customer);
            break;

          default:
            // Handle invalid input
            await sendWhatsAppMessage(
              phoneNumber,
              "I didn't understand that choice. Please select a number from the menu or type 0 to see the main menu again."
            );
            break;
        }
        break;

      case "shopping_categories":
        // Process category selection
        const categoryIndex = parseInt(text) - 1;
        if (
          categoryIndex >= 0 &&
          categoryIndex < productDatabase.categories.length
        ) {
          const selectedCategory = productDatabase.categories[categoryIndex];
          customer.contextData = {
            ...customer.contextData,
            categoryId: selectedCategory.id,
            categoryName: selectedCategory.name,
          };
          await customer.save();

          await customer.updateConversationState("shopping_subcategories");
          await sendSubcategoriesList(phoneNumber, customer, selectedCategory);
        } else if (text.toLowerCase() === "view cart") {
          await goToCart(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid category number from the list, type 'view cart' to see your cart, or type 0 to return to the main menu."
          );
        }
        break;

      case "shopping_subcategories":
        const category = findCategoryById(customer.contextData.categoryId);
        if (!category) {
          await sendWhatsAppMessage(
            phoneNumber,
            "Something went wrong. Let's start over."
          );
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        const subcategoryIndex = parseInt(text) - 1;
        if (
          subcategoryIndex >= 0 &&
          subcategoryIndex < category.subCategories.length
        ) {
          const selectedSubcategory = category.subCategories[subcategoryIndex];
          customer.contextData = {
            ...customer.contextData,
            subCategoryId: selectedSubcategory.id,
            subCategoryName: selectedSubcategory.name,
          };
          await customer.save();

          await customer.updateConversationState("product_list");
          await sendProductsList(phoneNumber, customer, selectedSubcategory);
        } else if (text.toLowerCase() === "view cart") {
          await goToCart(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid subcategory number from the list, type 'view cart' to see your cart, or type 0 to return to the main menu."
          );
        }
        break;

      case "product_list":
        const subCategory = findSubCategoryById(
          customer.contextData.categoryId,
          customer.contextData.subCategoryId
        );

        if (!subCategory) {
          await sendWhatsAppMessage(
            phoneNumber,
            "Something went wrong. Let's start over."
          );
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        // Handle product selection - simple numbering from 1 to N
        const productIndex = parseInt(text) - 1;
        if (productIndex >= 0 && productIndex < subCategory.products.length) {
          const selectedProduct = subCategory.products[productIndex];
          customer.contextData = {
            ...customer.contextData,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
          };
          await customer.save();

          await customer.updateConversationState("product_details");
          await sendProductDetails(phoneNumber, customer, selectedProduct);
        } else if (text.toLowerCase() === "view cart") {
          await goToCart(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid product number from the list, type 'view cart' to see your cart, or type 0 to return to the main menu."
          );
        }
        break;
      case "product_details":
        // Handle buy options
        if (text === "1") {
          // Yes, add to cart
          await customer.updateConversationState("select_weight");

          const product = findProductById(customer.contextData.productId);
          if (!product) {
            await sendWhatsAppMessage(
              phoneNumber,
              "Product not found. Let's return to the main menu."
            );
            await sendMainMenu(phoneNumber, customer);
            break;
          }
          // In the "product_details" case when user selects option "1" (Yes, add to cart)
          let weightMessage = "Please select the weight option:\n\n";
          product.weights.forEach((weight, index) => {
            // Calculate price for this weight option (assuming base price is for smallest weight)
            // For simplicity, let's say larger weights cost proportionally more
            let weightPrice = product.price;
            if (weight.includes("5kg")) {
              weightPrice = product.price * 4.5; // 5kg costs 4.5 times more than 1kg
            } else if (weight.includes("10kg")) {
              weightPrice = product.price * 9; // 10kg costs 9 times more than 1kg
            } else if (weight.includes("50kg") || weight.includes("500g")) {
              weightPrice = product.price * 0.5; // Half kg costs half the price
            } else if (weight.includes("100kg") || weight.includes("100g")) {
              weightPrice = product.price * 0.2; // 100g costs 20% of the base price
            }

            weightMessage += `${index + 1}- ${weight} - ${formatRupiah(
              weightPrice
            )}\n`;
          });

          await sendWhatsAppMessage(phoneNumber, weightMessage);
        } else if (text === "2") {
          // No, return to category list
          await customer.updateConversationState("shopping_subcategories");
          const category = findCategoryById(customer.contextData.categoryId);
          await sendSubcategoriesList(phoneNumber, customer, category);
        } else if (text === "3") {
          // Return to main shopping list
          await customer.updateConversationState("shopping_categories");
          await sendCategoriesList(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid option (1, 2, or 3), or type 0 to return to the main menu."
          );
        }
        break;

      case "select_weight":
        const productForWeight = findProductById(
          customer.contextData.productId
        );
        if (!productForWeight) {
          await sendWhatsAppMessage(
            phoneNumber,
            "Product not found. Let's return to the main menu."
          );
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        const weightIndex = parseInt(text) - 1;
        if (weightIndex >= 0 && weightIndex < productForWeight.weights.length) {
          // Save selected weight
          customer.contextData.selectedWeight =
            productForWeight.weights[weightIndex];
          await customer.save();

          // Send confirmation message about the weight they've chosen
          await sendWhatsAppMessage(
            phoneNumber,
            `You have chosen ${productForWeight.weights[weightIndex]}. Great choice!`
          );

          // Small delay before asking for quantity
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Ask for quantity
          await customer.updateConversationState("select_quantity");
          await sendWhatsAppMessage(
            phoneNumber,
            "How many bags would you like to order? Enter only in digits."
          );
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            `Please select a valid weight option (1 to ${productForWeight.weights.length}), or type 0 to return to the main menu.`
          );
        }
        break;

      case "select_quantity":
        const quantity = parseInt(text);
        if (!isNaN(quantity) && quantity > 0) {
          // Save quantity
          customer.contextData.quantity = quantity;
          await customer.save();

          // Add to cart
          const product = findProductById(customer.contextData.productId);
          if (!product) {
            await sendWhatsAppMessage(
              phoneNumber,
              "Product not found. Let's return to the main menu."
            );
            await sendMainMenu(phoneNumber, customer);
            break;
          }

          // Calculate weight-specific price
          let weightPrice = product.price;
          const selectedWeight = customer.contextData.selectedWeight;

          // Apply price adjustment based on weight
          if (selectedWeight.includes("5kg")) {
            weightPrice = product.price * 4.5; // 5kg costs 4.5 times more than 1kg
          } else if (selectedWeight.includes("10kg")) {
            weightPrice = product.price * 9; // 10kg costs 9 times more than 1kg
          } else if (
            selectedWeight.includes("50kg") ||
            selectedWeight.includes("500g")
          ) {
            weightPrice = product.price * 0.5; // Half kg costs half the price
          } else if (selectedWeight.includes("100g")) {
            weightPrice = product.price * 0.2; // 100g costs 20% of the base price
          }

          // Calculate total price for this item using the weight-specific price
          const totalPrice = weightPrice * quantity;

          // Actually add to cart using the method defined in the customer model
          await customer.cart.items.push({
            productId: product.id,
            productName: product.name,
            category: customer.contextData.categoryName,
            subCategory: customer.contextData.subCategoryName,
            weight: customer.contextData.selectedWeight,
            quantity: quantity,
            price: weightPrice, // Store the weight-specific price, not the base price
            totalPrice: totalPrice,
            imageUrl: product.imageUrl,
          });

          // Update cart total
          customer.cart.totalAmount = customer.cart.items.reduce(
            (total, item) => total + item.totalPrice,
            0
          );
          await customer.save();

          // Confirm addition to cart
          await customer.updateConversationState("post_add_to_cart");
          const message = `added to your cart:
${product.name}
${quantity} bags (${customer.contextData.selectedWeight}) 
for ${formatRupiah(totalPrice)}`;

          await sendWhatsAppMessage(phoneNumber, message);
          // In the post_add_to_cart case, update the second sendWhatsAppMessage call
          await sendWhatsAppMessage(
            phoneNumber,
            "\n\nWhat do you want to do next?\n\n1- View cart\n2- Proceed to pay\n3- I want to shop more (Return to shopping list)\n0- Return to main menu"
          );
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please enter a valid quantity as a positive number, or type 0 to return to the main menu."
          );
        }
        break;
      case "post_add_to_cart":
        switch (text) {
          case "1":
            // View cart
            await goToCart(phoneNumber, customer);
            break;

          case "2":
            // Proceed to payment
            await proceedToCheckout(phoneNumber, customer);
            break;

          case "3":
            // Return to shopping list
            await customer.updateConversationState("shopping_categories");
            await sendCategoriesList(phoneNumber, customer);
            break;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid option (1, 2, or 3), or type 0 to return to the main menu."
            );
            break;
        }
        break;

      case "cart_view":
        // Handle cart actions
        switch (text.toLowerCase()) {
          case "delete an item":
            if (customer.cart.items.length === 0) {
              await sendWhatsAppMessage(
                phoneNumber,
                "Your cart is already empty."
              );
              await sendMainMenu(phoneNumber, customer);
            } else {
              await customer.updateConversationState("cart_delete_item");
              let deleteMessage =
                "Which item would you like to remove from your cart?\n\n";
              customer.cart.items.forEach((item, index) => {
                deleteMessage += `${index + 1}. ${item.productName} (${
                  item.weight
                }) - ${item.quantity} units - ${item.totalPrice}\n`;
              });
              deleteMessage +=
                "\nEnter the number of the item you want to delete.";

              await sendWhatsAppMessage(phoneNumber, deleteMessage);
            }
            break;

          case "empty my cart fully":
            await customer.updateConversationState("cart_confirm_empty");
            await sendWhatsAppMessage(
              phoneNumber,
              "Are you sure you want to empty your cart?\n\n1. Yes, empty my cart\n2. No, keep my items"
            );
            break;

          case "proceed to payment":
          case "checkout":
            await proceedToCheckout(phoneNumber, customer);
            break;

          case "go back to menu":
            await sendMainMenu(phoneNumber, customer);
            break;

          case "view product details":
            if (customer.cart.items.length === 0) {
              await sendWhatsAppMessage(
                phoneNumber,
                "Your cart is empty. There are no product details to view."
              );
              await goToCart(phoneNumber, customer);
            } else {
              await customer.updateConversationState("cart_view_details");
              let detailsMessage =
                "Which product details would you like to view?\n\n";
              customer.cart.items.forEach((item, index) => {
                detailsMessage += `${index + 1}. ${item.productName} (${
                  item.weight
                })\n`;
              });

              await sendWhatsAppMessage(phoneNumber, detailsMessage);
            }
            break;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid option from the cart menu, or type 0 to return to the main menu."
            );
            break;
        }
        break;

      case "cart_delete_item":
        const itemIndex = parseInt(text) - 1;
        if (itemIndex >= 0 && itemIndex < customer.cart.items.length) {
          // Get the item to delete for the confirmation message
          const itemToDelete = customer.cart.items[itemIndex];

          // Remove the item
          customer.cart.items.splice(itemIndex, 1);

          // Recalculate cart total
          customer.cart.totalAmount = customer.cart.items.reduce(
            (total, item) => total + item.totalPrice,
            0
          );
          await customer.save();

          // Confirm deletion
          await sendWhatsAppMessage(
            phoneNumber,
            `Removed ${itemToDelete.productName} (${itemToDelete.weight}) from your cart.`
          );

          // Return to cart view
          await goToCart(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid item number, or type 0 to return to the main menu."
          );
        }
        break;

      case "cart_confirm_empty":
        if (text === "1") {
          // Empty the cart
          customer.cart.items = [];
          customer.cart.totalAmount = 0;
          await customer.save();

          await sendWhatsAppMessage(phoneNumber, "Your cart has been emptied.");
          await sendMainMenu(phoneNumber, customer);
        } else if (text === "2") {
          // Keep items
          await sendWhatsAppMessage(
            phoneNumber,
            "Your cart items have been kept."
          );
          await goToCart(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid option (1 or 2), or type 0 to return to the main menu."
          );
        }
        break;

      case "cart_view_details":
        const detailsIndex = parseInt(text) - 1;
        if (detailsIndex >= 0 && detailsIndex < customer.cart.items.length) {
          const item = customer.cart.items[detailsIndex];
          const product = findProductById(item.productId);

          if (product) {
            // Send product details
            await sendProductDetails(phoneNumber, customer, product, false);

            // After showing details, return to cart
            setTimeout(async () => {
              await goToCart(phoneNumber, customer);
            }, 2000);
          } else {
            await sendWhatsAppMessage(
              phoneNumber,
              "Product details not found. Returning to cart."
            );
            await goToCart(phoneNumber, customer);
          }
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid item number, or type 0 to return to the main menu."
          );
        }
        break;

      case "checkout_delivery":
        // Handle delivery option selection
        if (["1", "2", "3", "4", "5"].includes(text)) {
          const deliveryOptions = {
            1: "Normal Delivery",
            2: "Speed Delivery",
            3: "Early Morning Delivery",
            4: "Eco Delivery",
            5: "Self Pickup",
          };

          const deliveryCharges = {
            1: 0,
            2: 50,
            3: 50,
            4: 0, // Eco delivery - no charge but has discount instead
            5: 0, // Self pickup - no charge
          };

          // Save delivery option
          customer.cart.deliveryOption = deliveryOptions[text];
          customer.cart.deliveryCharge = deliveryCharges[text];
          await customer.save();

          // Confirm delivery option
          if (text === "2" || text === "3") {
            await sendWhatsAppMessage(
              phoneNumber,
              `You've chosen ${deliveryOptions[text]}. A ${deliveryCharges[text]} charge will be added to your total.`
            );
          } else if (text === "4") {
            await sendWhatsAppMessage(
              phoneNumber,
              `You've chosen ${deliveryOptions[text]}. A 5% discount will be applied to your total bill! Your order will be delivered in 8-10 days.`
            );
          }

          // If self-pickup, skip location selection
          if (text === "5") {
            await customer.updateConversationState("checkout_summary");
            await sendOrderSummary(phoneNumber, customer);
          } else {
            // Ask for delivery location, with option for saved addresses if available
            await customer.updateConversationState("checkout_location");

            if (customer.addresses && customer.addresses.length > 0) {
              // Customer has saved addresses, offer them as an option
              await sendWhatsAppMessage(
                phoneNumber,
                "Select a drop off location or use a saved address:\n\n" +
                  "These areas will be free of charge under normal delivery:\n\n" +
                  "1- seminyak\n" +
                  "2- legian\n" +
                  "3- sannur\n" +
                  "4- ubud (extra charge apply 200k)\n\n" +
                  "Type 'saved' to use one of your saved addresses."
              );
            } else {
              // Customer has no saved addresses, show only location options
              await sendWhatsAppMessage(
                phoneNumber,
                "Select drop off location\n\nThese areas will be free or charge under normal delivery\n\n" +
                  "1- seminyak\n" +
                  "2- legian\n" +
                  "3- sannur\n" +
                  "4- ubud (extra charge apply 200k)"
              );
            }
          }
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid delivery option (1, 2, 3, 4, or 5), or type 0 to return to the main menu."
          );
        }
        break;
      // Modify the checkout_location case to include saved addresses option
      case "checkout_location":
        // First check if the customer has saved addresses
        if (customer.addresses && customer.addresses.length > 0) {
          // If they select to use a saved address - case insensitive
          if (text.toLowerCase() === "saved") {
            // Update state to select from saved addresses
            await customer.updateConversationState(
              "checkout_select_saved_address"
            );
            // Display the saved addresses for selection
            let addressMessage =
              "Please select one of your saved addresses:\n\n";

            customer.addresses.forEach((addr, index) => {
              const nickname = addr.nickname || "Address";
              const area = addr.area ? ` (${addr.area})` : "";
              const fullAddress = addr.fullAddress || "No detail address";

              addressMessage += `${
                index + 1
              }. ${nickname}: ${fullAddress}${area}\n`;
            });

            addressMessage +=
              "\nType the number of the address you want to use.";
            await sendWhatsAppMessage(phoneNumber, addressMessage);
            return;
          }

          // If they choose to enter a new address but select a predefined area
          if (["1", "2", "3", "4"].includes(text)) {
            const locations = {
              1: "seminyak",
              2: "legian",
              3: "sannur",
              4: "ubud",
            };

            const extraCharges = {
              1: 0,
              2: 0,
              3: 0,
              4: 200,
            };

            // Save location and add any extra charges
            customer.cart.deliveryLocation = locations[text];
            customer.cart.deliveryCharge += extraCharges[text];
            await customer.save();

            // Confirmation message
            await sendWhatsAppMessage(
              phoneNumber,
              `You selected ${locations[text]}\n` +
                (extraCharges[text] > 0
                  ? `Additional charge of ${extraCharges[text]} will be applied.`
                  : "The area will be free of charge under normal delivery.")
            );

            // Ask for Google Map location
            await customer.updateConversationState("checkout_map_location");
            await sendWhatsAppMessage(
              phoneNumber,
              "Enter Google Map location link for precise delivery."
            );
          } else {
            // Invalid selection, show options again with saved addresses option
            await sendWhatsAppMessage(
              phoneNumber,
              "Select a drop off location or use a saved address:\n\n" +
                "These areas will be free of charge under normal delivery:\n\n" +
                "1- seminyak\n" +
                "2- legian\n" +
                "3- sannur\n" +
                "4- ubud (extra charge apply 200k)\n\n" +
                "Type 'saved' to use one of your saved addresses."
            );
          }
        } else {
          // Regular flow for customers without saved addresses
          if (["1", "2", "3", "4"].includes(text)) {
            const locations = {
              1: "seminyak",
              2: "legian",
              3: "sannur",
              4: "ubud",
            };

            const extraCharges = {
              1: 0,
              2: 0,
              3: 0,
              4: 200,
            };

            // Save location and add any extra charges
            customer.cart.deliveryLocation = locations[text];
            customer.cart.deliveryCharge += extraCharges[text];
            await customer.save();

            // Confirmation message
            await sendWhatsAppMessage(
              phoneNumber,
              `You selected ${locations[text]}\n` +
                (extraCharges[text] > 0
                  ? `Additional charge of ${extraCharges[text]} will be applied.`
                  : "The area will be free of charge under normal delivery.")
            );

            // Ask for Google Map location
            await customer.updateConversationState("checkout_map_location");
            await sendWhatsAppMessage(
              phoneNumber,
              "Enter Google Map location link for precise delivery."
            );
          } else {
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid location (1, 2, 3, or 4), or type 0 to return to the main menu."
            );
          }
        }
        break;

      case "checkout_select_saved_address":
        // Parse the selected address index
        const addressIndex = parseInt(text) - 1;

        // Validate the selection
        if (
          isNaN(addressIndex) ||
          addressIndex < 0 ||
          !customer.addresses ||
          addressIndex >= customer.addresses.length
        ) {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid address number from the list or type 0 to return to the main menu."
          );
          return;
        }

        // Get the selected address
        const selectedAddress = customer.addresses[addressIndex];

        // Use the selected address details for delivery
        customer.cart.deliveryLocation =
          selectedAddress.area || "Not specified";

        // Add extra charges if area is "ubud"
        if (
          selectedAddress.area &&
          selectedAddress.area.toLowerCase() === "ubud"
        ) {
          customer.cart.deliveryCharge += 200;
          await sendWhatsAppMessage(
            phoneNumber,
            `Additional charge of ${formatRupiah(
              200
            )} will be applied for delivery to Ubud.`
          );
        }

        // Store address details in cart
        customer.cart.deliveryAddress = {
          nickname: selectedAddress.nickname || "Saved Address",
          area: selectedAddress.area || "Not specified",
          googleMapLink: selectedAddress.googleMapLink || "",
        };

        await customer.save();

        // Confirm the address selection
        await sendWhatsAppMessage(
          phoneNumber,
          `You've selected the address: ${
            selectedAddress.nickname || "Saved Address"
          }\n` + `Area: ${selectedAddress.area || "Not specified"}`
        );

        // Show delivery charges
        let deliveryMessage = `Your delivery charges will be ${formatRupiah(
          customer.cart.deliveryCharge
        )}`;
        if (
          customer.cart.deliveryOption !== "Normal Delivery" &&
          customer.cart.deliveryOption !== "Self Pickup"
        ) {
          deliveryMessage += ` (including ${customer.cart.deliveryOption} fee)`;
        }

        await sendWhatsAppMessage(phoneNumber, deliveryMessage);

        // Proceed directly to order summary
        await customer.updateConversationState("checkout_summary");
        await sendOrderSummary(phoneNumber, customer);
        break;
      case "checkout_map_location":
        // Save Google Map location (no validation here for simplicity)
        customer.contextData.locationDetails = text;
        await customer.save();

        // Proceed to order summary
        await customer.updateConversationState("checkout_summary");
        await sendOrderSummary(phoneNumber, customer);
        break;

      case "checkout_summary":
        // Handle payment confirmation
        switch (text) {
          case "1":
            // Yes, proceed to payment
            await customer.updateConversationState("checkout_name");
            await sendWhatsAppMessage(
              phoneNumber,
              "what is the full name of the account you are paying from?"
            );
            break;

          case "2":
            // Modify order
            await goToCart(phoneNumber, customer);
            break;

          case "3":
            // Come back later
            await sendWhatsAppMessage(
              phoneNumber,
              "Your cart has been saved. You can return anytime to complete your purchase."
            );
            await sendMainMenu(phoneNumber, customer);
            break;

          case "4":
            // Cancel process and empty cart
            customer.cart.items = [];
            customer.cart.totalAmount = 0;
            customer.cart.deliveryCharge = 0;
            await customer.save();

            await sendWhatsAppMessage(
              phoneNumber,
              "Your order has been cancelled and your cart has been emptied."
            );
            await sendMainMenu(phoneNumber, customer);
            break;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid option (1, 2, 3, or 4), or type 0 to return to the main menu."
            );
            break;
        }
        break;

      case "checkout_name":
        // Save customer name for order
        customer.contextData.fullName = text;
        await customer.save();

        // Send informational message about email instead of asking for it
        await sendWhatsAppMessage(
          phoneNumber,
          "If you want to have always invoice from us, please go to your profile and give us your email, and your name that is provided by the bank you normally send transaction from."
        );

        // Small delay before proceeding to payment instructions
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check if this is the customer's first order and apply discount
        let firstOrderDiscount = 0;
        if (!customer.orderHistory || customer.orderHistory.length === 0) {
          // Calculate 10% discount on non-discounted items
          const regularItems = customer.cart.items.filter(
            (item) => !item.isDiscounted
          );
          const regularItemsTotal = regularItems.reduce(
            (total, item) => total + item.totalPrice,
            0
          );
          firstOrderDiscount = Math.round(regularItemsTotal * 0.1); // 10% of regular items

          if (firstOrderDiscount > 0) {
            message += `First Order Discount (10%): -${formatRupiah(
              firstOrderDiscount
            )}\n`;
          }
        }

        // Check for eco delivery discount
        let ecoDeliveryDiscount = 0;
        if (customer.cart.deliveryOption === "Eco Delivery") {
          ecoDeliveryDiscount = Math.round(customer.cart.totalAmount * 0.05);
        }

        // Store the discounts for use in checkout
        customer.cart.firstOrderDiscount = firstOrderDiscount;
        customer.cart.ecoDeliveryDiscount = ecoDeliveryDiscount;
        await customer.save();

        const finalTotal =
          customer.cart.totalAmount +
          customer.cart.deliveryCharge -
          firstOrderDiscount -
          ecoDeliveryDiscount;

        // Skip the email input step and go directly to payment
        await customer.updateConversationState("checkout_payment");
        const paymentMessage =
          `Transfer ${formatRupiah(
            finalTotal
          )} to this bank account and share screenshot and transaction id with us\n\n` +
          `Bank name: Construction Bank\n` +
          `Account#: 1234-5678-9012-3456\n\n` +
          `Type "Support" if you are having any trouble regarding payment and our team will help you`;

        await sendWhatsAppMessage(phoneNumber, paymentMessage);
        break;
      // Simplified checkout_payment case with a single bank list message
      case "checkout_payment":
        if (text.toLowerCase() === "support") {
          // Handle support request
          await customer.updateConversationState("payment_support");
          await sendWhatsAppMessage(
            phoneNumber,
            "Our payment support team has been notified and will contact you shortly. Alternatively, you can call us at 123-456-7890 for immediate assistance."
          );

          // Return to payment screen after a delay
          setTimeout(async () => {
            await customer.updateConversationState("checkout_payment");
            await sendWhatsAppMessage(
              phoneNumber,
              "If you're ready to continue with payment, please share a screenshot of your payment and transaction ID."
            );
          }, 5000);
        } else {
          // Assume they've shared payment info (screenshot or transaction ID)
          await customer.updateConversationState("checkout_payment_bank");

          // Send the entire bank list in a single message
          const bankListMessage =
            "*Which bank have you transferred from?*\n\n" +
            "Please enter the bank number (code) from the list below:\n\n" +
            "2 - Bank Rakyat Indonesia (BRI)\n" +
            "3 - Bank Ekspor Indonesia\n" +
            "8 - Bank Mandiri\n" +
            "9 - Bank Negara Indonesia (BNI)\n" +
            "11 - Bank Danamon Indonesia\n" +
            "13 - Bank Permata\n" +
            "14 - Bank Central Asia (BCA)\n" +
            "16 - Bank Maybank\n" +
            "19 - Bank Panin\n" +
            "20 - Bank Arta Niaga Kencana\n" +
            "22 - Bank CIMB Niaga\n" +
            "23 - Bank UOB Indonesia\n" +
            "26 - Bank Lippo\n" +
            "28 - Bank OCBC NISP\n" +
            "30 - American Express Bank LTD\n" +
            "31 - Citibank\n" +
            "32 - JP. Morgan Chase Bank, N.A\n" +
            "33 - Bank of America, N.A\n" +
            "36 - Bank Multicor\n" +
            "37 - Bank Artha Graha\n" +
            "47 - Bank Pesona Perdania\n" +
            "52 - Bank ABN Amro\n" +
            "53 - Bank Keppel Tatlee Buana\n" +
            "57 - Bank BNP Paribas Indonesia\n" +
            "68 - Bank Woori Indonesia\n" +
            "76 - Bank Bumi Arta\n" +
            "87 - Bank Ekonomi\n" +
            "89 - Bank Haga\n" +
            "93 - Bank IFI\n" +
            "95 - Bank Century/Bank J Trust Indonesia\n" +
            "97 - Bank Mayapada\n" +
            "110 - Bank BJB\n" +
            "111 - Bank DKI\n" +
            "112 - Bank BPD D.I.Y\n" +
            "113 - Bank Jateng\n" +
            "114 - Bank Jatim\n" +
            "115 - Bank Jambi\n" +
            "116 - Bank Aceh\n" +
            "117 - Bank Sumut\n" +
            "118 - Bank Sumbar\n" +
            "119 - Bank Kepri\n" +
            "120 - Bank Sumsel dan Babel\n" +
            "121 - Bank Lampung\n" +
            "122 - Bank Kalsel\n" +
            "123 - Bank Kalbar\n" +
            "124 - Bank Kaltim\n" +
            "125 - Bank Kalteng\n" +
            "126 - Bank Sulsel\n" +
            "127 - Bank Sulut\n" +
            "128 - Bank NTB\n" +
            "129 - Bank Bali\n" +
            "130 - Bank NTT\n" +
            "131 - Bank Maluku\n" +
            "132 - Bank Papua\n" +
            "133 - Bank Bengkulu\n" +
            "134 - Bank Sulteng\n" +
            "135 - Bank Sultra\n" +
            "137 - Bank Banten\n" +
            "145 - Bank Nusantara Parahyangan\n" +
            "146 - Bank Swadesi\n" +
            "147 - Bank Muamalat\n" +
            "151 - Bank Mestika\n" +
            "152 - Bank Metro Express\n" +
            "157 - Bank Maspion\n" +
            "159 - Bank Hagakita\n" +
            "161 - Bank Ganesha\n" +
            "162 - Bank Windu Kentjana\n" +
            "164 - Bank ICBC Indonesia\n" +
            "166 - Bank Harmoni Internasional\n" +
            "167 - Bank QNB\n" +
            "200 - Bank Tabungan Negara (BTN)\n" +
            "405 - Bank Swaguna\n" +
            "425 - Bank BJB Syariah\n" +
            "426 - Bank Mega\n" +
            "441 - Bank Bukopin\n" +
            "451 - Bank Syariah Indonesia (BSI)\n" +
            "459 - Bank Bisnis Internasional\n" +
            "466 - Bank Sri Partha\n" +
            "484 - Bank KEB Hana Indonesia\n" +
            "485 - Bank MNC Internasional\n" +
            "490 - Bank Neo\n" +
            "494 - Bank BNI Agro\n" +
            "503 - Bank Nobu\n" +
            "506 - Bank Mega Syariah\n" +
            "513 - Bank Ina Perdana\n" +
            "517 - Bank Panin Dubai Syariah\n" +
            "521 - Bank Bukopin Syariah\n" +
            "523 - Bank Sahabat Sampoerna\n" +
            "535 - SeaBank\n" +
            "536 - Bank BCA Syariah\n" +
            "542 - Bank Jago\n" +
            "547 - Bank BTPN Syariah\n" +
            "553 - Bank Mayora\n" +
            "555 - Bank Index Selindo\n" +
            "947 - Bank Aladin Syariah";

          // Send the bank list
          await sendWhatsAppMessage(phoneNumber, bankListMessage);

          // Send the instruction as a separate message
          setTimeout(async () => {
            await sendWhatsAppMessage(
              phoneNumber,
              "Enter '1' for other banks not on the list.\nPlease enter the bank number (code) from the list above."
            );
          }, 1000);
        }
        break;
      // Also update the validBankCodes map in the checkout_payment_bank case for completeness:
      case "checkout_payment_bank":
        // Create a map of valid bank codes
        const validBankCodes = {
          1: "Other Bank", // Special case for "Other"
          2: "Bank Rakyat Indonesia (BRI)",
          3: "Bank Ekspor Indonesia",
          8: "Bank Mandiri",
          9: "Bank Negara Indonesia (BNI)",
          11: "Bank Danamon Indonesia",
          13: "Bank Permata",
          14: "Bank Central Asia (BCA)",
          16: "Bank Maybank",
          19: "Bank Panin",
          20: "Bank Arta Niaga Kencana",
          22: "Bank CIMB Niaga",
          23: "Bank UOB Indonesia",
          26: "Bank Lippo",
          28: "Bank OCBC NISP",
          30: "American Express Bank LTD",
          31: "Citibank",
          32: "JP. Morgan Chase Bank, N.A",
          33: "Bank of America, N.A",
          36: "Bank Multicor",
          37: "Bank Artha Graha",
          47: "Bank Pesona Perdania",
          52: "Bank ABN Amro",
          53: "Bank Keppel Tatlee Buana",
          57: "Bank BNP Paribas Indonesia",
          68: "Bank Woori Indonesia",
          76: "Bank Bumi Arta",
          87: "Bank Ekonomi",
          89: "Bank Haga",
          93: "Bank IFI",
          95: "Bank Century/Bank J Trust Indonesia",
          97: "Bank Mayapada",
          110: "Bank BJB",
          111: "Bank DKI",
          112: "Bank BPD D.I.Y",
          113: "Bank Jateng",
          114: "Bank Jatim",
          115: "Bank Jambi",
          116: "Bank Aceh",
          117: "Bank Sumut",
          118: "Bank Sumbar",
          119: "Bank Kepri",
          120: "Bank Sumsel dan Babel",
          121: "Bank Lampung",
          122: "Bank Kalsel",
          123: "Bank Kalbar",
          124: "Bank Kaltim",
          125: "Bank Kalteng",
          126: "Bank Sulsel",
          127: "Bank Sulut",
          128: "Bank NTB",
          129: "Bank Bali",
          130: "Bank NTT",
          131: "Bank Maluku",
          132: "Bank Papua",
          133: "Bank Bengkulu",
          134: "Bank Sulteng",
          135: "Bank Sultra",
          137: "Bank Banten",
          145: "Bank Nusantara Parahyangan",
          146: "Bank Swadesi",
          147: "Bank Muamalat",
          151: "Bank Mestika",
          152: "Bank Metro Express",
          157: "Bank Maspion",
          159: "Bank Hagakita",
          161: "Bank Ganesha",
          162: "Bank Windu Kentjana",
          164: "Bank ICBC Indonesia",
          166: "Bank Harmoni Internasional",
          167: "Bank QNB",
          200: "Bank Tabungan Negara (BTN)",
          405: "Bank Swaguna",
          425: "Bank BJB Syariah",
          426: "Bank Mega",
          441: "Bank Bukopin",
          451: "Bank Syariah Indonesia (BSI)",
          459: "Bank Bisnis Internasional",
          466: "Bank Sri Partha",
          484: "Bank KEB Hana Indonesia",
          485: "Bank MNC Internasional",
          490: "Bank Neo",
          494: "Bank BNI Agro",
          503: "Bank Nobu",
          506: "Bank Mega Syariah",
          513: "Bank Ina Perdana",
          517: "Bank Panin Dubai Syariah",
          521: "Bank Bukopin Syariah",
          523: "Bank Sahabat Sampoerna",
          535: "SeaBank",
          536: "Bank BCA Syariah",
          542: "Bank Jago",
          547: "Bank BTPN Syariah",
          553: "Bank Mayora",
          555: "Bank Index Selindo",
          947: "Bank Aladin Syariah",
        };

        // Check if the input is a valid bank code
        if (validBankCodes[text]) {
          // If the user selected "1" for "Others"
          if (text === "1") {
            await customer.updateConversationState(
              "checkout_payment_bank_other"
            );
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter the name of your bank:"
            );
            break;
          }

          // Valid bank code - save bank information
          const bankName = validBankCodes[text];
          customer.contextData.bankName = bankName;
          await customer.save();

          // Confirm selection and proceed with order creation
          await sendWhatsAppMessage(
            phoneNumber,
            `You selected: ${bankName} (Code: ${text}). Processing your order...`
          );

          // Create the order
          const orderId = await createOrder(customer);

          // Confirmation message
          await customer.updateConversationState("order_confirmation");
          await sendWhatsAppMessage(
            phoneNumber,
            "Your payment will be confirmed within 30 min\n" +
              "Please call us or come back in 30 minutes for the confirmation.\n\n" +
              `Your order id is #${orderId}. Keep it safe please, ${customer.name}.`
          );

          // Send final thank you message
          setTimeout(async () => {
            await sendWhatsAppMessage(
              phoneNumber,
              "Thank you for shopping with us! Don't forget to share your referral link and check out our discounts for more savings. Have a great day!"
            );

            // Reset state to main menu
            await sendMainMenu(phoneNumber, customer);
          }, 3000);
        } else {
          // Invalid input - ask again
          await sendWhatsAppMessage(
            phoneNumber,
            "Please enter a valid bank number from the list, or enter 1 for other banks not on the list."
          );
        }
        break;

      case "checkout_payment_bank_other":
        // User has entered a custom bank name
        customer.contextData.bankName = text;
        await customer.save();

        // Confirm selection and proceed with order creation
        await sendWhatsAppMessage(
          phoneNumber,
          `You selected: ${text}. Processing your order...`
        );

        // Create the order
        const otherOrderId = await createOrder(customer);

        // Confirmation message
        await customer.updateConversationState("order_confirmation");
        await sendWhatsAppMessage(
          phoneNumber,
          "Your payment will be confirmed within 30 min\n" +
            "Please call us or come back in 30 minutes for the confirmation.\n\n" +
            `Your order id is #${otherOrderId}. Keep it safe please, ${customer.name}.`
        );

        // Send final thank you message
        setTimeout(async () => {
          await sendWhatsAppMessage(
            phoneNumber,
            "Thank you for shopping with us! Don't forget to share your referral link and check out our discounts for more savings. Have a great day!"
          );

          // Reset state to main menu
          await sendMainMenu(phoneNumber, customer);
        }, 3000);
        break;
      // Add to processChatMessage function - Update the case "support" section
      case "support":
        // Handle support main menu selection
        switch (text) {
          case "1":
            // Track my order
            await customer.updateConversationState("support_track_order");
            await sendWhatsAppMessage(
              phoneNumber,
              "Here are all of your orders\n\n" +
                customer.orderHistory
                  .map((order, index) => {
                    const status =
                      order.status === "delivered" ? "Delivered" : "Pending";
                    const date = new Date(order.orderDate).toLocaleDateString();
                    return `${index + 1}. Order #${
                      order.orderId
                    }: Rp.${Math.round(
                      order.totalAmount
                    ).toLocaleString()} (${status}) - placed on ${date}`;
                  })
                  .join("\n") +
                "\n\nPlease enter your order id number."
            );
            break;

          case "2":
            // Report an issue with my order
            await customer.updateConversationState("support_report_issue");
            await sendWhatsAppMessage(
              phoneNumber,
              "Here are all of your orders\n\n" +
                customer.orderHistory
                  .map((order, index) => {
                    const status =
                      order.status === "delivered" ? "Delivered" : "Pending";
                    const date = new Date(order.orderDate).toLocaleDateString();
                    return `${index + 1}. Order #${
                      order.orderId
                    }: Rp.${Math.round(
                      order.totalAmount
                    ).toLocaleString()} (${status}) - placed on ${date}`;
                  })
                  .join("\n") +
                "\n\nPlease enter your order id number."
            );
            break;

          case "3":
            // Speak with an agent
            await customer.updateConversationState("support_agent");
            await sendWhatsAppMessage(
              phoneNumber,
              "Our customer support team will contact you shortly. Is there anything specific you'd like assistance with?"
            );
            break;

          case "4":
            // Read about return, replace or refund policy
            await customer.updateConversationState("support_policy");
            await sendWhatsAppMessage(
              phoneNumber,
              "*Return & Refund Policy*\n\n" +
                "• All returns must be initiated within 3 days of delivery\n" +
                "• Damaged products must be reported with photos\n" +
                "• Refunds are processed within 5-7 business days\n" +
                "• Replacements are subject to product availability\n" +
                "• Custom orders cannot be returned or refunded\n\n" +
                "For further assistance, please select an option:\n\n" +
                "1. Track my order\n" +
                "2. Report an issue with my order\n" +
                "3. Speak with an agent\n" +
                "4. Return to main menu"
            );
            break;

          case "5":
            await customer.updateConversationState("support_complaint");
            await sendWhatsAppMessage(
              phoneNumber,
              "Please describe your complaint in detail.\n\nOnce done, type *Submit* to send it to our support team."
            );
            break;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid option (1-5) or type 0 to return to main menu."
            );
            break;
        }
        break;

      // Add these new case handlers for support submenus
      case "support_track_order":
        // Validate if input is an order ID
        const trackOrderId = text.trim();
        const orderToTrack = customer.orderHistory.find(
          (order) => order.orderId === trackOrderId
        );

        if (orderToTrack) {
          // Format date strings
          const orderDate = new Date(
            orderToTrack.orderDate
          ).toLocaleDateString();
          const deliveryDate = new Date(
            orderToTrack.deliveryDate
          ).toLocaleDateString();
          const estimatedArrival = new Date(orderToTrack.deliveryDate);

          // Calculate shipping info based on current date
          const shippedDate = new Date(orderToTrack.orderDate);
          shippedDate.setDate(shippedDate.getDate() + 2); // Assume shipped 2 days after order

          // Create order details message
          const orderDetails =
            `Order #${orderToTrack.orderId}\n\n` +
            `Total Items: (${orderToTrack.items.length})\n` +
            orderToTrack.items
              .map(
                (item) =>
                  `${item.name}: ${item.quantity} × Rp.${Math.round(
                    item.price
                  ).toLocaleString()}`
              )
              .join("\n") +
            `\nDelivery: ${orderToTrack.deliveryOption}\n` +
            `Total Price: Rp.${Math.round(
              orderToTrack.totalAmount
            ).toLocaleString()}\n\n` +
            `Order placed on: ${orderDate}\n` +
            `Status: ${orderToTrack.status}\n` +
            `Customer email: ${
              customer.contextData?.email || "Not provided"
            }\n` +
            `Delivery address: ${
              orderToTrack.deliveryLocation || "Self pickup"
            }\n\n` +
            `Your order was shipped on ${shippedDate.toLocaleDateString()} and is\n` +
            `expected to arrive on ${deliveryDate}.`;

          await sendWhatsAppMessage(phoneNumber, orderDetails);

          // Redirect back to support menu
          setTimeout(async () => {
            await sendWhatsAppMessage(
              phoneNumber,
              "Redirecting to support menu"
            );
            await customer.updateConversationState("support");
            await sendWhatsAppMessage(
              phoneNumber,
              "📞 *Customer Support* 📞\n\n" +
                "How can we assist you today?\n\n" +
                "1. Track my order\n" +
                "2. Report an issue with my order\n" +
                "3. Speak with an agent\n" +
                "4. Read about return, replace or refund policy\n\n" +
                "Type 0 to return to main menu."
            );
          }, 1500);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Order ID not found. Please enter a valid order ID or type 0 to return to main menu."
          );
        }
        break;

      case "support_report_issue":
        // Validate if input is an order ID
        const reportOrderId = text.trim();
        const orderToReport = customer.orderHistory.find(
          (order) => order.orderId === reportOrderId
        );

        if (orderToReport) {
          // Save order ID in context for next step
          customer.contextData = {
            ...customer.contextData,
            reportingOrderId: reportOrderId,
          };
          await customer.save();

          await customer.updateConversationState("support_issue_type");
          await sendWhatsAppMessage(
            phoneNumber,
            "What is the issue in order #" +
              reportOrderId +
              "\n\n" +
              "[  wrong order  ]\n" +
              "[ broken item/wrong amount ]\n" +
              "[     other     ]"
          );
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Order ID not found. Please enter a valid order ID or type 0 to return to main menu."
          );
        }
        break;

      case "support_issue_type":
        // Process issue type selection
        let issueType = text.toLowerCase().trim();

        // Map button-like responses to standardized issue types
        if (issueType.includes("wrong order")) {
          issueType = "wrong_order";
        } else if (
          issueType.includes("broken") ||
          issueType.includes("wrong amount")
        ) {
          issueType = "broken_or_wrong_amount";
        } else {
          issueType = "other";
        }

        // Store issue type in context
        customer.contextData = {
          ...customer.contextData,
          issueType: issueType,
        };
        await customer.save();

        // Move to issue details
        await customer.updateConversationState("support_issue_details");
        await sendWhatsAppMessage(
          phoneNumber,
          "Please write down the issue with the order .\n\n" +
            'Once you are finished writing type "Submit".'
        );
        break;

      case "support_issue_details":
        // Process issue details
        if (text.toLowerCase() === "submit") {
          // Create a support ticket in customer data if it doesn't exist
          if (!customer.supportTickets) {
            customer.supportTickets = [];
          }

          // Add the new ticket
          customer.supportTickets.push({
            orderId: customer.contextData.reportingOrderId,
            issueType: customer.contextData.issueType,
            issueDetails:
              customer.contextData.issueDetails || "No details provided",
            status: "open",
            createdAt: new Date(),
            lastUpdated: new Date(),
          });

          await customer.save();

          // Send confirmation
          await sendWhatsAppMessage(
            phoneNumber,
            "Our staff will contact your shortly just save the order id"
          );

          setTimeout(async () => {
            await sendWhatsAppMessage(phoneNumber, "Thank you for your time");

            setTimeout(async () => {
              await sendWhatsAppMessage(phoneNumber, "Returning to main menu");
              await sendMainMenu(phoneNumber, customer);
            }, 1000);
          }, 1000);
        } else {
          // Save the issue details in context data
          customer.contextData = {
            ...customer.contextData,
            issueDetails: text,
          };
          await customer.save();

          // Confirm receipt of details
          await sendWhatsAppMessage(
            phoneNumber,
            'I received the details. Type "Submit" to continue or provide more information.'
          );
        }
        break;

      case "support_agent":
        // Process anything the user says as content for the agent

        // Create a support ticket in customer data if it doesn't exist
        if (!customer.supportTickets) {
          customer.supportTickets = [];
        }

        // Add the new ticket for agent contact
        customer.supportTickets.push({
          type: "agent_request",
          details: text,
          status: "open",
          createdAt: new Date(),
          lastUpdated: new Date(),
        });

        await customer.save();

        // Send confirmation
        await sendWhatsAppMessage(
          phoneNumber,
          "Thank you for your message. Our customer support agent will contact you shortly."
        );

        // Return to main menu
        setTimeout(async () => {
          await sendMainMenu(phoneNumber, customer);
        }, 1500);
        break;

      case "support_policy":
        // Handle policy submenu
        switch (text) {
          case "1":
            // Track my order - reuse existing flow
            await customer.updateConversationState("support_track_order");
            await sendWhatsAppMessage(
              phoneNumber,
              "Here are all of your orders\n\n" +
                customer.orderHistory
                  .map((order, index) => {
                    const status =
                      order.status === "delivered" ? "Delivered" : "Pending";
                    const date = new Date(order.orderDate).toLocaleDateString();
                    return `${index + 1}. Order #${
                      order.orderId
                    }: Rp.${Math.round(
                      order.totalAmount
                    ).toLocaleString()} (${status}) - placed on ${date}`;
                  })
                  .join("\n") +
                "\n\nPlease enter your order id number."
            );
            break;

          case "2":
            // Report an issue - reuse existing flow
            await customer.updateConversationState("support_report_issue");
            await sendWhatsAppMessage(
              phoneNumber,
              "Here are all of your orders\n\n" +
                customer.orderHistory
                  .map((order, index) => {
                    const status =
                      order.status === "delivered" ? "Delivered" : "Pending";
                    const date = new Date(order.orderDate).toLocaleDateString();
                    return `${index + 1}. Order #${
                      order.orderId
                    }: Rp.${Math.round(
                      order.totalAmount
                    ).toLocaleString()} (${status}) - placed on ${date}`;
                  })
                  .join("\n") +
                "\n\nPlease enter your order id number."
            );
            break;

          case "3":
            // Speak with agent - reuse existing flow
            await customer.updateConversationState("support_agent");
            await sendWhatsAppMessage(
              phoneNumber,
              "Our customer support team will contact you shortly. Is there anything specific you'd like assistance with?"
            );
            break;

          case "4":
            // Return to main menu
            await sendMainMenu(phoneNumber, customer);
            break;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid option (1-4) or type 0 to return to main menu."
            );
            break;
        }
        break;

      case "support_complaint":
        if (text.toLowerCase() === "submit") {
          if (!customer.supportTickets) {
            customer.supportTickets = [];
          }

          customer.supportTickets.push({
            type: "complaint",
            details:
              customer.contextData?.complaintDetails || "No details provided",
            status: "open",
            createdAt: new Date(),
            lastUpdated: new Date(),
          });

          await customer.save();

          await sendWhatsAppMessage(
            phoneNumber,
            "Your complaint has been submitted. We’ll get back to you shortly."
          );
          await sendMainMenu(phoneNumber, customer);
        } else {
          // Store complaint details temporarily in context
          customer.contextData = {
            ...customer.contextData,
            complaintDetails: text,
          };
          await customer.save();

          await sendWhatsAppMessage(
            phoneNumber,
            "Got it. If you're finished, type *Submit* to send your complaint to our support team."
          );
        }
        break;

      // Modified account case to support the new menu structure
      case "profile":
        // Handle profile management
        if (["1", "2", "3", "4", "5"].includes(text)) {
          switch (text) {
            case "1":
              // Update name
              await customer.updateConversationState("update_name");
              await sendWhatsAppMessage(
                phoneNumber,
                `Your current name is: ${customer.name}\n\nPlease enter your new name:`
              );
              break;

            case "2":
              // Update email
              await customer.updateConversationState("update_email");
              await sendWhatsAppMessage(
                phoneNumber,
                `Your current email is: ${
                  customer.contextData?.email || "Not provided"
                }\n\nPlease enter your new email:`
              );
              break;

            case "3":
              // Manage addresses
              await customer.updateConversationState("manage_addresses");
              let addressMessage = "Your saved addresses:\n\n";

              if (!customer.addresses || customer.addresses.length === 0) {
                addressMessage += "You don't have any saved addresses yet.\n\n";
              } else {
                customer.addresses.forEach((addr, index) => {
                  addressMessage += `${index + 1}.  ${addr.nickname}:  (${
                    addr.area
                  })\n`;
                });
                addressMessage += "\n";
              }

              addressMessage +=
                "What would you like to do?\n\n" +
                "1. Add a new address\n" +
                "2. Remove an address\n" +
                "3. Return to profile";

              await sendWhatsAppMessage(phoneNumber, addressMessage);
              break;

            case "4":
              // Go to account menu - UPDATED with new structure
              await customer.updateConversationState("account_main");
              let accountMessage =
                `💰 *My Account* 💰\n\n` +
                `Please select an option:\n\n` +
                `1. Funds\n` +
                `2. Forman\n` +
                `3. Switch my number\n` +
                `4. Return to Profile`;
              await sendWhatsAppMessage(phoneNumber, accountMessage);
              break;

            case "5":
              // Return to main menu
              await sendMainMenu(phoneNumber, customer);
              break;
          }
        } else {
          // Invalid input or default prompt resend
          let updatedProfileMessage =
            `👤 *Your Profile* 👤\n\n` +
            `Name: ${customer.name}\n` +
            `📱 Master Number: ${cleanPhoneNumber(
              customer.phoneNumber?.[0] || ""
            )}\n`;

          if (customer.phoneNumber.length > 1) {
            updatedProfileMessage += `🔗 Connected Numbers:\n`;
            customer.phoneNumber.slice(1).forEach((num, index) => {
              updatedProfileMessage += `   ${index + 1}. ${cleanPhoneNumber(
                num
              )}\n`;
            });
          }

          updatedProfileMessage +=
            `Email: ${customer.contextData?.email || "Not provided"}\n\n` +
            `Total Orders: ${customer.orderHistory.length}\n` +
            `Referral Code: ${
              customer.referralCode ||
              "CM" + customer._id.toString().substring(0, 6)
            }\n\n` +
            `What would you like to do?\n\n` +
            `1. Update Name\n` +
            `2. Update Email\n` +
            `3. Manage Addresses\n` +
            `4. My Account 💰\n` +
            `5. Return to Main Menu`;

          await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);
        }
        break;

      // New main account menu
      case "account_main":
        switch (text) {
          case "1":
            // Funds submenu
            await customer.updateConversationState("account_funds");
            await sendWhatsAppMessage(
              phoneNumber,
              `💰 *My Funds* 💰\n\n` +
                `Please select an option:\n\n` +
                `1. My earnings (forman)\n` +
                `2. My refunds\n` +
                `3. Total funds available\n` +
                `4. Return to Account Menu`
            );
            break;
          case "2":
            // Forman submenu
            await customer.updateConversationState("account_forman");
            await sendWhatsAppMessage(
              phoneNumber,
              `👨‍💼 *Forman Details* 👨‍💼\n\n` +
                `Please select an option:\n\n` +
                `1. Forman status\n` +
                `2. Commission details\n` +
                `3. Return to Account Menu`
            );
            break;
          case "3":
            if (!customer.phoneNumber || customer.phoneNumber.length === 0) {
              await sendWhatsAppMessage(
                phoneNumber,
                "❌ No linked numbers found."
              );
              break;
            }

            await customer.updateConversationState(
              "universal_number_switch_select"
            );

            let switchListMsg = `🔁 *Switch your Number* 🔁\n`;

            customer.phoneNumber.forEach((num, index) => {
              const label = index === 0 ? " " : "";
              switchListMsg += `${index + 1}. ${cleanPhoneNumber(
                num
              )}${label}\n`;
            });

            switchListMsg += `\nReply with the  index of the number  you want to replace.`;

            await sendWhatsAppMessage(phoneNumber, switchListMsg);
            break;

          case "4":
            // Return to profile
            await customer.updateConversationState("profile");
            await sendWhatsAppMessage(
              phoneNumber,
              "Returning to your profile..."
            );

            // Display the profile menu after a short delay
            setTimeout(async () => {
              let updatedProfileMessage =
                `👤 *Your Profile* 👤\n\n` +
                `Name: ${customer.name}\n` +
                `📱 Master Number: ${cleanPhoneNumber(
                  customer.phoneNumber?.[0] || ""
                )}\n`;

              if (customer.phoneNumber.length > 1) {
                updatedProfileMessage += `🔗 Connected Numbers:\n`;
                customer.phoneNumber.slice(1).forEach((num, index) => {
                  updatedProfileMessage += `   ${index + 1}. ${cleanPhoneNumber(
                    num
                  )}\n`;
                });
              }

              updatedProfileMessage +=
                `Email: ${customer.contextData?.email || "Not provided"}\n\n` +
                `Total Orders: ${customer.orderHistory.length}\n` +
                `Referral Code: ${
                  customer.referralCode ||
                  "CM" + customer._id.toString().substring(0, 6)
                }\n\n` +
                `What would you like to do?\n\n` +
                `1. Update Name\n` +
                `2. Update Email\n` +
                `3. Manage Addresses\n` +
                `4. My Account 💰\n` +
                `5. Return to Main Menu`;

              await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);
            }, 500);
            break;
          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid option (1-4)."
            );
            break;
        }
        break;

      // Funds submenu handling
      case "account_funds":
        switch (text) {
          case "1":
            // My earnings
            await sendWhatsAppMessage(
              phoneNumber,
              `💵 *My Earnings (Forman)* 💵\n\n` +
                `Current earnings: Rs. 0.00\n\n` +
                `You don't have any earnings yet.\n\n` +
                `Type any key to return to Funds menu.`
            );
            break;
          case "2":
            // My refunds
            await sendWhatsAppMessage(
              phoneNumber,
              `🔄 *My Refunds* 🔄\n\n` +
                `Pending refunds: Rs. 0.00\n` +
                `Processed refunds: Rs. 0.00\n\n` +
                `You don't have any refunds.\n\n` +
                `Type any key to return to Funds menu.`
            );
            break;
          case "3":
            // Total funds available
            await sendWhatsAppMessage(
              phoneNumber,
              `💰 *Total Funds Available* 💰\n\n` +
                `Available balance: Rs. 0.00\n\n` +
                `You don't have any funds available.\n\n` +
                `Type any key to return to Funds menu.`
            );
            break;
          case "4":
            // Return to Account Menu
            await customer.updateConversationState("account_main");
            await sendWhatsAppMessage(
              phoneNumber,
              `💰 *My Account* 💰\n\n` +
                `Please select an option:\n\n` +
                `1. Funds\n` +
                `2. Forman\n` +
                `3. Switch my number\n` +
                `4. Return to Profile`
            );
            break;
          default:
            // Return to funds menu
            await sendWhatsAppMessage(
              phoneNumber,
              `💰 *My Funds* 💰\n\n` +
                `Please select an option:\n\n` +
                `1. My earnings (forman)\n` +
                `2. My refunds\n` +
                `3. Total funds available\n` +
                `4. Return to Account Menu`
            );
            break;
        }
        break;

      // Forman submenu handling
      case "account_forman":
        switch (text) {
          case "1":
            // Forman status
            await sendWhatsAppMessage(
              phoneNumber,
              `👨‍💼 *Forman Status* 👨‍💼\n\n` +
                `Status: Not active\n\n` +
                `You are not currently registered as a Forman.\n` +
                `To become a Forman, please contact support.\n\n` +
                `Type any key to return to Forman menu.`
            );
            break;
          case "2":
            // Commission details
            await sendWhatsAppMessage(
              phoneNumber,
              `💼 *Commission Details* 💼\n\n` +
                `Commission rate: 0%\n` +
                `Total commission earned: Rs. 0.00\n\n` +
                `You haven't earned any commission yet.\n\n` +
                `Type any key to return to Forman menu.`
            );
            break;
          case "3":
            // Return to Account Menu
            await customer.updateConversationState("account_main");
            await sendWhatsAppMessage(
              phoneNumber,
              `💰 *My Account* 💰\n\n` +
                `Please select an option:\n\n` +
                `1. Funds\n` +
                `2. Forman\n` +
                `3. Switch my number\n` +
                `4. Return to Profile`
            );
            break;
          default:
            // Return to Forman menu
            await sendWhatsAppMessage(
              phoneNumber,
              `👨‍💼 *Forman Details* 👨‍💼\n\n` +
                `Please select an option:\n\n` +
                `1. Forman status\n` +
                `2. Commission details\n` +
                `3. Return to Account Menu`
            );
            break;
        }
        break;

      case "universal_number_switch_select": {
        let selectedIndex = -1;
        const selection = text.trim();

        if (/^\d+$/.test(selection)) {
          const idx = parseInt(selection) - 1;
          if (idx >= 0 && idx < customer.phoneNumber.length) {
            selectedIndex = idx;
          }
        } else {
          const normalized = cleanPhoneNumber(selection);
          selectedIndex = customer.phoneNumber.findIndex(
            (num) => cleanPhoneNumber(num) === normalized
          );
        }

        if (selectedIndex === -1) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid input. Please enter a valid number or index from the list."
          );
          return;
        }

        // ✅ Correctly initialize AND save the index
        customer.set("contextData.numberSwitchIndex", selectedIndex);
        customer.markModified("contextData");
        customer.conversationState = "universal_number_switch_input";
        await customer.save();

        console.log("✅ Saved numberSwitchIndex:", selectedIndex);

        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Got it! Now send the *new number* you'd like to use instead.`
        );
        break;
      }

      case "universal_number_switch_input": {
        console.log("📦 Loaded contextData:", customer.contextData);

        const switchIdx = customer.contextData?.numberSwitchIndex;

        if (
          switchIdx === undefined ||
          switchIdx < 0 ||
          switchIdx >= customer.phoneNumber.length
        ) {
          console.error("❌ Invalid or missing switchIdx:", switchIdx);
          await sendWhatsAppMessage(
            phoneNumber,
            `❌ Switch failed. Please start again from the switch menu.`
          );
          await customer.updateConversationState("account_main");
          return;
        }

        const newRaw = text.trim().replace(/[^0-9]/g, "");
        const newFormatted = `${newRaw}@c.us`;

        if (!/^\d{10,15}$/.test(newRaw)) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Please enter a valid number (10–15 digits)."
          );
          return;
        }

        const oldNumber = customer.phoneNumber[switchIdx];
        customer.phoneNumber[switchIdx] = newFormatted;

        customer.numberLinkedHistory = customer.numberLinkedHistory || [];
        customer.numberLinkedHistory.push({
          number: oldNumber,
          replacedWith: newFormatted,
          replacedAt: new Date(),
        });

        customer.markModified("contextData");
        await customer.updateConversationState("account_main");
        await customer.save();

        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Replaced *${cleanPhoneNumber(
            oldNumber
          )}* with *${cleanPhoneNumber(newFormatted)}* successfully.`
        );

        await sendWhatsAppMessage(
          newFormatted,
          `🎉 Your account of  Construction Materials Hub! 🏗️ has been swicthed to this number successfully `
        );
        await sendWhatsAppMessage(
          newFormatted,
          `You can continue ordering now from your new number with the same progress  `
        );
        await sendWhatsAppMessage(newFormatted, `Happy Shopping 😊 `);
        break;
      }

      case "update_name":
        // Update customer name
        customer.name = text;
        await customer.save();

        await sendWhatsAppMessage(
          phoneNumber,
          `Your name has been updated to ${text}. Returning to profile...`
        );
        // Clean phone number for display by removing @c.us
        const displayPhoneNumber = customer.phoneNumber.replace("@c.us", "");
        // Return to profile
        setTimeout(async () => {
          await customer.updateConversationState("profile");
          let updatedProfileMessage =
            `👤 *Your Profile* 👤\n\n` +
            `Name: ${customer.name}\n` +
            `📱 Master Number: ${cleanPhoneNumber(
              customer.phoneNumber?.[0] || ""
            )}\n`;

          if (customer.phoneNumber.length > 1) {
            updatedProfileMessage += `🔗 Connected Numbers:\n`;
            customer.phoneNumber.slice(1).forEach((num, index) => {
              updatedProfileMessage += `   ${index + 1}. ${cleanPhoneNumber(
                num
              )}\n`;
            });
          }

          updatedProfileMessage +=
            `Email: ${customer.contextData?.email || "Not provided"}\n\n` +
            `Total Orders: ${customer.orderHistory.length}\n` +
            `Referral Code: ${
              customer.referralCode ||
              "CM" + customer._id.toString().substring(0, 6)
            }\n\n` +
            `What would you like to do?\n\n` +
            `1. Update Name\n` +
            `2. Update Email\n` +
            `3. Manage Addresses\n` +
            `4. My Account 💰\n` +
            `5. Return to Main Menu`;

          await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);
        }, 1500);
        break;

      case "update_email":
        // Basic email validation
        const profileEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (profileEmailRegex.test(text)) {
          // Update email
          if (!customer.contextData) customer.contextData = {};
          customer.contextData.email = text;
          await customer.save();

          await sendWhatsAppMessage(
            phoneNumber,
            `Your email has been updated to ${text}. Returning to profile...`
          );

          // Return to profile
          setTimeout(async () => {
            await customer.updateConversationState("profile");
            let updatedProfileMessage =
              `👤 *Your Profile* 👤\n\n` +
              `Name: ${customer.name}\n` +
              `📱 Master Number: ${cleanPhoneNumber(
                customer.phoneNumber?.[0] || ""
              )}\n`;

            if (customer.phoneNumber.length > 1) {
              updatedProfileMessage += `🔗 Connected Numbers:\n`;
              customer.phoneNumber.slice(1).forEach((num, index) => {
                updatedProfileMessage += `   ${index + 1}. ${cleanPhoneNumber(
                  num
                )}\n`;
              });
            }

            updatedProfileMessage +=
              `Email: ${customer.contextData?.email || "Not provided"}\n\n` +
              `Total Orders: ${customer.orderHistory.length}\n` +
              `Referral Code: ${
                customer.referralCode ||
                "CM" + customer._id.toString().substring(0, 6)
              }\n\n` +
              `What would you like to do?\n\n` +
              `1. Update Name\n` +
              `2. Update Email\n` +
              `3. Manage Addresses\n` +
              `4. My Account 💰\n` +
              `5. Return to Main Menu`;

            await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);
          }, 1500);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please enter a valid email address, or type 0 to return to the main menu."
          );
        }
        break;

      // Modify manage_addresses case to include the new option
      case "manage_addresses":
        if (["1", "2", "3", "4"].includes(text)) {
          switch (text) {
            case "1":
              // Start the new step-by-step address collection process
              await customer.updateConversationState(
                "add_address_nickname_step"
              );
              await sendWhatsAppMessage(
                phoneNumber,
                "Let's add a new address step by step.\n\nFirst, please enter a nickname for this address (e.g., 'Home', 'Office', 'Work'):"
              );
              break;

            // Keep other options unchanged
            case "2":
              // Remove address - No changes needed
              if (!customer.addresses || customer.addresses.length === 0) {
                await sendWhatsAppMessage(
                  phoneNumber,
                  "You don't have any addresses to remove."
                );

                // Return to address management
                setTimeout(async () => {
                  await customer.updateConversationState("manage_addresses");
                  await sendWhatsAppMessage(
                    phoneNumber,
                    "What would you like to do?\n\n" +
                      "1. Add a new address\n" +
                      "2. Remove an address\n" +
                      "3. Return to profile\n" +
                      "4. View Addresses"
                  );
                }, 1500);
              } else {
                await customer.updateConversationState("remove_address");
                let removeMessage =
                  "Which address would you like to remove?\n\n";

                customer.addresses.forEach((addr, index) => {
                  removeMessage += `${index + 1}. ${
                    addr.nickname || "Address"
                  }: ${addr.fullAddress || "No address"}\n`;
                });

                await sendWhatsAppMessage(phoneNumber, removeMessage);
              }
              break;

            case "3":
              // Return to profile - No changes needed
              await customer.updateConversationState("profile");
              let updatedProfileMessage =
                `👤 *Your Profile* 👤\n\n` +
                `Name: ${customer.name}\n` +
                `📱 Master Number: ${cleanPhoneNumber(
                  customer.phoneNumber?.[0] || ""
                )}\n`;

              if (customer.phoneNumber.length > 1) {
                updatedProfileMessage += `🔗 Connected Numbers:\n`;
                customer.phoneNumber.slice(1).forEach((num, index) => {
                  updatedProfileMessage += `   ${index + 1}. ${cleanPhoneNumber(
                    num
                  )}\n`;
                });
              }

              updatedProfileMessage +=
                `Email: ${customer.contextData?.email || "Not provided"}\n\n` +
                `Total Orders: ${customer.orderHistory.length}\n` +
                `Referral Code: ${
                  customer.referralCode ||
                  "CM" + customer._id.toString().substring(0, 6)
                }\n\n` +
                `What would you like to do?\n\n` +
                `1. Update Name\n` +
                `2. Update Email\n` +
                `3. Manage Addresses\n` +
                `4. My Account 💰\n` +
                `5. Return to Main Menu`;

              await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);

              break;

            case "4":
              // View addresses - No changes needed
              if (!customer.addresses || customer.addresses.length === 0) {
                await sendWhatsAppMessage(
                  phoneNumber,
                  "You don't have any saved addresses yet."
                );

                // Return to address management
                setTimeout(async () => {
                  await customer.updateConversationState("manage_addresses");
                  await sendWhatsAppMessage(
                    phoneNumber,
                    "What would you like to do?\n\n" +
                      "1. Add a new address\n" +
                      "2. Remove an address\n" +
                      "3. Return to profile\n" +
                      "4. View Addresses"
                  );
                }, 1500);
              } else {
                await customer.updateConversationState("view_addresses");
                let viewMessage = "Your saved addresses:\n\n";

                customer.addresses.forEach((addr, index) => {
                  viewMessage += `${index + 1}. ${
                    addr.nickname || "Address"
                  }: ${addr.area ? ` (${addr.area})` : ""}\n`;
                });
                viewMessage += "-------------------------------------------";
                viewMessage += "\nBack: return and back";

                viewMessage +=
                  "\n\nEnter the number of the address you want to edit or type 'back' to return.";

                await sendWhatsAppMessage(phoneNumber, viewMessage);
              }
              break;
          }
        } else {
          // Default address management menu display
          console.log(
            "Customer addresses:",
            JSON.stringify(customer.addresses || [])
          );

          await customer.updateConversationState("manage_addresses");
          let addressMessage = "Your saved addresses:\n\n";

          if (!customer.addresses || customer.addresses.length === 0) {
            addressMessage += "You don't have any saved addresses yet.\n\n";
          } else {
            // Iterate through each address and safely access properties
            customer.addresses.forEach((addr, index) => {
              const nickname = addr.nickname || "Address";
              const fullAddress = addr.fullAddress || "No address provided";
              const area = addr.area ? ` (${addr.area})` : "";

              addressMessage += `${
                index + 1
              }. ${nickname}: ${fullAddress}${area}\n`;
            });
            addressMessage += "\n";
          }

          addressMessage +=
            "What would you like to do?\n\n" +
            "1. Add a new address\n" +
            "2. Remove an address\n" +
            "3. Return to profile\n" +
            "4. View Addresses";

          await sendWhatsAppMessage(phoneNumber, addressMessage);
        }
        break;

      // Step 1: Collect nickname
      case "add_address_nickname_step":
        try {
          // Initialize contextData if it doesn't exist
          if (!customer.contextData) {
            customer.contextData = {};
          }

          // Initialize a new empty address in contextData
          customer.contextData.tempAddress = {
            nickname: text,
            fullAddress: "",
            area: "",
            googleMapLink: "",
          };

          // Save the data
          await customer.save();
          console.log("Saved nickname to tempAddress:", text);

          // Move to next step - asking for full address
          await customer.updateConversationState(
            "add_address_fulladdress_step"
          );
          await sendWhatsAppMessage(
            phoneNumber,
            `Great! Your address will be saved as "${text}".\n\nNow, please enter the full address:`
          );
        } catch (error) {
          console.error("Error saving address nickname:", error);
          await sendWhatsAppMessage(
            phoneNumber,
            "Sorry, there was an error. Let's try again."
          );

          // Return to address management
          await customer.updateConversationState("manage_addresses");
        }
        break;

      // Step 2: Collect full address
      case "add_address_fulladdress_step":
        try {
          // Make sure contextData and tempAddress exist
          if (!customer.contextData || !customer.contextData.tempAddress) {
            // Recover by recreating the contextData
            if (!customer.contextData) {
              customer.contextData = {};
            }

            customer.contextData.tempAddress = {
              nickname: "Address",
              fullAddress: "",
              area: "",
              googleMapLink: "",
            };
          }

          // Save the full address
          customer.contextData.tempAddress.fullAddress = text;
          await customer.save();
          console.log("Saved full address to tempAddress:", text);

          // Move to next step - asking for area
          await customer.updateConversationState("add_address_area_step");
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select your area  \n1.seminyak \n2.legian \n3.ubud  \n4.uluwatu \n5.sannur  \n6.amed:"
          );
        } catch (error) {
          console.error("Error saving address fullAddress:", error);
          await sendWhatsAppMessage(
            phoneNumber,
            "Sorry, there was an error. Let's try again from the beginning."
          );

          // Return to address management
          await customer.updateConversationState("manage_addresses");
        }
        break;

      // Updated case in the router file for add_address_area_step
      case "add_address_area_step":
        try {
          // Validate the area selection
          const areaOptions = {
            1: "seminyak",
            2: "legian",
            3: "ubud",
            4: "uluwatu",
            5: "sannur",
            6: "amed",
          };

          // Check if the selected area is valid
          if (!areaOptions[text]) {
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid area number (1-6)."
            );
            return;
          }

          // Make sure contextData and tempAddress exist
          if (!customer.contextData || !customer.contextData.tempAddress) {
            throw new Error("Address information was lost. Please start over.");
          }

          // Save the area using the mapped value
          customer.contextData.tempAddress.area = areaOptions[text];
          await customer.save();
          console.log("Saved area to tempAddress:", areaOptions[text]);

          // Move to final step - asking for Google Maps link
          await customer.updateConversationState("add_address_maplink_step");
          await sendWhatsAppMessage(
            phoneNumber,
            "Almost done! Finally, please enter a Google Maps link for this address (or type 'none' if you don't have one):"
          );
        } catch (error) {
          console.error("Error saving address area:", error);
          await sendWhatsAppMessage(
            phoneNumber,
            "Sorry, there was an error: " +
              error.message +
              ". Let's try again from the beginning."
          );

          // Return to address management
          await customer.updateConversationState("manage_addresses");
        }
        break;

      // Step 4: Collect map link and finalize the address
      case "add_address_maplink_step":
        try {
          // Make sure contextData and tempAddress exist
          if (!customer.contextData || !customer.contextData.tempAddress) {
            throw new Error("Address information was lost. Please start over.");
          }

          // Get the temporary address data
          const tempAddress = customer.contextData.tempAddress;

          // Create the final address object
          const newAddress = {
            nickname: tempAddress.nickname || "Address",
            fullAddress: tempAddress.fullAddress || "No address provided",
            area: tempAddress.area || "",
            googleMapLink: text.toLowerCase() === "none" ? "" : text,
            isDefault: !customer.addresses || customer.addresses.length === 0,
          };

          console.log("Creating final address:", newAddress);

          // Add to addresses array
          if (!customer.addresses) customer.addresses = [];
          customer.addresses.push(newAddress);

          // Clean up temporary data
          delete customer.contextData.tempAddress;
          await customer.save();

          // Send confirmation message
          await sendWhatsAppMessage(
            phoneNumber,
            `Great! Your address "${newAddress.nickname}" has been added${
              newAddress.isDefault ? " and set as your default address" : ""
            }!`
          );

          // Return to address management after a brief delay
          setTimeout(async () => {
            await customer.updateConversationState("manage_addresses");
            let addressMessage = "Your saved addresses:\n\n";

            customer.addresses.forEach((addr, index) => {
              const nickname = addr.nickname || "Address";
              const fullAddress = addr.fullAddress || "No address provided";
              const area = addr.area ? ` (${addr.area})` : "";

              addressMessage += `${index + 1}. ${nickname}: ${area}\n`;
            });
            addressMessage += "\n";

            addressMessage +=
              "What would you like to do?\n\n" +
              "1. Add a new address\n" +
              "2. Remove an address\n" +
              "3. Return to profile\n" +
              "4. View Addresses";

            await sendWhatsAppMessage(phoneNumber, addressMessage);
          }, 1500);
        } catch (error) {
          console.error("Error finalizing address:", error);
          await sendWhatsAppMessage(
            phoneNumber,
            "Sorry, there was an error: " +
              error.message +
              ". Let's try again from the beginning."
          );

          // Return to address management
          await customer.updateConversationState("manage_addresses");
        }
        break;
      case "view_addresses":
        if (text.toLowerCase() === "back") {
          // Return to manage addresses
          await customer.updateConversationState("manage_addresses");

          // Show address management menu
          let addressMessage = "Your saved addresses:\n\n";
          if (!customer.addresses || customer.addresses.length === 0) {
            addressMessage += "You don't have any saved addresses yet.\n\n";
          } else {
            customer.addresses.forEach((addr, index) => {
              const nickname = addr.nickname || "Address";
              const fullAddress = addr.fullAddress || "No address provided";
              const area = addr.area ? ` (${addr.area})` : "";

              addressMessage += `${index + 1}. ${nickname}: ${area}\n`;
            });
            addressMessage += "\n";
          }

          addressMessage +=
            "What would you like to do?\n\n" +
            "1. Add a new address\n" +
            "2. Remove an address\n" +
            "3. Return to profile\n" +
            "4. View Addresses";

          await sendWhatsAppMessage(phoneNumber, addressMessage);
        } else {
          const addressIndex = parseInt(text) - 1;

          // Validate the address index
          if (
            addressIndex >= 0 &&
            customer.addresses &&
            addressIndex < customer.addresses.length
          ) {
            const selectedAddress = customer.addresses[addressIndex];

            // Log the address data for debugging
            console.log(
              `Selected address at index ${addressIndex}:`,
              selectedAddress
            );

            // Save the index for the edit operation
            if (!customer.contextData) {
              customer.contextData = {};
            }
            customer.contextData.editAddressIndex = addressIndex;
            await customer.save();

            // Display full address details
            let detailsMessage = `**Address Details:**\n\n`;
            detailsMessage += `Nickname: ${
              selectedAddress.nickname || "Not set"
            }\n`;
            detailsMessage += `Full Address: ${
              selectedAddress.fullAddress || "Not set"
            }\n`;
            detailsMessage += `Area: ${selectedAddress.area || "Not set"}\n`;
            detailsMessage += `Google Maps Link: ${
              selectedAddress.googleMapLink || "Not set"
            }\n\n`;

            detailsMessage += `What would you like to do?\n`;
            detailsMessage += `-------------\n`;
            detailsMessage += `1. Edit this address\n`;
            detailsMessage += `2. Return to Address List\n`;

            await customer.updateConversationState("address_details_options");
            await sendWhatsAppMessage(phoneNumber, detailsMessage);
          } else {
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid address number or type 'back' to return."
            );
          }
        }
        break;

      case "address_details_options":
        if (text === "1") {
          // Verify we have the index saved
          if (
            !customer.contextData ||
            customer.contextData.editAddressIndex === undefined
          ) {
            console.error("Missing address index in contextData");
            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, we've lost track of which address you're editing. Let's try again."
            );

            await customer.updateConversationState("manage_addresses");
            break;
          }

          const addressIndex = customer.contextData.editAddressIndex;

          // Verify the address index is valid
          if (
            addressIndex < 0 ||
            !customer.addresses ||
            addressIndex >= customer.addresses.length
          ) {
            console.error(`Invalid address index: ${addressIndex}`);
            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, the address you're trying to edit couldn't be found. Let's try again."
            );

            await customer.updateConversationState("manage_addresses");
            break;
          }

          // Send edit options
          let editMessage = `**What would you like to edit?**\n`;
          editMessage += `-------------\n`;
          editMessage += `1. Nickname\n`;
          editMessage += `2. Full Address\n`;
          editMessage += `3. Area\n`;
          editMessage += `4. Google Maps Link\n`;
          editMessage += `5. Return to Address List\n`;

          await customer.updateConversationState("edit_address_select");
          await sendWhatsAppMessage(phoneNumber, editMessage);
        } else if (text === "2") {
          // Return to address list
          await customer.updateConversationState("view_addresses");
          let viewMessage = "Your saved addresses:\n\n";

          customer.addresses.forEach((addr, index) => {
            const nickname = addr.nickname || "Address";
            const fullAddress = addr.fullAddress || "No address provided";
            const area = addr.area ? ` (${addr.area})` : "";

            viewMessage += `${index + 1}. ${nickname}: ${area}\n`;
          });
          viewMessage += "-------------------------------------------";
          viewMessage += "\nBack: return and back";

          viewMessage +=
            "\n\nEnter the number of the address you want to edit or type 'back' to return.";

          await sendWhatsAppMessage(phoneNumber, viewMessage);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid option (1 or 2)."
          );
        }
        break;
      // Fixed edit_address_select case - For selecting which field to edit
      case "edit_address_select":
        if (["1", "2", "3", "4", "5"].includes(text)) {
          // Verify we have the index saved
          if (
            !customer.contextData ||
            customer.contextData.editAddressIndex === undefined
          ) {
            console.error("Missing address index in contextData");
            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, we've lost track of which address you're editing. Let's try again."
            );

            await customer.updateConversationState("manage_addresses");
            break;
          }

          const addressIndex = customer.contextData.editAddressIndex;

          // Verify the address index is valid
          if (
            addressIndex < 0 ||
            !customer.addresses ||
            addressIndex >= customer.addresses.length
          ) {
            console.error(`Invalid address index: ${addressIndex}`);
            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, the address you're trying to edit couldn't be found. Let's try again."
            );

            await customer.updateConversationState("manage_addresses");
            break;
          }

          if (text === "5") {
            // Return to address list
            await customer.updateConversationState("view_addresses");
            let viewMessage = "Your saved addresses:\n\n";

            customer.addresses.forEach((addr, index) => {
              const nickname = addr.nickname || "Address";
              const fullAddress = addr.fullAddress || "No address provided";
              const area = addr.area ? ` (${addr.area})` : "";

              viewMessage += `${index + 1}. ${nickname}: ${area}\n`;
            });

            viewMessage += "-------------------------------------------";
            viewMessage += "\nBack: return and back";

            viewMessage +=
              "\n\nEnter the number of the address you want to edit or type 'back' to return.";
            await sendWhatsAppMessage(phoneNumber, viewMessage);
          } else {
            // Store which field we're editing
            const editFields = {
              1: "nickname",
              2: "fullAddress",
              3: "area",
              4: "googleMapLink",
            };

            customer.contextData.editAddressField = editFields[text];
            await customer.save();

            // Log debug info
            console.log(
              `Ready to edit ${editFields[text]} for address index ${addressIndex}`
            );

            // Get current value for the field
            const currentValue =
              customer.addresses[addressIndex][editFields[text]] || "Not set";

            // Prompt for new value
            await customer.updateConversationState("edit_address_value");
            await sendWhatsAppMessage(
              phoneNumber,
              `Current ${editFields[text]}: ${currentValue}\n\nPlease enter the new ${editFields[text]}:`
            );
          }
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid option (1-5)."
          );
        }
        break;

      // Fixed edit_address_value case - For updating the selected field
      case "edit_address_value":
        try {
          // Verify we have the necessary context data
          if (
            !customer.contextData ||
            customer.contextData.editAddressIndex === undefined ||
            !customer.contextData.editAddressField
          ) {
            throw new Error(
              "Missing required context data for editing address"
            );
          }

          // Get the index and field to edit
          const addressIndex = customer.contextData.editAddressIndex;
          const fieldToEdit = customer.contextData.editAddressField;

          // Validate the address index
          if (
            addressIndex < 0 ||
            !customer.addresses ||
            addressIndex >= customer.addresses.length
          ) {
            throw new Error(`Invalid address index: ${addressIndex}`);
          }

          // Log update info
          console.log(
            `Updating address ${addressIndex}, field ${fieldToEdit} to "${text}"`
          );

          // Get the address before update (for logging)
          const beforeUpdate = { ...customer.addresses[addressIndex] };

          // Update the address field
          customer.addresses[addressIndex][fieldToEdit] = text;
          await customer.save();

          // Log the before and after for debugging
          console.log("Address before update:", beforeUpdate);
          console.log(
            "Address after update:",
            customer.addresses[addressIndex]
          );

          // Confirm the update
          await sendWhatsAppMessage(
            phoneNumber,
            `Address ${fieldToEdit} updated successfully!`
          );

          // Show the updated address details
          const updatedAddress = customer.addresses[addressIndex];
          let detailsMessage = `Updated Address Details:\n\n`;
          detailsMessage += `Nickname: ${
            updatedAddress.nickname || "Not set"
          }\n`;
          detailsMessage += `Full Address: ${
            updatedAddress.fullAddress || "Not set"
          }\n`;
          detailsMessage += `Area: ${updatedAddress.area || "Not set"}\n`;
          detailsMessage += `Google Maps Link: ${
            updatedAddress.googleMapLink || "Not set"
          }\n\n`;

          detailsMessage += `What would you like to edit?\n\n`;
          detailsMessage += `1. Nickname\n`;
          detailsMessage += `2. Full Address\n`;
          detailsMessage += `3. Area\n`;
          detailsMessage += `4. Google Maps Link\n`;
          detailsMessage += `5. Return to Address List\n`;

          // Return to edit options
          await customer.updateConversationState("edit_address_select");
          await sendWhatsAppMessage(phoneNumber, detailsMessage);
        } catch (error) {
          console.error("Error updating address:", error);
          await sendWhatsAppMessage(
            phoneNumber,
            `Sorry, there was an error updating your address: ${error.message}. Let's try again.`
          );

          // Return to address management
          await customer.updateConversationState("manage_addresses");
          let addressMessage = "Your saved addresses:\n\n";

          if (!customer.addresses || customer.addresses.length === 0) {
            addressMessage += "You don't have any saved addresses yet.\n\n";
          } else {
            customer.addresses.forEach((addr, index) => {
              const nickname = addr.nickname || "Address";
              const fullAddress = addr.fullAddress || "No address provided";
              const area = addr.area ? ` (${addr.area})` : "";

              addressMessage += `${
                index + 1
              }. ${nickname}: ${fullAddress}${area}\n`;
            });
            addressMessage += "\n";
          }

          addressMessage +=
            "What would you like to do?\n\n" +
            "1. Add a new address\n" +
            "2. Remove an address\n" +
            "3. Return to profile\n" +
            "4. View Addresses";

          await sendWhatsAppMessage(phoneNumber, addressMessage);
        }
        break;
      // Fixed remove_address case - For safely removing an address
      case "remove_address":
        try {
          const removeIndex = parseInt(text) - 1;

          // Validate the address index
          if (isNaN(removeIndex)) {
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter a number to select which address to remove."
            );
            break;
          }

          // Check if the index is valid
          if (
            removeIndex < 0 ||
            !customer.addresses ||
            removeIndex >= customer.addresses.length
          ) {
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid address number from the list."
            );
            break;
          }

          // Store address info for confirmation message
          const addressToRemove = customer.addresses[removeIndex];
          const removedName = addressToRemove.nickname || "Address";
          const wasDefault = addressToRemove.isDefault || false;

          console.log(
            `Removing address at index ${removeIndex}:`,
            addressToRemove
          );

          // Remove the address
          customer.addresses.splice(removeIndex, 1);

          // If we removed the default address and there are other addresses, set a new default
          if (wasDefault && customer.addresses.length > 0) {
            customer.addresses[0].isDefault = true;
            console.log(`Set new default address:`, customer.addresses[0]);
          }

          // Save changes
          await customer.save();

          // Confirm removal
          await sendWhatsAppMessage(
            phoneNumber,
            `Address "${removedName}" has been removed successfully.`
          );

          // Return to address management after a brief delay
          setTimeout(async () => {
            await customer.updateConversationState("manage_addresses");

            let addressMessage = "Your saved addresses:\n\n";

            if (!customer.addresses || customer.addresses.length === 0) {
              addressMessage += "You don't have any saved addresses yet.\n\n";
            } else {
              customer.addresses.forEach((addr, index) => {
                const nickname = addr.nickname || "Address";
                const fullAddress = addr.fullAddress || "No address provided";
                const area = addr.area ? ` (${addr.area})` : "";

                addressMessage += `${index + 1}. ${nickname}: ${area}\n`;
              });
              addressMessage += "\n";
            }

            addressMessage +=
              "What would you like to do?\n\n" +
              "1. Add a new address\n" +
              "2. Remove an address\n" +
              "3. Return to profile\n" +
              "4. View Addresses";

            await sendWhatsAppMessage(phoneNumber, addressMessage);
          }, 1500);
        } catch (error) {
          console.error("Error removing address:", error);
          await sendWhatsAppMessage(
            phoneNumber,
            `Sorry, there was an error removing the address: ${error.message}. Please try again.`
          );

          await customer.updateConversationState("manage_addresses");
        }
        break;
      case "order_history":
        if (customer.orderHistory && customer.orderHistory.length > 0) {
          // Set conversation state first
          await customer.updateConversationState("order_history");

          // Generate the order list
          const orderListMessage = generateOrderHistoryList(customer);

          // Send the order list first
          await sendWhatsAppMessage(phoneNumber, orderListMessage);

          // Then send the instruction as a separate message
          await sendWhatsAppMessage(
            phoneNumber,
            "Enter the order number to view details, type 'back' to return to the main menu."
          );

          // Add both messages to chat history
          await customer.addToChatHistory(orderListMessage, "bot");
          await customer.addToChatHistory(
            "Enter the order number to view details, type 'back' to return to the main menu.",
            "bot"
          );
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "You don't have any order history yet. Start shopping to create your first order!"
          );
          await sendMainMenu(phoneNumber, customer);
        }
        break;
      case "order_details":
        const orderNumber = parseInt(text);

        // Check if input is a valid order number
        if (
          customer.orderHistory &&
          customer.orderHistory.length > 0 &&
          orderNumber > 0 &&
          orderNumber <= customer.orderHistory.length
        ) {
          // Orders are sorted newest to oldest, so we need to adjust the index
          const sortedOrders = [...customer.orderHistory].sort((a, b) => {
            return new Date(b.orderDate) - new Date(a.orderDate);
          });

          // Convert from order number to array index
          const orderIndex = orderNumber - 1;
          const order = sortedOrders[orderIndex];

          if (order) {
            // Enhanced order details with more information
            let orderDetails = `📦 *Order #${order.orderId}* 📦\n\n`;

            // Order date and time with better formatting
            const orderDate = new Date(order.orderDate);
            orderDetails += `Date: ${orderDate.toLocaleDateString()} at ${orderDate.toLocaleTimeString()}\n`;

            // Status with emoji indicators
            const statusEmojis = {
              pending: "⏳",
              confirmed: "✅",
              processing: "🔄",
              shipped: "🚚",
              delivered: "📬",
              cancelled: "❌",
            };
            orderDetails += `Status: ${statusEmojis[order.status] || ""} ${
              order.status
            }\n`;

            // Delivery details with more information
            orderDetails += `Delivery: ${order.deliveryOption}\n`;
            if (order.deliveryLocation)
              orderDetails += `Location: ${order.deliveryLocation}\n`;

            // Payment info with emoji indicators
            const paymentEmojis = {
              pending: "⏳",
              paid: "💰",
              failed: "❌",
            };
            orderDetails += `Payment Status: ${
              paymentEmojis[order.paymentStatus] || ""
            } ${order.paymentStatus}\n`;
            orderDetails += `Payment Method: ${
              order.paymentMethod || "Bank Transfer"
            }\n`;

            // Add transaction ID if available
            if (order.transactionId) {
              orderDetails += `Transaction ID: ${order.transactionId}\n`;
            }

            // Add estimated or actual delivery date
            if (order.deliveryDate) {
              const deliveryDate = new Date(order.deliveryDate);
              orderDetails += `${
                order.status === "delivered"
                  ? "Delivered on"
                  : "Estimated delivery"
              }: ${deliveryDate.toLocaleDateString()}\n`;
            }

            orderDetails += `\n📝 *Items Ordered* 📝\n`;

            // Enhanced items list with better formatting
            let subtotal = 0;
            order.items.forEach((item, i) => {
              orderDetails += `${i + 1}. ${item.productName} (${
                item.weight
              })\n`;
              orderDetails += `   • Quantity: ${item.quantity}\n`;
              orderDetails += `   • Unit Price: ${formatRupiah(item.price)}\n`;
              orderDetails += `   • Subtotal: ${formatRupiah(
                item.totalPrice
              )}\n\n`;
              subtotal += item.totalPrice;
            });

            // Detailed cost breakdown
            orderDetails += `📊 *Cost Breakdown* 📊\n`;
            orderDetails += `Subtotal: ${formatRupiah(subtotal)}\n`;

            if (order.deliveryCharge > 0) {
              orderDetails += `Delivery Charge: ${formatRupiah(
                order.deliveryCharge
              )}\n`;
            }

            // Add discounts if applied
            if (order.firstOrderDiscount && order.firstOrderDiscount > 0) {
              orderDetails += `First Order Discount: -${formatRupiah(
                order.firstOrderDiscount
              )}\n`;
            }

            // Final total
            orderDetails += `\n💲 *Total Paid: ${formatRupiah(
              order.totalAmount
            )}* 💲\n\n`;

            orderDetails +=
              "Type 0 to return to main menu or 'back' to view order history list.";

            await sendWhatsAppMessage(phoneNumber, orderDetails);
          } else {
            await sendWhatsAppMessage(
              phoneNumber,
              "Order not found. Please try again."
            );

            // Send the order list again
            const orderListMessage = generateOrderHistoryList(customer);
            await sendWhatsAppMessage(phoneNumber, orderListMessage);
          }
        } else if (text.toLowerCase() === "back") {
          await customer.updateConversationState("order_history");

          // Send the order list
          const orderListMessage = generateOrderHistoryList(customer);
          await sendWhatsAppMessage(phoneNumber, orderListMessage);
        } else {
          await sendMainMenu(phoneNumber, customer);
        }
        break;
      case "order_confirmation":
        // Confirmation message
        await customer.updateConversationState("order_confirmation");

        // Get the latest order
        const latestOrder =
          customer.orderHistory[customer.orderHistory.length - 1];

        // Basic confirmation
        await sendWhatsAppMessage(
          phoneNumber,
          "Your payment will be confirmed within 30 min\n" +
            "Please call us or come back in 30 minutes for the confirmation.\n\n" +
            `Your order id is #${latestOrder.orderId}. Keep it safe please, ${customer.name}.`
        );

        // Add pickup timing info if applicable
        if (latestOrder.deliveryOption === "Self Pickup") {
          let pickupMessage = "Your order will be ready in:\n\n";

          if (latestOrder.totalAmount < 2000000) {
            pickupMessage +=
              "if smaller than 2million straight away just come and picket up";
          } else if (latestOrder.totalAmount > 25000000) {
            pickupMessage +=
              "if order is larger then 25 million: in 1 hours time you can pickup";
          } else {
            pickupMessage +=
              "We'll notify you when your order is ready for pickup.";
          }

          await sendWhatsAppMessage(phoneNumber, pickupMessage);
        }

        // Send final thank you message
        setTimeout(async () => {
          await sendWhatsAppMessage(
            phoneNumber,
            "Thank you for shopping with us! Don't forget to share your referral link and check out our discounts for more savings. Have a great day!"
          );

          // Reset state to main menu
          await sendMainMenu(phoneNumber, customer);
        }, 3000);
        break;

      case "referral":
        if (text === "0") {
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        // Check if responding to option selection from previous menu
        if (text === "1") {
          await customer.updateConversationState("referral_create_image");
          await sendWhatsAppMessage(
            phoneNumber,
            "Attach your new referral video"
          );
          break;
        } else if (
          text === "2" &&
          customer.referralImages &&
          customer.referralImages.length > 0
        ) {
          // User selected "Use my previous video"
          const latestImage =
            customer.referralImages[customer.referralImages.length - 1];

          await sendWhatsAppMessage(
            phoneNumber,
            `Video #${customer.referralImages.length}\n` +
              `Approved on: ${new Date(
                latestImage.approvalDate
              ).toLocaleDateString()}\n` +
              `Duration: 3 min\n` +
              `Shared till now: ${
                latestImage.sharedWith ? latestImage.sharedWith.length : 0
              } contact`
          );

          // Move directly to adding contacts
          await customer.updateConversationState("referral_add_contacts");
          await sendWhatsAppMessage(
            phoneNumber,
            "Write or attach the contact numbers of your friends one by one with whom you want to share the video"
          );
          break;
        }

        // First-time or returning user referral flow
        await sendWhatsAppMessage(
          phoneNumber,
          "Our referral program is simple and rewarding!\nHere's how it works:\n\n" +
            "• Share your referral video with friends.\n" +
            "• When your friend makes their first purchase, you'll get access to many discounted products."
        );

        if (customer.referralImages && customer.referralImages.length > 0) {
          await sendWhatsAppMessage(
            phoneNumber,
            "We already have your referral video. What do you want to do next?"
          );

          setTimeout(async () => {
            await sendWhatsAppMessage(
              phoneNumber,
              "1. Attach a new referral video\n2. Use my previous video"
            );
          }, 500);
        } else {
          // First-time video creation flow
          setTimeout(async () => {
            await sendWhatsAppMessage(phoneNumber, "Ready to create a video?");

            setTimeout(async () => {
              try {
                const demoImagePath = path.join(
                  __dirname,
                  "/dem-imgs/demo.jpg"
                );
                if (fs.existsSync(demoImagePath)) {
                  const media = MessageMedia.fromFilePath(demoImagePath);
                  await client.sendMessage(phoneNumber, media, {
                    caption: "Here is a sample video",
                  });
                }
              } catch (error) {
                console.error("Error sending demo image:", error);
              }

              setTimeout(async () => {
                await sendWhatsAppMessage(
                  phoneNumber,
                  "What to say in your video:\n" +
                    "• Your name\n" +
                    "• Say hi in general\n" +
                    "• Say you love us\n" +
                    "• Why you like us"
                );

                setTimeout(async () => {
                  await sendWhatsAppMessage(
                    phoneNumber,
                    "What do you want to do next?"
                  );

                  setTimeout(async () => {
                    await sendWhatsAppMessage(
                      phoneNumber,
                      "1. Attach your referral video\n2. Return to main menu"
                    );

                    await customer.updateConversationState(
                      "referral_create_image"
                    );
                  }, 500);
                }, 1000);
              }, 1000);
            }, 1000);
          }, 1000);
        }
        break;

      // Revised referral flow
      case "referral_create_image":
        if (text === "1") {
          await sendWhatsAppMessage(phoneNumber, "Attach your video");
          // No state change needed, keep waiting for the image
        } else if (text === "2" || text === "0") {
          await sendMainMenu(phoneNumber, customer);
        } else if (text.toLowerCase() === "back") {
          await customer.updateConversationState("referral");
          await processChatMessage(phoneNumber, "", message);
        } else {
          // If they just sent a message but not an image, remind them
          if (!message.hasMedia) {
            await sendWhatsAppMessage(phoneNumber, "Please attach your video");
          }
        }
        break;

      case "referral_add_contacts":
        if (text === "0") {
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        // Ensure a referral image exists
        if (!customer.referralImages || customer.referralImages.length === 0) {
          await sendWhatsAppMessage(
            phoneNumber,
            "Error: No referral video found. Please create a video first."
          );
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        // Now proceed directly to ask for contact (no duplicate prompts)
        await sendWhatsAppMessage(
          phoneNumber,
          "Write or attach the contact numbers of your friends one by one with whom you want to share the video"
        );

        // Move to next state to handle contact input
        await customer.updateConversationState("referral_contact_number");
        break;
      case "referral_contact_number":
        // Format phone number
        let formattedPhoneNumber = text.replace(/\D/g, "");

        // Ensure the number is in international format
        if (!formattedPhoneNumber.startsWith("")) {
          formattedPhoneNumber = "" + formattedPhoneNumber.replace(/^0/, "");
        }

        const contactPhoneNumber = formattedPhoneNumber + "@c.us";

        // Validate referral image
        if (!customer.referralImages || customer.referralImages.length === 0) {
          await sendWhatsAppMessage(
            phoneNumber,
            "Error: No referral video found. Please create a video first."
          );
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        const latestImage =
          customer.referralImages[customer.referralImages.length - 1];

        // Add contact to sharedWith array
        if (!latestImage.sharedWith) {
          latestImage.sharedWith = [];
        }

        latestImage.sharedWith.push({
          name: "Contact", // You might want to ask for a name
          phoneNumber: contactPhoneNumber,
          dateShared: new Date(),
          status: "pending",
        });

        await customer.save();

        // Add debug logging
        console.log(`Preparing to send referral to: ${contactPhoneNumber}`);

        // Move to contact confirmation state
        await customer.updateConversationState("referral_more_contacts");
        await sendWhatsAppMessage(
          phoneNumber,
          `Contact ${text} has been added to share list.\n` +
            "Do you want to refer more friends?\n1. Yes\n2. No"
        );
        break;

      case "referral_more_contacts":
        if (text === "1" || text.toLowerCase() === "yes") {
          // Reset for next contact
          await customer.updateConversationState("referral_contact_number");
          await sendWhatsAppMessage(
            phoneNumber,
            "Write or attach his/her WhatsApp number"
          );
        } else if (text === "2" || text.toLowerCase() === "no") {
          // Finalize referral process
          await customer.updateConversationState("referral_confirmation");
          await sendWhatsAppMessage(
            phoneNumber,
            "Thank you! Your video will be shared with your friends shortly"
          );

          // After a delay, trigger the actual sharing process
          setTimeout(async () => {
            // Process all pending referrals
            if (customer.referralImages && customer.referralImages.length > 0) {
              const latestImage =
                customer.referralImages[customer.referralImages.length - 1];

              if (latestImage.sharedWith && latestImage.sharedWith.length > 0) {
                for (const contact of latestImage.sharedWith) {
                  if (contact.status === "pending") {
                    await sendReferralToContact(customer, latestImage, contact);
                  }
                }
              }
            }

            // Return to main menu
            await sendWhatsAppMessage(phoneNumber, "Redirecting to main menu");
            await sendMainMenu(phoneNumber, customer);
          }, 2000);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid option:\n1. Yes\n2. No\n\nType 0 to return to main menu."
          );
        }
        break;
      case "referral_confirmation":
        // Any input will return to main menu
        await sendMainMenu(phoneNumber, customer);
        break;

      // Replace the discounts case with this improved implementation
      case "discounts":
        // Check if the input is a valid discount category selection (1-5)
        if (["1", "2", "3", "4", "5"].includes(text)) {
          // Save the selected category and transition to showing products
          console.log(`Selected discount category: ${text}`);

          // Update state to show products from the selected category
          await customer.updateConversationState("discount_products");

          // Fetch and send the discounted products list for the selected category
          await sendDiscountedProductsList(phoneNumber, customer, text);
        } else if (text === "0") {
          await sendMainMenu(phoneNumber, customer);
        } else {
          // Invalid selection
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid discount category (1-5), or type 0 to return to main menu."
          );
        }
        break;
      case "discount_products":
        // Check if customer is trying to go back to main menu
        if (text === "0") {
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        // Convert user input to a number
        const selectedProductNumber = parseInt(text);

        // Validate the product number
        const selectedProduct = getDiscountProductByNumber(
          selectedProductNumber
        );

        if (selectedProduct) {
          console.log(
            "Selected Discounted Product:",
            JSON.stringify(selectedProduct, null, 2)
          );

          // Determine the category based on the product number
          let category;
          if (selectedProductNumber >= 11 && selectedProductNumber <= 19)
            category = "1";
          else if (selectedProductNumber >= 21 && selectedProductNumber <= 29)
            category = "2";
          else if (selectedProductNumber >= 31 && selectedProductNumber <= 39)
            category = "3";
          else if (selectedProductNumber >= 41 && selectedProductNumber <= 49)
            category = "4";
          else if (selectedProductNumber >= 51 && selectedProductNumber <= 59)
            category = "5";
          else {
            // Fallback if category can't be determined
            console.error(
              `Unable to determine category for product number: ${selectedProductNumber}`
            );
            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, there was an error processing your selection. Please try again."
            );
            await sendDiscountedProductsList(phoneNumber, customer, "1"); // Default to first category
            break;
          }

          // IMPORTANT: Store selected discounted product info in dedicated fields
          customer.currentDiscountProductId = selectedProduct.id;
          customer.currentDiscountProductName = selectedProduct.name;
          customer.currentDiscountProductPrice = selectedProduct.discountPrice;
          customer.currentDiscountProductOriginalPrice =
            selectedProduct.originalPrice;
          customer.currentDiscountCategory = category;
          await customer.save();

          console.log(
            "Saved discount product ID to dedicated field:",
            customer.currentDiscountProductId
          );

          // Move to showing product details
          await customer.updateConversationState("discount_product_details");

          // Get the actual product from our database
          const product = findProductById(selectedProduct.id);
          if (product) {
            // Modify price display to show discount
            const originalProduct = { ...product };
            originalProduct.price = selectedProduct.discountPrice; // Override price with discount price

            // Send product details with discount information
            await sendProductDetails(
              phoneNumber,
              customer,
              originalProduct,
              true,
              selectedProduct.originalPrice // Pass original price to show discount
            );
          } else {
            console.error(
              `Product not found in database: ${selectedProduct.id}`
            );
            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, this product is temporarily unavailable. Please choose another option."
            );

            // Resend the discount products list for the same category
            await sendDiscountedProductsList(phoneNumber, customer, category);
          }
        } else {
          // Invalid product number
          console.log(`Invalid product selection: ${selectedProductNumber}`);

          // Determine the appropriate category for resending the list
          let fallbackCategory = "1"; // Default to first category
          if (customer.currentDiscountCategory) {
            fallbackCategory = customer.currentDiscountCategory;
          }

          // Send error message
          await sendWhatsAppMessage(
            phoneNumber,
            "Invalid selection. Please choose a product number from the list shown below."
          );

          // Resend the discount products list
          await sendDiscountedProductsList(
            phoneNumber,
            customer,
            fallbackCategory
          );
        }
        break;
      case "discount_product_details":
        // Handle buy options for discounted products
        if (text === "1") {
          // Yes, add to cart
          await customer.updateConversationState("discount_select_weight");

          console.log(
            "Using dedicated discount fields:",
            JSON.stringify(
              {
                id: customer.currentDiscountProductId,
                name: customer.currentDiscountProductName,
                price: customer.currentDiscountProductPrice,
              },
              null,
              2
            )
          );

          // CRITICAL: Use the dedicated field for discount product ID
          const discountProductId = customer.currentDiscountProductId;
          console.log("Product ID attempting to find:", discountProductId);

          if (!discountProductId) {
            console.error("Missing discount product ID in dedicated field");
            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, there was an error processing your request. Please try selecting the product again."
            );
            await sendDiscountedProductsList(phoneNumber, customer, "1"); // Default to first category
            break;
          }

          const product = findProductById(discountProductId);
          if (!product) {
            // Improved error handling with more details
            console.error(`Product not found with ID: ${discountProductId}`);

            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, we couldn't find this product in our inventory. Please try another product or contact support."
            );
            await sendDiscountedProductsList(phoneNumber, customer, "1"); // Default to first category
            break;
          }

          // Create weight selection message with discounted price
          let weightMessage = "Please select the weight option:\n\n";
          const discountPrice = customer.currentDiscountProductPrice;
          const priceRatio = discountPrice / product.price; // Calculate ratio for weight pricing

          product.weights.forEach((weight, index) => {
            // Calculate discounted weight price using the same ratio as original prices
            let weightPrice = product.price;
            if (weight.includes("5kg")) {
              weightPrice = product.price * 4.5;
            } else if (weight.includes("10kg")) {
              weightPrice = product.price * 9;
            } else if (weight.includes("50kg") || weight.includes("500g")) {
              weightPrice = product.price * 0.5;
            } else if (weight.includes("100kg") || weight.includes("100g")) {
              weightPrice = product.price * 0.2;
            }

            // Apply discount to the weight price
            weightPrice = Math.round(weightPrice * priceRatio);

            weightMessage += `${
              index + 1
            }- ${weight} - ${weightPrice}$ (DISCOUNTED)\n`;
          });

          await sendWhatsAppMessage(phoneNumber, weightMessage);
        } else if (text === "2") {
          // No, return to discount categories
          await customer.updateConversationState("discounts");

          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a discount category:\n\n" +
              "1. General\n" +
              "2. For your referral\n" +
              "3. As forman for your referral\n" +
              "4. As forman\n" +
              "5. Only for you\n\n" +
              "Type 0 to return to main menu."
          );
        } else if (text === "3") {
          // Return to main menu
          await sendMainMenu(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid option (1, 2, or 3), or type 0 to return to the main menu."
          );
        }
        break;
      case "discount_select_weight":
        // Make sure we have the discount product ID
        const discountProductId = customer.currentDiscountProductId;
        if (!discountProductId) {
          console.error("Missing discount product ID in dedicated field");
          await sendWhatsAppMessage(
            phoneNumber,
            "Sorry, there was an error processing your request. Please try selecting the product again."
          );
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        const discountProductForWeight = findProductById(discountProductId);
        if (!discountProductForWeight) {
          console.error(`Product not found with ID: ${discountProductId}`);
          await sendWhatsAppMessage(
            phoneNumber,
            "Product not found. Let's return to the main menu."
          );
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        const discountWeightIndex = parseInt(text) - 1;
        if (
          discountWeightIndex >= 0 &&
          discountWeightIndex < discountProductForWeight.weights.length
        ) {
          // Save selected weight
          customer.contextData.selectedWeight =
            discountProductForWeight.weights[discountWeightIndex];
          await customer.save();

          // Send confirmation message about the weight they've chosen
          await sendWhatsAppMessage(
            phoneNumber,
            `You have chosen ${discountProductForWeight.weights[discountWeightIndex]}. Great choice!`
          );

          // Small delay before asking for quantity
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Ask for quantity
          await customer.updateConversationState("discount_select_quantity");
          await sendWhatsAppMessage(
            phoneNumber,
            "How many bags would you like to order? Enter only in digits."
          );
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            `Please select a valid weight option (1 to ${discountProductForWeight.weights.length}), or type 0 to return to the main menu.`
          );
        }
        break;
      case "discount_select_quantity":
        const discountQuantity = parseInt(text);
        if (!isNaN(discountQuantity) && discountQuantity > 0) {
          // Save quantity
          customer.contextData.quantity = discountQuantity;
          await customer.save();

          // Add discounted product to cart
          const product = findProductById(customer.currentDiscountProductId);
          if (!product) {
            await sendWhatsAppMessage(
              phoneNumber,
              "Product not found. Let's return to the main menu."
            );
            await sendMainMenu(phoneNumber, customer);
            break;
          }

          // Use the discounted price from the dedicated field
          const discountedPrice = customer.currentDiscountProductPrice;
          const selectedWeight = customer.contextData.selectedWeight;

          // Calculate weight-specific price with discount applied
          let weightPrice = discountedPrice;
          const priceRatio = discountedPrice / product.price; // Ratio for weight pricing

          if (selectedWeight.includes("5kg")) {
            weightPrice = product.price * 4.5 * priceRatio;
          } else if (selectedWeight.includes("10kg")) {
            weightPrice = product.price * 9 * priceRatio;
          } else if (
            selectedWeight.includes("50kg") ||
            selectedWeight.includes("500g")
          ) {
            weightPrice = product.price * 0.5 * priceRatio;
          } else if (selectedWeight.includes("100g")) {
            weightPrice = product.price * 0.2 * priceRatio;
          }

          // Round to whole number for cleaner display
          weightPrice = Math.round(weightPrice);

          // Calculate total price for this item using the discounted weight-specific price
          const totalPrice = weightPrice * discountQuantity;

          // Add to cart with special flag for discounted item but proper weight formatting
          await customer.cart.items.push({
            productId: product.id,
            productName: product.name, // Remove "(DISCOUNTED)" from name
            category: customer.contextData.categoryName || product.category,
            subCategory:
              customer.contextData.subCategoryName || product.subCategory,
            weight: customer.contextData.selectedWeight.replace("1kg", "1 kg"), // Fix weight format
            quantity: discountQuantity,
            price: weightPrice, // Store the discounted weight-specific price
            originalPrice: product.price, // Store original price for reference
            totalPrice: totalPrice,
            imageUrl: product.imageUrl,
            isDiscounted: true, // We'll still track that it's discounted internally
          });
          // Update cart total
          customer.cart.totalAmount = customer.cart.items.reduce(
            (total, item) => total + item.totalPrice,
            0
          );
          await customer.save();

          // Confirm addition to cart
          await customer.updateConversationState("post_add_to_cart");
          const message = `added to your cart
  ${product.name}
  ${discountQuantity} bags (${customer.contextData.selectedWeight}) 
  for ${formatRupiah(totalPrice)} (DISCOUNTED)`;

          await sendWhatsAppMessage(phoneNumber, message);
          await sendWhatsAppMessage(
            phoneNumber,
            "\n\nWhat do you want to do next?\n\n1- View cart\n2- Proceed to pay\n3- I want to shop more (Return to shopping list)\n0- Return to main menu"
          );
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please enter a valid quantity as a positive number, or type 0 to return to the main menu."
          );
        }
        break;
      default:
        // If we don't recognize the state, reset to main menu
        await sendMainMenu(phoneNumber, customer);
        break;
    }
  } catch (error) {
    console.error("Error in processChatMessage:", error);

    // Try to send an error message and reset to main menu
    try {
      await sendWhatsAppMessage(
        phoneNumber,
        "Sorry, something went wrong. Let's start fresh from the main menu."
      );

      const customer = await Customer.findOne({ phoneNumber: phoneNumber });

      if (customer) {
        await sendMainMenu(phoneNumber, customer);
      }
    } catch (innerError) {
      console.error("Error in error handler:", innerError);
    }
  }
}

// Update the sendMainMenu function
// Update the sendMainMenu function to show the correct platform name
async function sendMainMenu(phoneNumber, customer) {
  // Send discount message first
  await sendWhatsAppMessage(
    phoneNumber,
    "🏷️ *Get 10% discount on first order straight away* 💰"
  );

  // Wait a moment to simulate natural conversation flow
  await new Promise((resolve) => setTimeout(resolve, 500));

  const menuText =
    "Main Menu:\n" +
    "1. Explore materials for shopping\n" +
    "2. My orders/History\n" +
    "3. Avail discounts\n" +
    "4. Learn about our referral program\n" +
    "5. Support\n" +
    "6. My profile\n" +
    "7. Go to my cart\n" +
    "-------------------\n" +
    "any moment (0) you come back to this menu\n" +
    "Type the number of your choice ";

  await sendWhatsAppMessage(phoneNumber, menuText);

  // Add both messages to chat history
  await customer.addToChatHistory(
    "🏷️ *Get 10% discount on first order straight away* 💰",
    "bot"
  );
  await customer.addToChatHistory(menuText, "bot");
  await customer.updateConversationState("main_menu");
}
// Ensure the function properly sends products and updates state
async function sendDiscountedProductsList(phoneNumber, customer, category) {
  console.log(`Fetching discount products for category: ${category}`);

  // First send the introduction message
  const introMessage =
    "In below the menu is a selection of discounts as a thank you for (you as beloved customer) our most popular products of your selected category:";
  await sendWhatsAppMessage(phoneNumber, introMessage);

  // Get products for this category
  const discountProducts = getDiscountProductsForCategory(category);
  console.log(
    `Found ${discountProducts.length} discount products for category ${category}`
  );

  if (discountProducts.length === 0) {
    await sendWhatsAppMessage(
      phoneNumber,
      "Sorry, there are no discounted products available in this category at the moment. Please check back later or select a different category."
    );
    return;
  }

  // Create a single product list message
  let productsMessage = "Discounted Products:\n\n";

  // Base number offset for this category
  const baseOffset =
    {
      1: 10, // General: 11-19
      2: 20, // For your referral: 21-29
      3: 30, // As forman for your referral: 31-39
      4: 40, // As forman: 41-49
      5: 50, // Only for you: 51-59
    }[category] || 10;

  // Add all products to the message with Rupiah formatting
  discountProducts.forEach((product, index) => {
    const productNumber = baseOffset + index + 1;
    const discountPercent = Math.round(
      (1 - product.discountPrice / product.originalPrice) * 100
    );

    productsMessage += `${productNumber}- ${product.name}\n`;
    productsMessage += `Price: ${formatRupiah(
      product.discountPrice
    )} (${discountPercent}% OFF! Original: ${formatRupiah(
      product.originalPrice
    )})\n\n`;
  });

  // Save the current discount category in customer data for later reference
  customer.currentDiscountCategory = category;
  await customer.save();

  // Send the product list
  await sendWhatsAppMessage(phoneNumber, productsMessage);

  // Send instruction as a separate message
  await sendWhatsAppMessage(
    phoneNumber,
    "Select a product number to view details, or type 0 to return to main menu."
  );
}
// Helper function to get discounted products for a specific category
// Helper function to get discounted products for a specific category with expanded product list
function getDiscountProductsForCategory(category) {
  console.log(
    `Fetching discount products for category: ${category}, Type: ${typeof category}`
  );

  const allDiscountProducts = [
    // General (11-19)
    {
      id: "ultra_cement",
      name: "Ultra Tech Cement",
      originalPrice: 1220,
      discountPrice: 1098, // 10% off
      category: "1",
    },
    {
      id: "rocket_cement",
      name: "Rocket Cement",
      originalPrice: 1400,
      discountPrice: 1260, // 10% off
      category: "1",
    },
    {
      id: "fast_cement",
      name: "Fast Cement",
      originalPrice: 1400,
      discountPrice: 1190, // 15% off
      category: "1",
    },
    {
      id: "white_cement",
      name: "White Cement - General Discount",
      originalPrice: 1500,
      discountPrice: 1350, // 10% off
      category: "1",
    },
    {
      id: "abc_cement",
      name: "ABC Cement - General Discount",
      originalPrice: 1300,
      discountPrice: 1170, // 10% off
      category: "1",
    },
    {
      id: "sikacryl",
      name: "SikaCryl Mix - General Discount",
      originalPrice: 950,
      discountPrice: 855, // 10% off
      category: "1",
    },
    {
      id: "red_cement",
      name: "Red Colored Cement - General Discount",
      originalPrice: 1700,
      discountPrice: 1530, // 10% off
      category: "1",
    },
    {
      id: "clay_brick_standard",
      name: "Clay Brick - General Discount",
      originalPrice: 500,
      discountPrice: 450, // 10% off
      category: "1",
    },
    {
      id: "concrete_brick_standard",
      name: "Concrete Brick - General Discount",
      originalPrice: 450,
      discountPrice: 405, // 10% off
      category: "1",
    },

    // For your referral (21-29)
    {
      id: "white_cement",
      name: "White Cement",
      originalPrice: 1500,
      discountPrice: 1275, // 15% off
      category: "2",
    },
    {
      id: "abc_cement",
      name: "ABC Cement",
      originalPrice: 1300,
      discountPrice: 1105, // 15% off
      category: "2",
    },
    {
      id: "ultra_cement",
      name: "Ultra Tech Cement - Referral",
      originalPrice: 1220,
      discountPrice: 1037, // 15% off
      category: "2",
    },
    {
      id: "rocket_cement",
      name: "Rocket Cement - Referral",
      originalPrice: 1400,
      discountPrice: 1190, // 15% off
      category: "2",
    },
    {
      id: "fast_cement",
      name: "Fast Cement - Referral",
      originalPrice: 1400,
      discountPrice: 1190, // 15% off
      category: "2",
    },
    {
      id: "sikacryl",
      name: "SikaCryl Mix - Referral",
      originalPrice: 950,
      discountPrice: 807, // 15% off
      category: "2",
    },
    {
      id: "red_cement",
      name: "Red Colored Cement - Referral",
      originalPrice: 1700,
      discountPrice: 1445, // 15% off
      category: "2",
    },
    {
      id: "clay_brick_standard",
      name: "Clay Brick - Referral",
      originalPrice: 500,
      discountPrice: 425, // 15% off
      category: "2",
    },
    {
      id: "concrete_brick_standard",
      name: "Concrete Brick - Referral",
      originalPrice: 450,
      discountPrice: 382, // 15% off
      category: "2",
    },

    // As forman for your referral (31-39)
    {
      id: "sikacryl",
      name: "SikaCryl Ready-Mix Concrete Patch",
      originalPrice: 950,
      discountPrice: 760, // 20% off
      category: "3",
    },
    {
      id: "red_cement",
      name: "Red Colored Cement",
      originalPrice: 1700,
      discountPrice: 1360, // 20% off
      category: "3",
    },
    {
      id: "ultra_cement",
      name: "Ultra Tech Cement - Forman Referral",
      originalPrice: 1220,
      discountPrice: 976, // 20% off
      category: "3",
    },
    {
      id: "rocket_cement",
      name: "Rocket Cement - Forman Referral",
      originalPrice: 1400,
      discountPrice: 1120, // 20% off
      category: "3",
    },
    {
      id: "fast_cement",
      name: "Fast Cement - Forman Referral",
      originalPrice: 1400,
      discountPrice: 1120, // 20% off
      category: "3",
    },
    {
      id: "white_cement",
      name: "White Cement - Forman Referral",
      originalPrice: 1500,
      discountPrice: 1200, // 20% off
      category: "3",
    },
    {
      id: "abc_cement",
      name: "ABC Cement - Forman Referral",
      originalPrice: 1300,
      discountPrice: 1040, // 20% off
      category: "3",
    },
    {
      id: "clay_brick_standard",
      name: "Clay Brick - Forman Referral",
      originalPrice: 500,
      discountPrice: 400, // 20% off
      category: "3",
    },
    {
      id: "concrete_brick_standard",
      name: "Concrete Brick - Forman Referral",
      originalPrice: 450,
      discountPrice: 360, // 20% off
      category: "3",
    },

    // As forman (41-49)
    {
      id: "clay_brick_standard",
      name: "Standard Clay Brick",
      originalPrice: 500,
      discountPrice: 375, // 25% off
      category: "4",
    },
    {
      id: "concrete_brick_standard",
      name: "Standard Concrete Brick",
      originalPrice: 450,
      discountPrice: 338, // 25% off
      category: "4",
    },
    {
      id: "ultra_cement",
      name: "Ultra Tech Cement - Forman",
      originalPrice: 1220,
      discountPrice: 915, // 25% off
      category: "4",
    },
    {
      id: "rocket_cement",
      name: "Rocket Cement - Forman",
      originalPrice: 1400,
      discountPrice: 1050, // 25% off
      category: "4",
    },
    {
      id: "fast_cement",
      name: "Fast Cement - Forman",
      originalPrice: 1400,
      discountPrice: 1050, // 25% off
      category: "4",
    },
    {
      id: "white_cement",
      name: "White Cement - Forman",
      originalPrice: 1500,
      discountPrice: 1125, // 25% off
      category: "4",
    },
    {
      id: "abc_cement",
      name: "ABC Cement - Forman",
      originalPrice: 1300,
      discountPrice: 975, // 25% off
      category: "4",
    },
    {
      id: "sikacryl",
      name: "SikaCryl Mix - Forman",
      originalPrice: 950,
      discountPrice: 712, // 25% off
      category: "4",
    },
    {
      id: "red_cement",
      name: "Red Colored Cement - Forman",
      originalPrice: 1700,
      discountPrice: 1275, // 25% off
      category: "4",
    },

    // Only for you (51-59)
    {
      id: "rebar_8mm",
      name: "8mm Reinforcement Bar (Rebar)",
      originalPrice: 650,
      discountPrice: 455, // 30% off
      category: "5",
    },
    {
      id: "smooth_rod_10mm",
      name: "10mm Smooth Steel Rod",
      originalPrice: 700,
      discountPrice: 490, // 30% off
      category: "5",
    },
    {
      id: "ultra_cement",
      name: "Ultra Tech Cement - VIP",
      originalPrice: 1220,
      discountPrice: 854, // 30% off
      category: "5",
    },
    {
      id: "rocket_cement",
      name: "Rocket Cement - VIP",
      originalPrice: 1400,
      discountPrice: 980, // 30% off
      category: "5",
    },
    {
      id: "fast_cement",
      name: "Fast Cement - VIP",
      originalPrice: 1400,
      discountPrice: 980, // 30% off
      category: "5",
    },
    {
      id: "white_cement",
      name: "White Cement - VIP",
      originalPrice: 1500,
      discountPrice: 1050, // 30% off
      category: "5",
    },
    {
      id: "abc_cement",
      name: "ABC Cement - VIP",
      originalPrice: 1300,
      discountPrice: 910, // 30% off
      category: "5",
    },
    {
      id: "sikacryl",
      name: "SikaCryl Mix - VIP",
      originalPrice: 950,
      discountPrice: 665, // 30% off
      category: "5",
    },
    {
      id: "red_cement",
      name: "Red Colored Cement - VIP",
      originalPrice: 1700,
      discountPrice: 1190, // 30% off
      category: "5",
    },
  ];

  // Ensure category is a string
  const categoryStr = String(category).trim();

  // Rest of the function remains the same
  const filteredProducts = allDiscountProducts.filter((product) => {
    const match = product.category === categoryStr;
    console.log(
      `Checking product: ${product.name}, Category: ${product.category}, Matches: ${match}`
    );
    return match;
  });

  console.log(`Total discount products: ${allDiscountProducts.length}`);
  console.log(
    `Products found for category ${categoryStr}: ${filteredProducts.length}`
  );

  return filteredProducts;
}

function getDiscountProductByNumber(number) {
  console.log(`Attempting to retrieve product for number: ${number}`);

  // Determine which category this number belongs to
  let category;
  if (number >= 11 && number <= 19) category = "1";
  else if (number >= 21 && number <= 29) category = "2";
  else if (number >= 31 && number <= 39) category = "3";
  else if (number >= 41 && number <= 49) category = "4";
  else if (number >= 51 && number <= 59) category = "5";
  else {
    console.log(`Invalid product number: ${number}`);
    return null;
  }

  // Get base offset for this category
  const baseOffset = {
    1: 10, // General: 11-19
    2: 20, // For your referral: 21-29
    3: 30, // As forman for your referral: 31-39
    4: 40, // As forman: 41-49
    5: 50, // Only for you: 51-59
  }[category];

  // Get the index in the category's product list
  const index = number - baseOffset - 1;

  // Get all products for this category
  const products = getDiscountProductsForCategory(category);

  console.log(
    `Category: ${category}, Base Offset: ${baseOffset}, Calculated Index: ${index}`
  );
  console.log(`Total products in category: ${products.length}`);

  // Return the product if index is valid
  if (index >= 0 && index < products.length) {
    const selectedProduct = products[index];
    console.log(`Found product: ${selectedProduct.name}`);
    console.log(`Product ID: ${selectedProduct.id}`);

    return {
      ...selectedProduct,
      category: category,
    };
  } else {
    console.log(`No product found for number ${number}`);
    return null;
  }
}

// Helper function to send categories list
async function sendCategoriesList(phoneNumber, customer) {
  let message = "What are you looking for? This is the main shopping list\n\n";

  productDatabase.categories.forEach((category, index) => {
    message += `${index + 1}. ${category.name}\n`;
  });

  // Also show cart view option
  message +=
    "\nPlease enter the category name or number to view its details.\n";
  message +=
    'Type 0 to return to main menu or type "View cart" to view your cart';

  await sendWhatsAppMessage(phoneNumber, message);
  await customer.addToChatHistory(message, "bot");
}

async function sendReferralToContact(referrerCustomer, referralImage, contact) {
  try {
    // Ensure the contact has a proper WhatsApp format
    let contactNumber = contact.phoneNumber;
    if (!contactNumber.includes("@c.us")) {
      // Add @c.us if not already present
      contactNumber = contactNumber.replace(/\D/g, "") + "@c.us";
    }

    // Validate phone number
    if (!contactNumber || contactNumber.length < 10) {
      console.error(`Invalid contact number: ${contactNumber}`);
      return;
    }

    // Ensure referrer name
    const referrerName = referrerCustomer.name || "A friend";

    // Prepare referral message
    const referralMessage =
      `Hello ${contact.name || "there"}!\n\n` +
      `${referrerName} has referred you to Construction Materials Hub! 🏗️\n\n` +
      `Join now and get 10% off your first order with referral code:\n` +
      `${
        referrerCustomer.referralCode ||
        "CM" + referrerCustomer._id.toString().substring(0, 6)
      }\n\n` +
      `Reply "hi" to start shopping!`;

    // Send the referral message
    await sendWhatsAppMessage(contactNumber, referralMessage);

    // Send the referral image with caption
    if (referralImage && referralImage.imagePath) {
      try {
        const imagePath = path.join(__dirname, "..", referralImage.imagePath);
        if (fs.existsSync(imagePath)) {
          const media = MessageMedia.fromFilePath(imagePath);
          await client.sendMessage(contactNumber, media, {
            caption: `Referral video from ${referrerName}`,
          });
        } else {
          console.error(`Image not found: ${imagePath}`);
        }
      } catch (imageError) {
        console.error("Error sending referral image:", imageError);
      }
    }

    // Update the contact status
    const imageIndex = referrerCustomer.referralImages.findIndex(
      (v) => v.imageId === referralImage.imageId
    );
    if (imageIndex !== -1) {
      const contactIndex = referrerCustomer.referralImages[
        imageIndex
      ].sharedWith.findIndex((c) => c.phoneNumber === contact.phoneNumber);

      if (contactIndex !== -1) {
        referrerCustomer.referralImages[imageIndex].sharedWith[
          contactIndex
        ].status = "sent";
        await referrerCustomer.save();
      }
    }

    // Log the successful referral
    console.log(
      `Referral sent from ${referrerName} to ${
        contact.name || "contact"
      } (${contactNumber})`
    );
  } catch (error) {
    console.error(
      `Error sending referral to ${contact.name || "contact"}:`,
      error
    );
  }
}
// Helper function to send subcategories list
async function sendSubcategoriesList(phoneNumber, customer, category) {
  let message = `You selected category: ${category.name}\n\n`;
  message +=
    "This is the product divisions under category " + category.name + "\n\n";

  category.subCategories.forEach((subCategory, index) => {
    message += `${index + 1}. ${subCategory.name}\n`;
  });

  message += "\nPlease enter the subcategory number to view its products.\n";
  message +=
    'Type 0 to return to main menu or type "View cart" to view your cart';

  await sendWhatsAppMessage(phoneNumber, message);
  await customer.addToChatHistory(message, "bot");
}

// Helper function to send products list
async function sendProductsList(phoneNumber, customer, subCategory) {
  let message = `You selected: ${subCategory.name}\n\n`;
  message += "Available products:\n\n";

  // To this:
  subCategory.products.forEach((product, index) => {
    message += `${index + 1}. ${product.name} - ${formatRupiah(
      product.price
    )}\n`;
  });

  message += "\nPlease enter the product number to view its details.\n";
  message +=
    'Type 0 to return to main menu or type "View cart" to view your cart';

  await sendWhatsAppMessage(phoneNumber, message);
  await customer.addToChatHistory(message, "bot");
}

// Modified helper function to send product details with discount information
async function sendProductDetails(
  phoneNumber,
  customer,
  product,
  askToBuy = true,
  originalPrice = null // New parameter to show discount
) {
  // Format product details
  let detailsMessage = `Details\n`;

  // Add discount information if applicable
  if (originalPrice !== null) {
    const discountPercentage = Math.round(
      (1 - product.price / originalPrice) * 100
    );
    detailsMessage += `SPECIAL DISCOUNT: ${discountPercentage}% OFF! Was ${formatRupiah(
      originalPrice
    )}, now only ${formatRupiah(product.price)}\n\n`;
  }

  detailsMessage += product.details.replace(/\n• /g, "\n• "); // Ensure bullet points have spaces

  // Try to send product image first, then details
  try {
    const imagePath = path.join(__dirname, "..", product.imageUrl);
    const defaultImagePath = path.join(__dirname, "..", "/images/product1.png");

    try {
      await sendImageWithCaption(phoneNumber, imagePath, detailsMessage);
    } catch (err) {
      await sendImageWithCaption(phoneNumber, defaultImagePath, detailsMessage);
    }
  } catch (error) {
    console.error("Error sending product image:", error);
    // Fallback to text-only
    await sendWhatsAppMessage(phoneNumber, detailsMessage);
  }

  await customer.addToChatHistory(detailsMessage, "bot");

  // If asking to buy, send a separate message with buy options
  if (askToBuy) {
    await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay between messages

    const buyOptionsMessage =
      "Do you want to buy this?\n\n" +
      "1- Yes I want to buy this add it to my cart\n" +
      "2- No return to previous menu\n" +
      "3- Return to main menu";

    await sendWhatsAppMessage(phoneNumber, buyOptionsMessage);
    await customer.addToChatHistory(buyOptionsMessage, "bot");
  }
}
// Update the goToCart function to always show the number of items and total value
async function goToCart(phoneNumber, customer) {
  if (
    !customer.cart ||
    !customer.cart.items ||
    customer.cart.items.length === 0
  ) {
    await sendWhatsAppMessage(
      phoneNumber,
      "Your cart is empty. Start shopping to add items to your cart!"
    );
    await sendMainMenu(phoneNumber, customer);
    return;
  }

  // Format cart message
  let cartMessage = `🛒 *Your Shopping Cart* 🛒 (${customer.cart.items.length} items)\n\n`;

  customer.cart.items.forEach((item, index) => {
    cartMessage += `${index + 1}. ${item.productName} (${item.weight})\n`;
    cartMessage += `   Quantity: ${item.quantity}\n`;
    cartMessage += `   Price: ${item.price} each\n`;
    cartMessage += `   Total: ${item.totalPrice}\n\n`;
  });

  cartMessage += `Subtotal: ${customer.cart.totalAmount}\n`;
  if (customer.cart.deliveryCharge > 0) {
    cartMessage += `Delivery Charge: ${customer.cart.deliveryCharge}\n`;
    cartMessage += `Total: ${
      customer.cart.totalAmount + customer.cart.deliveryCharge
    }\n\n`;
  }

  cartMessage += "What would you like to do next?\n\n";
  cartMessage += "- Delete an item\n";
  cartMessage += "- Empty my cart fully\n";
  cartMessage += "- Proceed to payment\n";
  cartMessage += "- Go back to menu\n";
  cartMessage += "- View product details\n";

  await sendWhatsAppMessage(phoneNumber, cartMessage);
  await customer.updateConversationState("cart_view");
  await customer.addToChatHistory(cartMessage, "bot");
}

function generateOrderHistoryList(customer) {
  let message = "📦 *My orders/ History* 📦\n\n";

  if (!customer.orderHistory || customer.orderHistory.length === 0) {
    message += "You haven't placed any orders yet.\n";
    return message;
  } else {
    // Sort orders by date, newest first
    const sortedOrders = [...customer.orderHistory].sort((a, b) => {
      return new Date(b.orderDate) - new Date(a.orderDate);
    });

    // Display orders from newest to oldest, with descending numbering
    sortedOrders.forEach((order, index) => {
      const orderNumber = sortedOrders.length - index; // Reverse numbering
      message += `${orderNumber}. Order #${order.orderId}\n`;
      message += `   Date: ${new Date(order.orderDate).toLocaleDateString()}\n`;
      message += `   Status: ${order.status}\n`;

      // Add delivery location info
      if (order.deliveryLocation) {
        message += `   Delivery to: ${order.deliveryLocation}\n`;
      }

      // Add address info if available
      if (order.deliveryAddress && order.deliveryAddress.nickname) {
        message += `   Address: ${order.deliveryAddress.nickname} (${
          order.deliveryAddress.area || ""
        })\n`;
      }

      // Convert to Rp
      message += `   Total: Rp ${order.totalAmount}\n\n`;
    });
  }

  return message;
}

// Helper function to format prices in Rupiah
function formatRupiah(amount) {
  return `Rp ${amount}`;
}

async function proceedToCheckout(phoneNumber, customer) {
  if (
    !customer.cart ||
    !customer.cart.items ||
    customer.cart.items.length === 0
  ) {
    await sendWhatsAppMessage(
      phoneNumber,
      "Your cart is empty. Start shopping to add items to your cart!"
    );
    await sendMainMenu(phoneNumber, customer);
    return;
  }

  // Start checkout process with delivery options
  await customer.updateConversationState("checkout_delivery");
  await sendWhatsAppMessage(
    phoneNumber,
    "Please choose your delivery option\n\n" +
      "1. Normal Delivery - Arrives in 3-5 days\n" +
      "2. Speed delivery - Arrives within 24-48 hours (+$50 extra)\n" +
      "3. Early Morning delivery- 4:00 AM-9:00 AM (+$50 extra)\n" +
      "4. ⏰🔖 Eco Delivery - 8-10 days from now (5% discount on your total bill!)\n" +
      "5. I will pickup on my own"
  );

  await customer.addToChatHistory(
    "Please choose your delivery option:\n1. Normal Delivery\n2. Speed delivery\n3. Early Morning delivery\n4. Eco Delivery (5% discount)\n5. I will pickup on my own",
    "bot"
  );
}

async function sendOrderSummary(phoneNumber, customer) {
  let message = "Your total bill will be\n\n";

  // List each item
  customer.cart.items.forEach((item, index) => {
    // Remove "DISCOUNTED" from display
    const productName = item.productName.replace(" (DISCOUNTED)", "");

    // Fix weight display format
    const weightDisplay = item.weight.replace("1kg", "1 kg");

    message += `${index + 1}. ${productName}: ${formatRupiah(
      item.totalPrice
    )} (${item.quantity} ${weightDisplay})\n`;
  });

  // Add subtotal
  message += `\nSubtotal for items: ${formatRupiah(
    customer.cart.totalAmount
  )}\n`;

  // Add delivery charge details if applicable
  if (customer.cart.deliveryCharge > 0) {
    message += `Delivery charges: ${formatRupiah(
      customer.cart.deliveryCharge
    )}`;

    // Add explanation for charges
    const deliveryDetails = [];

    if (
      customer.cart.deliveryOption === "Speed Delivery" ||
      customer.cart.deliveryOption === "Early Morning Delivery"
    ) {
      deliveryDetails.push(
        `${customer.cart.deliveryOption} fee: ${formatRupiah(50)}`
      );
    }

    if (customer.cart.deliveryLocation === "ubud") {
      deliveryDetails.push(
        `${customer.cart.deliveryLocation} location surcharge: ${formatRupiah(
          200
        )}`
      );
    }

    if (deliveryDetails.length > 0) {
      message += ` (${deliveryDetails.join(", ")})`;
    }

    message += `\n`;
  } else {
    message += `Delivery: Free\n`;
  }

  // Check if this is the customer's first order and apply discount
  let firstOrderDiscount = 0;
  if (!customer.orderHistory || customer.orderHistory.length === 0) {
    // Calculate 10% discount on non-discounted items
    const regularItems = customer.cart.items.filter(
      (item) => !item.isDiscounted
    );
    const regularItemsTotal = regularItems.reduce(
      (total, item) => total + item.totalPrice,
      0
    );
    firstOrderDiscount = Math.round(regularItemsTotal * 0.1); // 10% of regular items

    if (firstOrderDiscount > 0) {
      message += `First Order Discount (10%): -${formatRupiah(
        firstOrderDiscount
      )}\n`;
    }
  }

  // Apply Eco Delivery discount if selected
  let ecoDeliveryDiscount = 0;
  if (customer.cart.deliveryOption === "Eco Delivery") {
    ecoDeliveryDiscount = Math.round(customer.cart.totalAmount * 0.05); // 5% of total amount
    if (ecoDeliveryDiscount > 0) {
      message += `Eco Delivery Discount (5%): -${formatRupiah(
        ecoDeliveryDiscount
      )}\n`;
    }
  }

  // Store the discounts for use in checkout
  customer.cart.firstOrderDiscount = firstOrderDiscount;
  customer.cart.ecoDeliveryDiscount = ecoDeliveryDiscount;
  await customer.save();

  // Delivery information summary
  message += `Delivery option: ${customer.cart.deliveryOption}\n`;

  // Add delivery address details
  if (customer.cart.deliveryOption !== "Self Pickup") {
    if (customer.cart.deliveryAddress) {
      // Using saved address - only show nickname and area
      message += `Delivery to: ${customer.cart.deliveryAddress.nickname}\n`;
      message += `Area: ${customer.cart.deliveryLocation}\n\n`;
    } else {
      // Using just location
      message += `Delivery area: ${customer.cart.deliveryLocation}\n\n`;
    }
  }

  // Checkout options
  message += "Would you like to proceed with payment?\n\n";
  message += "1. Yes, I want to proceed with payment so checkout now\n";
  message += "2. Modify Cart\n";
  message +=
    "3. I will come back later and pay (I may want to add more or modify products)\n";
  message += "4. I don't want to continue, cancel process and empty my cart\n";

  // Calculate total with only applicable discounts
  const finalTotal =
    customer.cart.totalAmount +
    customer.cart.deliveryCharge -
    firstOrderDiscount -
    ecoDeliveryDiscount;

  // Show final total in Rupiah
  message += `\nTotal bill: ${formatRupiah(
    finalTotal
  )} (including all charges and discounts)`;

  await sendWhatsAppMessage(phoneNumber, message);
  await customer.addToChatHistory(message, "bot");
}
// Initialize WhatsApp Client
client.initialize();

// REST API Endpoint (if needed)
router.post("/webhook", async (req, res) => {
  try {
    // This endpoint could be used for external integrations
    res.status(200).send("Webhook received");
  } catch (error) {
    console.error("Error in webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});
module.exports = router;
