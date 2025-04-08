const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");
const fs = require("fs");

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

// Message handler
client.on("message", async (message) => {
  try {
    const from = message.from;
    const text = message.body;

    // Skip processing if message is from a group
    if (from.includes("@g.us")) return;

    // Process the message through the chatbot flow
    await processChatMessage(from, text, message);
  } catch (error) {
    console.error("Error handling WhatsApp message:", error);
  }
});

// Function to send WhatsApp message
async function sendWhatsAppMessage(to, content) {
  try {
    await client.sendMessage(to, content);
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
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

// Main chatbot processing function
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
            // Learn about referral program
            await customer.updateConversationState("referral");
            await sendWhatsAppMessage(
              phoneNumber,
              "🤝 *Referral Program* 🤝\n\n" +
                "Refer a friend and earn rewards!\n\n" +
                "For every friend who makes their first purchase using your referral code, you'll get 10% off your next order, and they'll get 5% off their first order.\n\n" +
                `Your referral code is: *${
                  customer.referralCode ||
                  "CM" + customer._id.toString().substring(0, 6)
                }*\n\n` +
                "Share this code with your friends and ask them to enter it when making their first purchase.\n\n" +
                "Type 0 to return to main menu."
            );
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
            const profileMessage =
              `👤 *Your Profile* 👤\n\n` +
              `Name: ${customer.name}\n` +
              `Phone: ${customer.phoneNumber}\n` +
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
              `4. Return to Main Menu`;

            await sendWhatsAppMessage(phoneNumber, profileMessage);
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

            weightMessage += `${index + 1}- ${weight} - ${weightPrice}$\n`;
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
          await sendWhatsAppMessage(
            phoneNumber,
            `${quantity} bags of ${product.name} (${customer.contextData.selectedWeight}) added to your cart for ${totalPrice}.\n\nWhat do you want to do next?\n\n1- View cart\n2- Proceed to pay\n3- I want to shop more (Return to shopping list)\n0- Return to main menu`
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
        if (["1", "2", "3", "4"].includes(text)) {
          const deliveryOptions = {
            1: "Normal Delivery",
            2: "Speed Delivery",
            3: "Early Morning Delivery",
            4: "Self Pickup",
          };

          const deliveryCharges = {
            1: 0,
            2: 50,
            3: 50,
            4: 0,
          };

          // Save delivery option
          customer.cart.deliveryOption = deliveryOptions[text];
          customer.cart.deliveryCharge = deliveryCharges[text];
          await customer.save();

          // Confirm delivery option
          if (text !== "1" && text !== "4") {
            await sendWhatsAppMessage(
              phoneNumber,
              `You've chosen ${deliveryOptions[text]}. A ${deliveryCharges[text]} charge will be added to your total.`
            );
          }

          // If self-pickup, skip location selection
          if (text === "4") {
            await customer.updateConversationState("checkout_summary");
            await sendOrderSummary(phoneNumber, customer);
          } else {
            // Ask for delivery location
            await customer.updateConversationState("checkout_location");
            await sendWhatsAppMessage(
              phoneNumber,
              "Select drop off location\n\nThese areas will be free or charge under normal delivery\n\n" +
                "1- seminyak\n" +
                "2- legian\n" +
                "3- sannur\n" +
                "4- ubud (extra charge apply 200k)"
            );
          }
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid delivery option (1, 2, 3, or 4), or type 0 to return to the main menu."
          );
        }
        break;

      case "checkout_location":
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
        break;

      case "checkout_map_location":
        // Save Google Map location (no validation here for simplicity)
        customer.contextData.locationDetails = text;
        await customer.save();

        // Show delivery charges
        let deliveryMessage = `Your delivery charges will be ${customer.cart.deliveryCharge}`;
        if (
          customer.cart.deliveryOption !== "Normal Delivery" &&
          customer.cart.deliveryOption !== "Self Pickup"
        ) {
          deliveryMessage += ` (including ${customer.cart.deliveryOption} fee)`;
        }

        await sendWhatsAppMessage(phoneNumber, deliveryMessage);

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

        // Skip the email input step and go directly to payment
        await customer.updateConversationState("checkout_payment");
        const paymentMessage =
          `Transfer ${
            customer.cart.totalAmount + customer.cart.deliveryCharge
          } to this bank account and share screenshot and transaction id with us\n\n` +
          `Bank name: Construction Bank\n` +
          `Account#: 1234-5678-9012-3456\n\n` +
          `Type "Support" if you are having any trouble regarding payment and our team will help you`;

        await sendWhatsAppMessage(phoneNumber, paymentMessage);
        break;

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

          // Send the comprehensive bank list
          const bankListMessage =
            "Which bank have you transferred from?\nHere is a list of banks:\n\n" +
            "Bank Rakyat Indonesia (BRI)\t2\n" +
            "Bank Ekspor Indonesia\t3\n" +
            "Bank Mandiri\t8\n" +
            "Bank Negara Indonesia (BNI)\t9\n" +
            "Bank Danamon Indonesia\t11\n" +
            "Bank Permata\t13\n" +
            "Bank Central Asia (BCA)\t14\n" +
            "Bank Maybank\t16\n" +
            "Bank Panin\t19\n" +
            "Bank Arta Niaga Kencana\t20\n" +
            "Bank CIMB Niaga\t22\n" +
            "Bank CIMB Niaga Syariah\t22\n" +
            "Bank UOB Indonesia\t23\n" +
            "Bank Lippo\t26\n" +
            "Bank OCBC NISP\t28\n" +
            "American Express Bank LTD\t30\n" +
            "Citibank\t31\n" +
            "JP. Morgan Chase Bank, N.A\t32\n" +
            "Bank of America, N.A\t33\n" +
            "Bank Multicor\t36\n" +
            "Bank Artha Graha\t37\n" +
            "Bank Pesona Perdania\t47\n" +
            "Bank ABN Amro\t52\n" +
            "Bank Keppel Tatlee Buana\t53\n" +
            "Bank BNP Paribas Indonesia\t57\n" +
            "Bank Woori Indonesia\t68\n" +
            "Bank Bumi Arta\t76\n" +
            "Bank Ekonomi\t87\n" +
            "Bank Haga\t89\n" +
            "Bank IFI\t93\n" +
            "Bank Century/Bank J Trust Indonesia\t95\n" +
            "Bank Mayapada\t97\n" +
            "Bank BJB\t110\n" +
            "Bank DKI\t111\n" +
            "Bank BPD D.I.Y\t112\n" +
            "Bank Jateng\t113\n" +
            "Bank Jatim\t114\n" +
            "Bank Jambi\t115\n" +
            "Bank Aceh\t116\n" +
            "Bank Sumut\t117\n" +
            "Bank Sumbar\t118\n" +
            "Bank Kepri\t119\n" +
            "Bank Sumsel dan Babel\t120\n" +
            "Bank Lampung\t121\n" +
            "Bank Kalsel\t122\n" +
            "Bank Kalbar\t123\n" +
            "Bank Kaltim\t124\n" +
            "Bank Kalteng\t125\n" +
            "Bank Sulsel\t126\n" +
            "Bank Sulut\t127\n" +
            "Bank NTB\t128\n" +
            "Bank Bali\t129\n" +
            "Bank NTT\t130\n" +
            "Bank Maluku\t131\n" +
            "Bank Papua\t132\n" +
            "Bank Bengkulu\t133\n" +
            "Bank Sulteng\t134\n" +
            "Bank Sultra\t135\n" +
            "Bank Banten\t137\n" +
            "Bank Nusantara Parahyangan\t145\n" +
            "Bank Swadesi\t146\n" +
            "Bank Muamalat\t147\n" +
            "Bank Mestika\t151\n" +
            "Bank Metro Express\t152\n" +
            "Bank Maspion\t157\n" +
            "Bank Hagakita\t159\n" +
            "Bank Ganesha\t161\n" +
            "Bank Windu Kentjana\t162\n" +
            "Bank ICBC Indonesia\t164\n" +
            "Bank Harmoni Internasional\t166\n" +
            "Bank QNB\t167\n" +
            "Bank Tabungan Negara (BTN)\t200\n" +
            "Bank Swaguna\t405\n" +
            "Bank BJB Syariah\t425\n" +
            "Bank Mega\t426\n" +
            "Bank Bukopin\t441\n" +
            "Bank Syariah Indonesia (BSI)\t451\n" +
            "Bank Bisnis Internasional\t459\n" +
            "Bank Sri Partha\t466\n" +
            "Bank KEB Hana Indonesia\t484\n" +
            "Bank MNC Internasional\t485\n" +
            "Bank Neo\t490\n" +
            "Bank BNI Agro\t494\n" +
            "Bank Nobu\t503\n" +
            "Bank Mega Syariah\t506\n" +
            "Bank Ina Perdana\t513\n" +
            "Bank Panin Dubai Syariah\t517\n" +
            "Bank Bukopin Syariah\t521\n" +
            "Bank Sahabat Sampoerna\t523\n" +
            "SeaBank\t535\n" +
            "Bank BCA Syariah\t536\n" +
            "Bank Jago\t542\n" +
            "Bank BTPN Syariah\t547\n" +
            "Bank Mayora\t553\n" +
            "Bank Index Selindo\t555\n" +
            "Bank Aladin Syariah\t947";

          // Send bank list first
          await sendWhatsAppMessage(phoneNumber, bankListMessage);

          // Send instruction as a separate message
          setTimeout(async () => {
            await sendWhatsAppMessage(
              phoneNumber,
              " Enter 1 for other banks not on the list."
            );
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter the bank number (code) from the list above "
            );
          }, 1000);
        }
        break;

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
      case "support":
        // Handle support inquiries
        if (["1", "2", "3", "4", "5"].includes(text)) {
          const supportResponses = {
            1: "For delivery issues, please provide your order number and describe the problem you're experiencing. Our delivery team will get back to you within 2 hours.",
            2: "For product questions, please specify which product you're inquiring about. Our product specialists will assist you.",
            3: "For payment problems, please describe the issue and provide any relevant transaction details. Our finance team will help resolve it.",
            4: "We're connecting you with a customer service agent. Please wait a moment.",
            5: "We're sorry to hear you have a complaint. Please describe your issue in detail, and our customer satisfaction team will address it promptly.",
          };

          await sendWhatsAppMessage(phoneNumber, supportResponses[text]);

          // After support message, return to main menu
          setTimeout(async () => {
            await sendMainMenu(phoneNumber, customer);
          }, 3000);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid support option (1-5), or type 0 to return to the main menu."
          );
        }
        break;

      case "profile":
        // Handle profile management
        if (["1", "2", "3", "4"].includes(text)) {
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
                  // This line has the issue - it's not accessing the address properties correctly

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
              // Return to main menu
              await sendMainMenu(phoneNumber, customer);
              break;
          }
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid profile option (1-4), or type 0 to return to the main menu."
          );
        }
        break;

      case "update_name":
        // Update customer name
        customer.name = text;
        await customer.save();

        await sendWhatsAppMessage(
          phoneNumber,
          `Your name has been updated to ${text}. Returning to profile...`
        );

        // Return to profile
        setTimeout(async () => {
          await customer.updateConversationState("profile");
          const profileMessage =
            `👤 *Your Profile* 👤\n\n` +
            `Name: ${customer.name}\n` +
            `Phone: ${customer.phoneNumber}\n` +
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
            `4. Return to Main Menu`;

          await sendWhatsAppMessage(phoneNumber, profileMessage);
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
            const profileMessage =
              `👤 *Your Profile* 👤\n\n` +
              `Name: ${customer.name}\n` +
              `Phone: ${customer.phoneNumber}\n` +
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
              `4. Return to Main Menu`;

            await sendWhatsAppMessage(phoneNumber, profileMessage);
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
              const profileMessage =
                `👤 *Your Profile* 👤\n\n` +
                `Name: ${customer.name}\n` +
                `Phone: ${customer.phoneNumber}\n` +
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
                `4. Return to Main Menu`;

              await sendWhatsAppMessage(phoneNumber, profileMessage);
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

          // Use the specialized sequential message sender with a 5-second delay
          await sendSequentialMessages(
            phoneNumber,
            orderListMessage,
            "Enter the order number to view details, type 'back' to return to the main menu.",
            5000 // 5 second delay between messages
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
      // Fixed order_details case - directly send both messages
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
          const orderIndex = customer.orderHistory.length - orderNumber;
          const order = sortedOrders[orderIndex];

          if (order) {
            let orderDetails = `📦 *Order #${order.orderId}* 📦\n\n`;
            orderDetails += `Date: ${new Date(
              order.orderDate
            ).toLocaleDateString()}\n`;
            orderDetails += `Status: ${order.status}\n`;
            orderDetails += `Delivery: ${order.deliveryOption}\n`;
            if (order.deliveryLocation)
              orderDetails += `Location: ${order.deliveryLocation}\n`;
            orderDetails += `Payment Status: ${order.paymentStatus}\n\n`;

            orderDetails += "Items:\n";
            order.items.forEach((item, i) => {
              orderDetails += `${i + 1}. ${item.productName} (${
                item.weight
              })\n`;
              orderDetails += `   Quantity: ${item.quantity}\n`;
              orderDetails += `   Price: ${item.price}\n`;
              orderDetails += `   Total: ${item.totalPrice}\n\n`;
            });

            orderDetails += `Delivery Charge: ${order.deliveryCharge}\n`;
            orderDetails += `Total Amount: ${order.totalAmount}\n\n`;

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
            await sendWhatsAppMessage(
              phoneNumber,
              "Enter the order number to view details, type 'back' to return to the main menu."
            );
          }
        } else if (text.toLowerCase() === "back") {
          await customer.updateConversationState("order_history");

          // Send the order list
          const orderListMessage = generateOrderHistoryList(customer);
          await sendWhatsAppMessage(phoneNumber, orderListMessage);

          // Then immediately send the instruction message (no setTimeout)
          await sendWhatsAppMessage(
            phoneNumber,
            "Enter the order number to view details, type 'back' to return to the main menu."
          );
        } else {
          await sendMainMenu(phoneNumber, customer);
        }
        break;

      case "referral":
      case "order_confirmation":
        // For these states, just return to main menu on any input
        await sendMainMenu(phoneNumber, customer);
        break;

      case "discounts":
        if (text === "0") {
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        // Check if input is a valid category selection (1-5)
        if (["1", "2", "3", "4", "5"].includes(text)) {
          // Store which discount category they selected
          if (!customer.contextData) customer.contextData = {};
          customer.contextData.discountCategory = text;
          await customer.save();

          // IMPORTANT: Update conversation state BEFORE sending products
          // This prevents multiple state handlers from processing the same input
          await customer.updateConversationState("discount_products");

          // This should be the ONLY place where sendDiscountedProductsList is called
          await sendDiscountedProductsList(phoneNumber, customer, text);
        } else {
          // Invalid selection, show options again
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid option (1-5), or type 0 to return to the main menu."
          );
        }
        break;
      case "discount_products":
        // Check if customer is trying to go back to main menu
        if (text === "0") {
          await sendMainMenu(phoneNumber, customer);
          break;
        }

        // Ensure contextData exists
        if (!customer.contextData) {
          customer.contextData = {};
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

          // Store selected discounted product info in contextData
          customer.contextData.discountProductId = selectedProduct.id;
          customer.contextData.discountProductName = selectedProduct.name;
          customer.contextData.discountProductPrice =
            selectedProduct.discountPrice;
          customer.contextData.discountProductOriginalPrice =
            selectedProduct.originalPrice;
          customer.contextData.discountCategory = category;
          await customer.save();

          // Now move to showing product details
          await customer.updateConversationState("discount_product_details");

          // Get the actual product from our database with enhanced error handling
          const product = findProductById(selectedProduct.id);
          console.log("Product ID for finding:", productId);
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
          let fallbackCategory;
          if (customer.contextData && customer.contextData.discountCategory) {
            fallbackCategory = customer.contextData.discountCategory;
          } else {
            fallbackCategory = "1"; // Default to first category if not set
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
        // Ensure contextData exists
        if (!customer.contextData) {
          customer.contextData = {};
        }

        // Handle buy options for discounted products
        if (text === "1") {
          // Yes, add to cart
          await customer.updateConversationState("discount_select_weight");

          console.log(
            "Discount Product Context:",
            JSON.stringify(customer.contextData, null, 2)
          );

          // Use the context field for product ID
          const productId = customer.contextData.discountProductId;
          console.log("Product ID attempting to find:", productId);

          const product = findProductById(productId);
          if (!product) {
            // Improved error handling with more details
            console.error(`Product not found with ID: ${productId}`);
            console.error(
              `Full context data:`,
              JSON.stringify(customer.contextData, null, 2)
            );

            await sendWhatsAppMessage(
              phoneNumber,
              "Sorry, we couldn't find this product in our inventory. Please try another product or contact support."
            );
            await sendMainMenu(phoneNumber, customer);
            break;
          }
          // Create weight selection message with discounted price
          let weightMessage = "Please select the weight option:\n\n";
          const discountPrice = customer.contextData.discountProductPrice;
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
        const discountProductForWeight = findProductById(
          customer.contextData.discountProductId
        );
        if (!discountProductForWeight) {
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
          const product = findProductById(
            customer.contextData.discountProductId
          );
          if (!product) {
            await sendWhatsAppMessage(
              phoneNumber,
              "Product not found. Let's return to the main menu."
            );
            await sendMainMenu(phoneNumber, customer);
            break;
          }

          // Use the discounted price instead of regular price
          const discountedPrice = customer.contextData.discountProductPrice;
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

          // Add to cart with special flag for discounted item
          await customer.cart.items.push({
            productId: product.id,
            productName: product.name + " (DISCOUNTED)",
            category: customer.contextData.categoryName || product.category,
            subCategory:
              customer.contextData.subCategoryName || product.subCategory,
            weight: customer.contextData.selectedWeight,
            quantity: discountQuantity,
            price: weightPrice, // Store the discounted weight-specific price
            originalPrice: product.price, // Store original price for reference
            totalPrice: totalPrice,
            imageUrl: product.imageUrl,
            isDiscounted: true,
          });

          // Update cart total
          customer.cart.totalAmount = customer.cart.items.reduce(
            (total, item) => total + item.totalPrice,
            0
          );
          await customer.save();

          // Confirm addition to cart
          await customer.updateConversationState("post_add_to_cart");
          await sendWhatsAppMessage(
            phoneNumber,
            `${discountQuantity} bags of ${product.name} (${customer.contextData.selectedWeight}) added to your cart for ${totalPrice} (DISCOUNTED).\n\nWhat do you want to do next?\n\n1- View cart\n2- Proceed to pay\n3- I want to shop more (Return to shopping list)\n0- Return to main menu`
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

      const customer = await Customer.findOne({ phoneNumber });
      if (customer) {
        await sendMainMenu(phoneNumber, customer);
      }
    } catch (innerError) {
      console.error("Error in error handler:", innerError);
    }
  }
}

// Helper function to send main menu
async function sendMainMenu(phoneNumber, customer) {
  const menuText =
    "Main Menu:\n" +
    "1. Explore materials for shopping\n" +
    "2. Check my order history\n" +
    "3. Avail discounts\n" +
    "4. Learn about our referral program\n" +
    "5. Support\n" +
    "6. My profile\n" +
    "7. Go to my cart\n" +
    "-------------------\n" +
    "any moment (0) you come back to this menu\n\n Type the number of your choice ";
  +(await sendWhatsAppMessage(phoneNumber, menuText));
  await customer.addToChatHistory(menuText, "bot");
  await customer.updateConversationState("main_menu");
}

// Helper function to send the discounted products list
// Helper function to send the discounted products list
async function sendDiscountedProductsList(phoneNumber, customer, category) {
  // First send the introduction message
  const introMessage =
    "In below the menu is a selection of discounts as a thank you for (you as beloved customer) our most popular products of your selected category:";
  await sendWhatsAppMessage(phoneNumber, introMessage);

  // Get base number offset for this category
  const baseOffset =
    {
      1: 10, // General: 11-19
      2: 20, // For your referral: 21-29
      3: 30, // As forman for your referral: 31-39
      4: 40, // As forman: 41-49
      5: 50, // Only for you: 51-59
    }[category] || 10;

  // Get products for this category
  const discountProducts = getDiscountProductsForCategory(category);

  if (discountProducts.length === 0) {
    await sendWhatsAppMessage(
      phoneNumber,
      "Sorry, there are no discounted products available in this category at the moment. Please check back later or select a different category."
    );
    return;
  }

  // Create a single product list message
  let productsMessage = "Discounted Products:\n\n";

  // Add all products to the message
  discountProducts.forEach((product, index) => {
    const productNumber = baseOffset + index + 1;
    const discountPercent = Math.round(
      (1 - product.discountPrice / product.originalPrice) * 100
    );

    productsMessage += `${productNumber}- ${product.name}\n`;
    productsMessage += `Price: ${product.discountPrice}$ (${discountPercent}% OFF! Original: ${product.originalPrice}$)\n\n`;
  });

  // ONLY SEND ONCE
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

    // CRITICAL: Explicitly set the ID from the base product
    const baseProduct = findProductById(selectedProduct.id);
    if (baseProduct) {
      return {
        ...selectedProduct,
        id: baseProduct.id, // Ensure the correct product ID is used
      };
    }

    return selectedProduct;
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

  // List all products with simple numbering
  subCategory.products.forEach((product, index) => {
    message += `${index + 1}. ${product.name} - ${product.price}$\n`;
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
    detailsMessage += `SPECIAL DISCOUNT: ${discountPercentage}% OFF! Was ${originalPrice}$, now only ${product.price}$\n\n`;
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
// Helper function to go to cart
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
  let cartMessage = "🛒 *Your Shopping Cart* 🛒\n\n";

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
  let message = "📦 *Your Order History* 📦\n\n";
  let message2 = "";

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
      message += `   Total: ${order.totalAmount}\n\n`;
    });
  }

  message2 +=
    "Enter the order number to view details, type 'back' to return to the main menu.";

  return message;
}

// Helper function to proceed to checkout
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
      "4. I will pickup on my own"
  );

  await customer.addToChatHistory(
    "Please choose your delivery option:\n1. Normal Delivery\n2. Speed delivery\n3. Early Morning delivery\n4. I will pickup on my own",
    "bot"
  );
}

// This goes in the sendOrderSummary function, before calculating the final total
async function sendOrderSummary(phoneNumber, customer) {
  let message = "Your total bill will be\n\n";

  // List each item
  customer.cart.items.forEach((item, index) => {
    message += `${index + 1}. ${item.productName}: ${item.totalPrice} (${
      item.quantity
    } ${item.weight})\n`;
  });

  // Add subtotal
  message += `\nSubtotal for items: ${customer.cart.totalAmount}\n`;

  // Add delivery charge details if applicable
  if (customer.cart.deliveryCharge > 0) {
    message += `Delivery charges: ${customer.cart.deliveryCharge}`;

    // Add explanation for charges
    const deliveryDetails = [];

    if (
      customer.cart.deliveryOption === "Speed Delivery" ||
      customer.cart.deliveryOption === "Early Morning Delivery"
    ) {
      deliveryDetails.push(`${customer.cart.deliveryOption} fee: 50`);
    }

    if (customer.cart.deliveryLocation === "ubud") {
      deliveryDetails.push(
        `${customer.cart.deliveryLocation} location surcharge: 200`
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
      message += `First Order Discount (10%): -${firstOrderDiscount}\n`;
    }
  }

  // Total bill with delivery charge and discounts included
  const finalTotal =
    customer.cart.totalAmount +
    customer.cart.deliveryCharge -
    firstOrderDiscount;
  message += `\nTotal bill: ${finalTotal} (including all charges and discounts)\n\n`;

  // Store the first order discount for use in checkout
  customer.cart.firstOrderDiscount = firstOrderDiscount;
  await customer.save();

  // Delivery information summary
  message += `Delivery option: ${customer.cart.deliveryOption}\n`;
  if (customer.cart.deliveryLocation) {
    message += `Delivery area: ${customer.cart.deliveryLocation}\n\n`;
  }

  // Checkout options
  message += "Would you like to proceed with payment?\n\n";
  message += "1. Yes, I want to proceed with payment so checkout now\n";
  message += "2. Modify order\n";
  message +=
    "3. I will come back later and pay (I may want to add more or modify products)\n";
  message += "4. I don't want to continue, cancel process and empty my cart";

  await sendWhatsAppMessage(phoneNumber, message);
  await customer.addToChatHistory(message, "bot");
}
// Modified createOrder function to include the first-order discount
async function createOrder(customer) {
  // Generate a unique order ID
  const orderId = "ORD" + Date.now().toString().slice(-8);

  // Create the order
  const newOrder = {
    orderId: orderId,
    items: [...customer.cart.items],
    totalAmount:
      customer.cart.totalAmount +
      customer.cart.deliveryCharge -
      (customer.cart.firstOrderDiscount || 0),
    deliveryOption: customer.cart.deliveryOption,
    deliveryLocation: customer.cart.deliveryLocation,
    deliveryCharge: customer.cart.deliveryCharge,
    firstOrderDiscount: customer.cart.firstOrderDiscount || 0,
    paymentStatus: "pending",
    status: "confirmed",
    paymentMethod: "Bank Transfer",
    transactionId: customer.contextData.transactionId || "Pending verification",
    orderDate: new Date(),
    deliveryDate: new Date(
      Date.now() +
        (customer.cart.deliveryOption === "Speed Delivery" ? 2 : 5) *
          24 *
          60 *
          60 *
          1000
    ),
  };

  // Add order to customer's history
  customer.orderHistory.push(newOrder);

  // Empty the cart
  customer.cart.items = [];
  customer.cart.totalAmount = 0;
  customer.cart.deliveryCharge = 0;
  customer.cart.firstOrderDiscount = 0;
  customer.cart.deliveryOption = "Normal Delivery";
  customer.cart.deliveryLocation = "";

  await customer.save();

  return orderId;
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
