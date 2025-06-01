const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");
const fs = require("fs");
const moment = require("moment");
const Category = require("../models/Category");
const Product = require("../models/Product");
const mkdirp = require("mkdirp"); // You might need to install this: npm install mkdirp

// At the top of your file, add:
const referralImagesDir = path.join(__dirname, "../referral_images");
mkdirp.sync(referralImagesDir);

const Counter = mongoose.model(
  "Counter",
  new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  })
);

async function getNextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

// ─── When someone adds to cart, push a single "cart-not-paid" order ────────────
async function recordCartOrder(customer) {
  const seq = await getNextSequence("orderId");
  const orderId = "ORD" + (10000 + seq);

  // snapshot of cart
  const total = customer.cart.items.reduce((sum, i) => sum + i.totalPrice, 0);

  const cartOrder = {
    orderId,
    items: [...customer.cart.items],
    totalAmount: total,
    deliveryType: customer.cart.deliveryType,
    deliveryLocation: customer.cart.deliveryLocation,
    deliveryCharge: customer.cart.deliveryCharge,
    paymentStatus: "pending",
    status: "cart-not-paid",
    orderDate: new Date(),
    deliveryDate: null,
  };

  customer.orderHistory.push(cartOrder);

  // ← NEW
  customer.latestOrderId = orderId;
  customer.currentOrderStatus = "cart-not-paid";

  await customer.save();
}

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

// ─── Categories Menu ────────────────────────────────────────────────────────────
async function sendCategoriesList(phoneNumber, customer) {
  const categories = await Category.find({});
  let msg = "What are you looking for? This is the main shopping list\n\n";

  // store IDs for later mapping
  customer.contextData = customer.contextData || {};
  customer.contextData.categoryList = categories.map((c) => c._id.toString());

  categories.forEach((cat, idx) => {
    msg += `${idx + 1}. ${cat.name}\n`;
  });

  msg +=
    `\nPlease enter the category name or number to view its details.` +
    `\nType 0 to return to main menu or type "View cart" to view your cart`;

  await sendWhatsAppMessage(phoneNumber, msg);
  await customer.save();
}

// ─── Subcategories Menu ────────────────────────────────────────────────────────
async function sendSubcategoriesList(phoneNumber, customer, category) {
  const subcats = Array.isArray(category.subcategories)
    ? category.subcategories
    : [];

  customer.contextData.subcategoryList = subcats;
  await customer.save();

  // if no subcats, jump straight to products
  if (subcats.length === 0) {
    await customer.updateConversationState("product_list");
    return sendProductsList(phoneNumber, customer, category.name);
  }

  let msg = `You selected category: ${category.name}\n\n`;
  msg += `This is the product divisions under category ${category.name}\n\n`;

  subcats.forEach((sub, idx) => {
    msg += `${idx + 1}. ${sub}\n`;
  });

  msg +=
    `\nPlease enter the subcategory number to view its products.` +
    `\nType 0 to return to main menu or type "View cart" to view your cart`;

  await sendWhatsAppMessage(phoneNumber, msg);
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

const sharp = require("sharp");

// Function to convert image into the required format (e.g., JPEG or PNG)
const convertImage = async (imageBuffer) => {
  try {
    const convertedImage = await sharp(imageBuffer)
      .resize({ width: 800 }) // Optional: Resize image if needed
      .toFormat("jpeg") // Convert image to JPEG format
      .toBuffer(); // Convert to buffer
    return convertedImage;
  } catch (error) {
    console.error("Error converting image:", error);
    throw new Error("Error converting image");
  }
};
// ─── At final checkout, bump to "order-made-not-paid" ─────────────────────────
async function createOrder(customer) {
  const seq = await getNextSequence("orderId");
  const orderId = "ORD" + (10000 + seq);

  const totalWithDiscounts =
    customer.cart.totalAmount +
    customer.cart.deliveryCharge -
    (customer.cart.firstOrderDiscount || 0) -
    (customer.cart.ecoDeliveryDiscount || 0);

  const newOrder = {
    orderId,
    items: [...customer.cart.items],
    totalAmount: totalWithDiscounts,
    deliveryType: customer.cart.deliveryType,
    deliveryLocation: customer.cart.deliveryLocation,
    deliveryCharge: customer.cart.deliveryCharge,
    firstOrderDiscount: customer.cart.firstOrderDiscount || 0,
    ecoDeliveryDiscount: customer.cart.ecoDeliveryDiscount || 0,
    paymentStatus: "pending",
    status: "order-made-not-paid",
    paymentMethod: "Bank Transfer",
    transactionId: customer.contextData.transactionId || "Pending verification",
    orderDate: new Date(),
    deliveryDate: new Date(
      Date.now() +
        (customer.cart.deliveryType === "Speed Delivery"
          ? 2
          : customer.cart.deliveryType === "Normal Delivery"
          ? 5
          : customer.cart.deliveryType === "Eco Delivery"
          ? 10
          : /* fallback: */ 5) *
          24 *
          60 *
          60 *
          1000
    ),
  };

  customer.orderHistory.push(newOrder);

  // ← NEW
  customer.latestOrderId = orderId;
  customer.currentOrderStatus = "order-made-not-paid";

  // clear customer.cart & context
  customer.cart = {
    items: [],
    totalAmount: 0,
    deliveryCharge: 0,
    deliveryType: "Normal Delivery",
    deliveryLocation: "",
    firstOrderDiscount: 0,
    ecoDeliveryDiscount: 0,
  };
  customer.contextData = {};

  await customer.save();
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

      // if not already imported

      // Check if we should send a pickup reminder
      if (
        customer.pickupPlan &&
        customer.pickupPlan.date === moment().format("YYYY-MM-DD") &&
        customer.cart.deliveryType === "self_pickup" &&
        !customer.pickupPlan.reminderSent
      ) {
        const timeSlot = customer.pickupPlan.timeSlot || "any time today";

        const lastOrder =
          customer.orderHistory?.[customer.orderHistory.length - 1];

        await sendWhatsAppMessage(
          customer.phoneNumber[0],
          `📦 *Pickup Reminder!* 📦\n\n` +
            `Hi ${customer.name}, just a reminder that your order is ready for pickup *today* between *${timeSlot}*.\n\n` +
            `Order ID: #${lastOrder?.orderId || "unknown"}\n\n` +
            `If you need help, just reply with *support* anytime.`
        );

        // Mark reminder as sent
        customer.pickupPlan.reminderSent = true;
        await customer.save();
      }

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
              `4. My Account \n` +
              `5. Manage Bank Accounts\n` +
              `6. Return to Main Menu`;

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
        // if first time in this state, we have no categoryList yet
        if (!customer.contextData.categoryList) {
          await sendCategoriesList(phoneNumber, customer);
        } else {
          const idx = parseInt(text, 10) - 1;
          const ids = customer.contextData.categoryList;
          if (idx >= 0 && idx < ids.length) {
            const selId = ids[idx];
            const category = await Category.findById(selId);
            customer.contextData.categoryId = selId;
            customer.contextData.categoryName = category.name;
            await customer.save();

            await customer.updateConversationState("shopping_subcategories");
            await sendSubcategoriesList(phoneNumber, customer, category);
          } else if (text.toLowerCase() === "view cart") {
            return goToCart(phoneNumber, customer);
          } else {
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a valid category number, 'view cart', or 0 for main menu."
            );
          }
        }
        break;

      case "shopping_subcategories":
        const idxSub = parseInt(text) - 1;
        const subList = customer.contextData.subcategoryList || [];
        if (idxSub >= 0 && idxSub < subList.length) {
          const selSub = subList[idxSub];
          customer.contextData.subCategoryName = selSub;
          await customer.save();
          await customer.updateConversationState("product_list");
          await sendProductsList(phoneNumber, customer, selSub);
        } else if (text.toLowerCase() === "view cart") {
          await goToCart(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid subcategory number, type 'view cart' or 0 for main menu."
          );
        }
        break;

      case "product_list":
        const idxProd = parseInt(text) - 1;
        const prodList = customer.contextData.productList || [];
        if (idxProd >= 0 && idxProd < prodList.length) {
          const selProdId = prodList[idxProd];
          const product = await Product.findById(selProdId);
          customer.contextData.productId = selProdId;
          customer.contextData.productName = product.productName;
          await customer.save();
          await customer.updateConversationState("product_details");
          await sendProductDetails(phoneNumber, customer, product);
        } else if (text.toLowerCase() === "view cart") {
          await goToCart(phoneNumber, customer);
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please select a valid product number, type 'view cart' or 0 for main menu."
          );
        }
        break;
      case "product_details":
        // user answered “1- Add to cart”
        if (text === "1") {
          // fetch the real product
          const product = await Product.findById(
            customer.contextData.productId
          );
          if (!product) {
            await sendWhatsAppMessage(
              phoneNumber,
              "Oops, I can’t find that product right now. Let’s start over."
            );
            return sendMainMenu(phoneNumber, customer);
          }

          // if it’s a Child product, go ask for weight
          if (product.productType === "Child") {
            // build weight options from all child variants under the same parent
            const siblingVariants = await Product.find(
              {
                parentProduct: product.parentProduct,
                productType: "Child",
                visibility: "Public",
              },
              "varianceName priceAfterDiscount specifications.weight"
            );

            let weightMsg = `Please pick the weight option :\n\n`;
            siblingVariants.forEach((v, i) => {
              const w = v.specifications?.[0]?.weight ?? "N/A";
              const price = v.priceAfterDiscount ?? "N/A";
              weightMsg += `${i + 1}. ${w}kg    -${price}rp\n`;
            });

            customer.contextData.weightOptions = siblingVariants.map((v) =>
              v._id.toString()
            );
            await customer.save();
            await customer.updateConversationState("select_weight");
            return sendWhatsAppMessage(phoneNumber, weightMsg);
          }

          // otherwise it’s a Normal (no‐weight) product: straight to quantity
          await customer.updateConversationState("select_quantity");
          await sendWhatsAppMessage(
            phoneNumber,
            `How many *${product.productName}* would you like? (Enter a number)`
          );
          return;
        }

        // user wants to go back…
        if (text === "2") {
          await customer.updateConversationState("shopping_subcategories");
          const cat = await Category.findById(customer.contextData.categoryId);
          return sendSubcategoriesList(phoneNumber, customer, cat);
        }
        if (text === "3") {
          await customer.updateConversationState("shopping_categories");
          return sendCategoriesList(phoneNumber, customer);
        }

        // invalid input
        return sendWhatsAppMessage(
          phoneNumber,
          "Invalid choice. Reply 1 to add to cart, 2 for subcategories, 3 for categories, or 0 for main menu."
        );

      case "select_weight": {
        const idxW = parseInt(text, 10) - 1;
        const weights = customer.contextData.weightOptions || [];

        // On valid choice, show the same menu style
        if (idxW >= 0 && idxW < weights.length) {
          const chosenId = weights[idxW];
          const chosenVar = await Product.findById(chosenId);

          customer.contextData.productId = chosenId;
          customer.contextData.selectedWeight = chosenVar.varianceName;
          await customer.save();

          // Echo back exactly as in your screenshot
          await sendWhatsAppMessage(
            phoneNumber,
            `You have chosen ${chosenVar.varianceName} pack. Great choice!`
          );
          await customer.updateConversationState("select_quantity");
          return sendWhatsAppMessage(
            phoneNumber,
            "How many bags would you like to order? Enter only in digits."
          );
        }

        if (text === "0") {
          // cancel weight, back to product details
          await customer.updateConversationState("product_details");
          const prod = await Product.findById(customer.contextData.productId);
          return sendProductDetails(phoneNumber, customer, prod);
        }

        // Build the exact same weight menu you showed
        let msg = "Please select the weight option:\n\n";
        const siblingVariants = await Product.find({
          parentProduct: customer.contextData.parentProduct,
          productType: "Child",
          visibility: "Public",
        });
        siblingVariants.forEach((v, i) => {
          const w = v.specifications?.[0]?.weight ?? "";
          const p = v.priceAfterDiscount ?? 0;
          msg += `${i + 1}- ${w} pack - Rp ${p}\n`;
        });

        return sendWhatsAppMessage(
          phoneNumber,
          msg.trim() // remove trailing newline
        );
      }

      case "select_quantity": {
        const buyQty = parseInt(text, 10);
        if (Number.isInteger(buyQty) && buyQty > 0) {
          const finalProd = await Product.findById(
            customer.contextData.productId
          );
          const unitPrice = finalProd.priceAfterDiscount || 0;
          const totalLine = unitPrice * buyQty;

          // 1) Push item into cart
          const weightLabel = customer.contextData.selectedWeight || "";
          customer.cart.items.push({
            productId: finalProd._id.toString(),
            productName: finalProd.productName,
            weight: weightLabel,
            quantity: buyQty,
            price: unitPrice,
            totalPrice: totalLine,
            imageUrl: finalProd.masterImage,
          });
          customer.cart.totalAmount = customer.cart.items.reduce(
            (sum, i) => sum + i.totalPrice,
            0
          );
          await customer.save();

          // 2) Record a new “cart-not-paid” order immediately
          await recordCartOrder(customer);

          // 3) Move to post_add_to_cart state
          await customer.updateConversationState("post_add_to_cart");

          // 4) Confirmation message
          const addedMsg =
            `added to your cart:\n` +
            `${finalProd.productName}\n` +
            `${buyQty} bags\n` +
            `for ${formatRupiah(totalLine)}`;
          await sendWhatsAppMessage(phoneNumber, addedMsg);

          // 5) Next menu
          return sendWhatsAppMessage(
            phoneNumber,
            "\nWhat do you want to do next?\n" +
              "1- View cart\n" +
              "2- Proceed to pay\n" +
              "3- Shop more (return to shopping list)\n" +
              "0- Main menu"
          );
        }

        return sendWhatsAppMessage(
          phoneNumber,
          "Please enter a valid quantity (a positive number), or 0 for main menu."
        );
      }

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
      case "pickup_date_select": {
        await customer.updateConversationState("pickup_date_main");

        break;
      }

      case "pickup_date_main": {
        if (!["1", "2", "3"].includes(text.trim())) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Please choose a valid option:\n1. Today\n2. Tomorrow\n3. Later"
          );
          return;
        }

        const today = moment().format("YYYY-MM-DD");
        const tomorrow = moment().add(1, "day").format("YYYY-MM-DD");

        switch (text.trim()) {
          case "1":
            customer.pickupPlan = { date: today };
            break;
          case "2":
            customer.pickupPlan = { date: tomorrow };
            break;
          case "3":
            // Go to extended 13-day calendar
            const dateOptions = [];
            for (let i = 0; i < 13; i++) {
              dateOptions.push(moment().add(i, "days"));
            }

            customer.pickupDateList = dateOptions.map((d) =>
              d.format("YYYY-MM-DD")
            );
            await customer.save();

            let msg = "📅 *Select a pickup date (from the next 13 days):*\n";
            msg += "--------------------------------------------\n";
            dateOptions.forEach((date, index) => {
              if (index === 0) {
                msg += `${index + 1}. Today\n`;
              } else if (index === 1) {
                msg += `${index + 1}. Tomorrow\n`;
              } else {
                msg += `${index + 1}. ${date.format("Do MMMM (ddd)")}\n`;
              }
            });

            await customer.updateConversationState(
              "pickup_date_select_confirm"
            );
            await sendWhatsAppMessage(phoneNumber, msg);
            return;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "❌ Invalid selection. Please choose 1 (Today), 2 (Tomorrow), or 3 (Later)."
            );
            return;
        }

        await customer.updateConversationState("pickup_time_select");

        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Got it! You're picking up on *${customer.pickupPlan.date}*.\n\n` +
            `🕒 Now select your preferred pickup time slot:\n\n` +
            `1. 6 AM – 9 AM\n` +
            `2. 9 AM – 12 PM\n` +
            `3. 12 PM – 3 PM\n` +
            `4. 3 PM – 6 PM\n` +
            `5. 6 PM – 9 PM`
        );
        break;
      }
      case "pickup_date_select_confirm": {
        console.log("🚨 [pickup_date_select_confirm] Raw text:", text);

        const idx = parseInt(text.trim()) - 1;
        console.log("📍 Parsed index:", idx);
        console.log("📍 customer.pickupDateList:", customer.pickupDateList);

        if (
          !customer.pickupDateList ||
          !Array.isArray(customer.pickupDateList)
        ) {
          console.log("❌ pickupDateList is missing or not an array");
          await sendWhatsAppMessage(
            phoneNumber,
            "⚠️ Something went wrong (date list missing). Please type *menu* and try again."
          );
          return;
        }

        if (isNaN(idx) || idx < 0 || idx >= customer.pickupDateList.length) {
          console.log("❌ Invalid index selected:", idx);
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Please select a valid number from the list (1–13)."
          );
          return;
        }

        const selectedDate = customer.pickupDateList[idx];
        console.log("✅ Selected date from list:", selectedDate);

        customer.pickupPlan.date = selectedDate;
        customer.pickupDateList = []; // cleanup
        await customer.save();

        await customer.updateConversationState("pickup_time_select");

        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Got it! You're picking up on *${customer.pickupPlan.date}*.\n\n` +
            `🕒 Now select your preferred pickup time slot:\n\n` +
            `1. 6 AM – 9 AM\n` +
            `2. 9 AM – 12 PM\n` +
            `3. 12 PM – 3 PM\n` +
            `4. 3 PM – 6 PM\n` +
            `5. 6 PM – 9 PM`
        );
        break;
      }

      case "pickup_time_select": {
        const timeOptions = {
          1: "6 AM – 9 AM",
          2: "9 AM – 12 PM",
          3: "12 PM – 3 PM",
          4: "3 PM – 6 PM",
          5: "6 PM – 9 PM",
        };

        const timeSlot = timeOptions[text.trim()];
        if (!timeSlot) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Please select a valid time slot (1–5)."
          );
          return;
        }

        customer.pickupPlan.timeSlot = timeSlot;

        const lastOrder =
          customer.orderHistory[customer.orderHistory.length - 1];

        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Your order is in progress and will be confirmed once payment is verified!\n\n` +
            `🧾 Order ID: *#${lastOrder.orderId}*\n` +
            `📦 We'll expect you on *${customer.pickupPlan.date}* between *${timeSlot}*.\n\n` +
            `Thank you for shopping with us! 😊`
        );

        await customer.updateConversationState("main_menu");
        await sendMainMenu(phoneNumber, customer);
        break;
      }

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
        if (["1", "2", "3", "4", "5", "6", "7"].includes(text)) {
          const deliveryOptions = {
            1: "Normal Delivery",
            2: "Speed Delivery",
            3: "Early Morning Delivery",
            4: "Eco Delivery",
            5: "Self Pickup",
            6: "Normal Scooter Delivery",
            7: "Direct Speed Scooter Delivery",
          };
          const deliveryCharges = {
            1: 0,
            2: 50,
            3: 50,
            4: 0,
            5: 0,
            6: 20,
            7: 40,
          };

          // Figure out type/speed
          let deliveryType, deliverySpeed;
          switch (text) {
            case "1":
              deliveryType = "truck";
              deliverySpeed = "normal";
              break;
            case "2":
              deliveryType = "truck";
              deliverySpeed = "speed";
              break;
            case "3":
              deliveryType = "truck";
              deliverySpeed = "early_morning";
              break;
            case "4":
              deliveryType = "truck";
              deliverySpeed = "eco";
              break;
            case "5":
              deliveryType = "self_pickup";
              deliverySpeed = "normal";
              break;
            case "6":
              deliveryType = "scooter";
              deliverySpeed = "normal";
              break;
            case "7":
              deliveryType = "scooter";
              deliverySpeed = "speed";
              break;
          }

          // write into the *current* orderHistory entry
          const idx = customer.orderHistory.findIndex(
            (o) => o.orderId === customer.latestOrderId
          );
          if (idx >= 0) {
            customer.orderHistory[idx].deliveryType = deliveryType;
            customer.orderHistory[idx].deliverySpeed = deliverySpeed;
            customer.orderHistory[idx].deliveryOption = deliveryOptions[text];
            customer.orderHistory[idx].deliveryCharge = deliveryCharges[text];
            // if you also want to update ecoDiscount on the order itself:
            customer.orderHistory[idx].ecoDeliveryDiscount =
              text === "4" ? customer.cart.totalAmount * 0.05 : 0;
          }

          await customer.save();

          // Confirm back to user
          if (["2", "3"].includes(text)) {
            await sendWhatsAppMessage(
              phoneNumber,
              `You've chosen ${deliveryOptions[text]}. A ${formatRupiah(
                deliveryCharges[text]
              )} charge will be added.`
            );
          } else if (text === "4") {
            await sendWhatsAppMessage(
              phoneNumber,
              `You've chosen ${deliveryOptions[text]}. 5% eco‐discount applied! Delivery in 8–10 days.`
            );
            await customer.updateConversationState(
              "checkout_eco_delivery_date"
            );
            await sendWhatsAppMessage(
              phoneNumber,
              "Please select a delivery date for your Eco Delivery (8-10 days from now).\n\nFormat: YYYY-MM-DD"
            );
            return; // bail early
          } else {
            await sendWhatsAppMessage(
              phoneNumber,
              `You've chosen ${deliveryOptions[text]}.`
            );
          }

          // advance the flow
          if (text === "5") {
            await customer.updateConversationState("checkout_summary");
            await sendOrderSummary(phoneNumber, customer);
          } else {
            await customer.updateConversationState("checkout_location");
            const locPrompt = customer.addresses?.length
              ? "Select a drop-off location or type 'saved' to use a saved address."
              : "Select drop-off location:\n1- Seminyak\n2- Legian\n3- Sanur\n4- Ubud (extra charge 200k)";
            await sendWhatsAppMessage(phoneNumber, locPrompt);
          }
        } else {
          // invalid choice
          await sendWhatsAppMessage(
            phoneNumber,
            "Please choose a valid delivery option (1–7), or type 0 to return to main menu."
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
          customer.cart.deliveryType !== "Normal Delivery" &&
          customer.cart.deliveryType !== "self_pickup"
        ) {
          deliveryMessage += ` (including ${customer.cart.deliveryType} fee)`;
        }

        await sendWhatsAppMessage(phoneNumber, deliveryMessage);

        // Proceed directly to order summary
        await customer.updateConversationState("checkout_summary");
        await sendOrderSummary(phoneNumber, customer);
        break;
      // Modified checkout_map_location case to properly save Google Maps link
      case "checkout_map_location":
        // Basic validation for Google Maps link
        if (
          !text.includes("maps.google") &&
          !text.includes("goo.gl") &&
          !text.startsWith("https://maps")
        ) {
          await sendWhatsAppMessage(
            phoneNumber,
            "Please send a valid Google Maps link. It should include 'maps.google' or similar."
          );
          return;
        }

        // First, save to contextData for backward compatibility
        customer.contextData.locationDetails = text;

        // Check if customer has active delivery address in cart
        if (!customer.cart.deliveryAddress) {
          // Initialize deliveryAddress object if it doesn't exist
          customer.cart.deliveryAddress = {
            nickname: "Current Address",
            area: customer.cart.deliveryLocation || "",
            fullAddress: "",
            googleMapLink: text,
          };
        } else {
          // Update the existing deliveryAddress with the Google Maps link
          customer.cart.deliveryAddress.googleMapLink = text;
        }

        // Also update the corresponding saved address if it matches the current delivery location
        if (
          customer.addresses &&
          customer.addresses.length > 0 &&
          customer.cart.deliveryLocation
        ) {
          const matchingAddressIndex = customer.addresses.findIndex(
            (addr) =>
              addr.area &&
              addr.area.toLowerCase() ===
                customer.cart.deliveryLocation.toLowerCase()
          );

          if (matchingAddressIndex >= 0) {
            customer.addresses[matchingAddressIndex].googleMapLink = text;
          }
        }

        await customer.save();

        // Confirm the Google Maps link was saved
        await sendWhatsAppMessage(
          phoneNumber,
          "Thank you! Your location has been saved."
        );

        // Proceed to order summary
        await customer.updateConversationState("checkout_summary");
        await sendOrderSummary(phoneNumber, customer);
        break;
      // ─── CASE: checkout_summary ─────────────────────────────────
      case "checkout_summary":
        {
          // Move into the "waiting for receipt" step
          await customer.updateConversationState("checkout_wait_receipt");

          // Prompt for the screenshot
          await sendWhatsAppMessage(
            phoneNumber,
            "📸 Please send a screenshot of your payment transfer receipt to continue."
          );
          await sendWhatsAppMessage(
            phoneNumber,
            "💡 Make sure the *bank name*, *account holder*, and *amount paid* are clearly visible."
          );
        }
        break;
      case "checkout_wait_receipt":
        {
          // Ensure the received message is an image
          if (message.type !== "image") {
            await sendWhatsAppMessage(
              phoneNumber,
              "❗ You must send a screenshot of your payment receipt to proceed."
            );
            break;
          }

          // Acknowledge receipt of the image
          await sendWhatsAppMessage(
            phoneNumber,
            "✅ Receipt received, processing your payment..."
          );

          try {
            // For WhatsApp Web, we need to download the image data first
            const media = await message.downloadMedia();

            if (!media || !media.data) {
              await sendWhatsAppMessage(
                phoneNumber,
                "❌ Error: Could not download your receipt image. Please try again."
              );
              break;
            }

            // Convert the buffer to a base64 string and format it
            const base64Image = `data:${
              media.mimetype
            };base64,${media.data.toString("base64")}`;

            // Check if we have a valid order ID, if not, find the most recent order
            if (
              !customer.contextData.latestOrderId &&
              customer.orderHistory.length > 0
            ) {
              const recentOrders = [...customer.orderHistory].sort(
                (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
              );

              if (recentOrders.length > 0) {
                customer.contextData.latestOrderId = recentOrders[0].orderId;
                console.log(
                  `Found most recent order: ${customer.contextData.latestOrderId}`
                );
              }
            }

            // Try to find the order with the ID
            const idxPay = customer.orderHistory.findIndex(
              (o) => o.orderId === customer.contextData.latestOrderId
            );

            if (idxPay >= 0) {
              // Store the image in base64 format directly
              customer.orderHistory[idxPay].receiptImage = {
                data: base64Image, // Base64 encoded data from WhatsApp
                contentType: media.mimetype, // Use the mimetype provided by WhatsApp
              };

              // Store receipt image metadata
              customer.orderHistory[idxPay].receiptImageMetadata = {
                mimetype: media.mimetype,
                filename:
                  media.filename ||
                  `receipt-${Date.now()}.${
                    media.mimetype.split("/")[1] || "jpeg"
                  }`,
                timestamp: new Date(),
              };

              // Store the media ID for reference if necessary
              customer.orderHistory[idxPay].receiptImageId =
                message.id._serialized;

              // Update order status to 'pay-not-confirmed'
              customer.orderHistory[idxPay].status = "pay-not-confirmed";
              customer.currentOrderStatus = "pay-not-confirmed";

              // Save the updated customer document
              await customer.save();

              console.log(
                `Successfully saved receipt for order: ${customer.contextData.latestOrderId}`
              );
            } else {
              console.log(
                `Order not found: ${customer.contextData.latestOrderId}`
              );

              // Create new order if none exists
              if (customer.cart.items && customer.cart.items.length > 0) {
                const newOrderId = await customer.createOrder();
                customer.contextData.latestOrderId = newOrderId;
                customer.latestOrderId = newOrderId;
                await customer.save();

                const newIdxPay = customer.orderHistory.findIndex(
                  (o) => o.orderId === newOrderId
                );
                if (newIdxPay >= 0) {
                  // Store the image in base64 format directly
                  customer.orderHistory[newIdxPay].receiptImage = {
                    data: base64Image, // Base64 encoded data from WhatsApp
                    contentType: media.mimetype, // Use the mimetype provided by WhatsApp
                  };

                  // Store receipt image metadata
                  customer.orderHistory[newIdxPay].receiptImageMetadata = {
                    mimetype: media.mimetype,
                    filename:
                      media.filename ||
                      `receipt-${Date.now()}.${
                        media.mimetype.split("/")[1] || "jpeg"
                      }`,
                    timestamp: new Date(),
                  };

                  customer.orderHistory[newIdxPay].receiptImageId =
                    message.id._serialized;
                  customer.orderHistory[newIdxPay].status = "pay-not-confirmed";
                  customer.currentOrderStatus = "pay-not-confirmed";

                  await customer.save();
                  console.log(
                    `Successfully saved receipt for new order: ${newOrderId}`
                  );
                }
              } else {
                await sendWhatsAppMessage(
                  phoneNumber,
                  "❌ Error: No items found in your cart. Please contact support."
                );
                break;
              }
            }

            // Proceed to the next step (bank selection or other details)
            if (customer.bankAccounts?.length) {
              await customer.updateConversationState(
                "checkout_select_saved_bank"
              );
              let msg = "*🏦 Select your saved bank account for payment:*\n\n";
              customer.bankAccounts.forEach((b, i) => {
                msg += `${i + 1}. ${
                  b.bankName
                } - Account: ${b.accountNumber.slice(0, 4)}xxxx (${
                  b.accountHolderName
                })\n`;
              });
              msg += `${
                customer.bankAccounts.length + 1
              }. Other Bank\n\nℹ️ To manage your saved bank accounts, visit your *Profile* from the Main Menu.`;
              await sendWhatsAppMessage(phoneNumber, msg);
            } else {
              await customer.updateConversationState("checkout_enter_name");
              await sendWhatsAppMessage(
                phoneNumber,
                "👤 What is the full name of the account you are paying from?"
              );
            }
          } catch (error) {
            console.error("Error processing payment receipt:", error);
            await sendWhatsAppMessage(
              phoneNumber,
              "❌ Error: Unable to process your receipt. Please try again or contact support if the issue persists."
            );
          }
        }
        break;

      // ─── CASE: checkout_select_saved_bank ──────────────────────────
      case "checkout_select_saved_bank":
        {
          const selectedIdx = parseInt(text.trim(), 10) - 1;

          if (
            !isNaN(selectedIdx) &&
            selectedIdx >= 0 &&
            selectedIdx < customer.bankAccounts.length
          ) {
            const selected = customer.bankAccounts[selectedIdx];

            // Save into contextData
            customer.contextData.accountHolderName = selected.accountHolderName;
            customer.contextData.bankName = selected.bankName;

            // Verify we have a valid order ID to update
            if (!customer.contextData.latestOrderId) {
              console.error("No latestOrderId found when selecting saved bank");

              // Try to find the latest order from orderHistory
              if (customer.orderHistory.length > 0) {
                const recentOrders = [...customer.orderHistory].sort(
                  (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
                );

                if (recentOrders.length > 0) {
                  customer.contextData.latestOrderId = recentOrders[0].orderId;
                  customer.latestOrderId = recentOrders[0].orderId;
                  console.log(
                    `Found and using latest order: ${customer.contextData.latestOrderId}`
                  );
                }
              }
            }

            // Save the account holder name and bank name to the orderHistory entry
            const idx = customer.orderHistory.findIndex(
              (o) => o.orderId === customer.contextData.latestOrderId
            );
            if (idx >= 0) {
              customer.orderHistory[idx].accountHolderName =
                selected.accountHolderName;
              customer.orderHistory[idx].paidBankName = selected.bankName;

              // Add to tracking arrays for future reference
              if (!customer.payerNames.includes(selected.accountHolderName)) {
                customer.payerNames.push(selected.accountHolderName);
              }
              if (!customer.bankNames.includes(selected.bankName)) {
                customer.bankNames.push(selected.bankName);
              }
            } else {
              console.error(
                `Order not found in checkout_select_saved_bank: ${customer.contextData.latestOrderId}`
              );
              // Create a new order if no order exists
              if (customer.cart.items && customer.cart.items.length > 0) {
                console.log("Creating new order with selected bank details");
                const newOrderId = await customer.createOrder();
                customer.contextData.latestOrderId = newOrderId;
                customer.latestOrderId = newOrderId;

                // Now update the new order with the bank details
                const newIdx = customer.orderHistory.findIndex(
                  (o) => o.orderId === newOrderId
                );
                if (newIdx >= 0) {
                  customer.orderHistory[newIdx].accountHolderName =
                    selected.accountHolderName;
                  customer.orderHistory[newIdx].paidBankName =
                    selected.bankName;
                }
              }
            }

            await customer.save();

            await sendWhatsAppMessage(
              phoneNumber,
              `✅ Selected: ${selected.bankName} - (${selected.accountHolderName})\n\n🛒 Processing your order...`
            );

            // Now proceed to confirmation
            await customer.updateConversationState("order_confirmation");
            await processChatMessage(phoneNumber, "order_confirmation");
          } else if (text.trim() === `${customer.bankAccounts.length + 1}`) {
            await customer.updateConversationState("checkout_enter_name");
            await sendWhatsAppMessage(
              phoneNumber,
              "👤 What is the full name of the account you are paying from?"
            );
          } else {
            await sendWhatsAppMessage(
              phoneNumber,
              "❌ Invalid selection. Please choose a valid option."
            );
          }
        }
        break;

      // ─── CASE: checkout_enter_name ────────────────────────────────
      // ─── CASE: checkout_enter_name ────────────────────────────────
      case "checkout_enter_name":
        {
          const name = text.trim();
          customer.contextData.accountHolderName = name;

          // First check if we have a valid latestOrderId
          if (
            !customer.contextData.latestOrderId &&
            customer.orderHistory.length > 0
          ) {
            // Try to find the most recent order
            const recentOrders = [...customer.orderHistory].sort(
              (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
            );

            if (recentOrders.length > 0) {
              customer.contextData.latestOrderId = recentOrders[0].orderId;
              customer.latestOrderId = recentOrders[0].orderId; // Update top-level field too
              console.log(
                `Found most recent order for name update: ${customer.contextData.latestOrderId}`
              );
            }
          }

          // Now find the order with the ID
          const idx = customer.orderHistory.findIndex(
            (o) => o.orderId === customer.contextData.latestOrderId
          );

          if (idx >= 0) {
            // Save the account holder name to the orderHistory entry
            customer.orderHistory[idx].accountHolderName = name;

            // Track this name for future reference
            if (!customer.payerNames.includes(name)) {
              customer.payerNames.push(name);
            }

            await customer.save();
            console.log(
              `Successfully saved account holder name "${name}" to order: ${customer.contextData.latestOrderId}`
            );

            // Proceed to bank selection
            await customer.updateConversationState("checkout_enter_bank");

            // prompt bank list
            const formattedBankList = `*Select a bank:*
--------------------------------
1 - Other (enter manually)
--------------------------------
2 - Bank Rakyat Indonesia (BRI)
3 - Bank Ekspor Indonesia
8 - Bank Mandiri
9 - Bank Negara Indonesia (BNI)
11 - Bank Danamon Indonesia
13 - Bank Permata
14 - Bank Central Asia (BCA)
16 - Bank Maybank
19 - Bank Panin
20 - Bank Arta Niaga Kencana
22 - Bank CIMB Niaga
23 - Bank UOB Indonesia
26 - Bank Lippo
28 - Bank OCBC NISP
30 - American Express Bank LTD
31 - Citibank
32 - JP. Morgan Chase Bank, N.A
33 - Bank of America, N.A
36 - Bank Multicor
37 - Bank Artha Graha
47 - Bank Pesona Perdania
52 - Bank ABN Amro
53 - Bank Keppel Tatlee Buana
57 - Bank BNP Paribas Indonesia
68 - Bank Woori Indonesia
76 - Bank Bumi Arta
87 - Bank Ekonomi
89 - Bank Haga
93 - Bank IFI
95 - Bank Century / Bank J Trust Indonesia
97 - Bank Mayapada
110 - Bank BJB
111 - Bank DKI
112 - Bank BPD D.I.Y
113 - Bank Jateng
114 - Bank Jatim
115 - Bank Jambi
116 - Bank Aceh
117 - Bank Sumut
118 - Bank Sumbar
119 - Bank Kepri
120 - Bank Sumsel dan Babel
121 - Bank Lampung
122 - Bank Kalsel
123 - Bank Kalbar
124 - Bank Kaltim
125 - Bank Kalteng
126 - Bank Sulsel
127 - Bank Sulut
128 - Bank NTB
129 - Bank Bali
130 - Bank NTT
131 - Bank Maluku
132 - Bank Papua
133 - Bank Bengkulu
134 - Bank Sulteng
135 - Bank Sultra
137 - Bank Banten
145 - Bank Nusantara Parahyangan
146 - Bank Swadesi
147 - Bank Muamalat
151 - Bank Mestika
152 - Bank Metro Express
157 - Bank Maspion
159 - Bank Hagakita
161 - Bank Ganesha
162 - Bank Windu Kentjana
164 - Bank ICBC Indonesia
166 - Bank Harmoni Internasional
167 - Bank QNB
200 - Bank Tabungan Negara (BTN)
405 - Bank Swaguna
425 - Bank BJB Syariah
426 - Bank Mega
441 - Bank Bukopin
451 - Bank Syariah Indonesia (BSI)
459 - Bank Bisnis Internasional
466 - Bank Sri Partha
484 - Bank KEB Hana Indonesia
485 - Bank MNC Internasional
490 - Bank Neo
494 - Bank BNI Agro
503 - Bank Nobu
506 - Bank Mega Syariah
513 - Bank Ina Perdana
517 - Bank Panin Dubai Syariah
521 - Bank Bukopin Syariah
523 - Bank Sahabat Sampoerna
535 - SeaBank
536 - Bank BCA Syariah
542 - Bank Jago
547 - Bank BTPN Syariah
553 - Bank Mayora
555 - Bank Index Selindo
947 - Bank Aladin Syariah`;

            await sendWhatsAppMessage(phoneNumber, formattedBankList);
          } else {
            console.error(
              `No valid order found when trying to save account holder name.`
            );

            // Create new order if none exists
            if (customer.cart.items && customer.cart.items.length > 0) {
              console.log("Creating new order to save account holder name");
              const newOrderId = await customer.createOrder();
              customer.contextData.latestOrderId = newOrderId;
              customer.latestOrderId = newOrderId;

              // Find the new order index
              const newIdx = customer.orderHistory.findIndex(
                (o) => o.orderId === newOrderId
              );
              if (newIdx >= 0) {
                // Save the account holder name
                customer.orderHistory[newIdx].accountHolderName = name;

                // Track this name for future reference
                if (!customer.payerNames.includes(name)) {
                  customer.payerNames.push(name);
                }

                await customer.save();
                console.log(
                  `Created new order ${newOrderId} and saved account holder name "${name}"`
                );

                // Proceed to bank selection
                await customer.updateConversationState("checkout_enter_bank");
                await sendWhatsAppMessage(phoneNumber, formattedBankList);
              } else {
                throw new Error(
                  `Failed to find newly created order ${newOrderId}`
                );
              }
            } else {
              await sendWhatsAppMessage(
                phoneNumber,
                "❌ Your cart is empty. Please add items to your cart before checkout."
              );
              await customer.updateConversationState("main_menu");
              await processChatMessage(phoneNumber, "main_menu");
            }
          }
        }
        break;

      // ─── CASE: checkout_enter_bank ─────────────────────────────────
      case "checkout_enter_bank":
        {
          const checkoutBankOptions = {
            1: "Other (enter manually)",
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
            95: "Bank Century / Bank J Trust Indonesia",
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

          const choice = text.trim();
          const chosenBankName = checkoutBankOptions[choice];

          if (!chosenBankName) {
            await sendWhatsAppMessage(
              phoneNumber,
              "❌ Invalid input. Please enter a valid bank number from the list."
            );
            break;
          }

          if (choice === "1") {
            // manual‐entry path
            await customer.updateConversationState(
              "checkout_enter_bank_manual"
            );
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter the name of your bank:"
            );
            break;
          }

          // Verify we have a valid order ID before proceeding
          if (
            !customer.contextData.latestOrderId &&
            customer.orderHistory.length > 0
          ) {
            // Try to find the most recent order
            const recentOrders = [...customer.orderHistory].sort(
              (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
            );

            if (recentOrders.length > 0) {
              customer.contextData.latestOrderId = recentOrders[0].orderId;
              customer.latestOrderId = recentOrders[0].orderId; // Update top-level field too
              console.log(
                `Found most recent order for bank selection: ${customer.contextData.latestOrderId}`
              );
            }
          }

          // save into contextData
          customer.contextData.bankName = chosenBankName;

          // also persist onto the orderHistory entry
          const idx2 = customer.orderHistory.findIndex(
            (o) => o.orderId === customer.contextData.latestOrderId
          );

          if (idx2 >= 0) {
            customer.orderHistory[idx2].paidBankName = chosenBankName;

            // Track this bank for future reference
            if (!customer.bankNames.includes(chosenBankName)) {
              customer.bankNames.push(chosenBankName);
            }

            await customer.save();
            console.log(
              `Successfully saved bank "${chosenBankName}" to order: ${customer.contextData.latestOrderId}`
            );

            await sendWhatsAppMessage(
              phoneNumber,
              `✅ Selected Bank: ${chosenBankName}\n🛒 Processing your order...`
            );

            await customer.updateConversationState("order_confirmation");
            return processChatMessage(
              phoneNumber,
              "order_confirmation",
              message
            );
          } else {
            console.error(
              `Order not found when selecting bank: ${customer.contextData.latestOrderId}`
            );

            // Create a new order if no order exists
            if (customer.cart.items && customer.cart.items.length > 0) {
              console.log("Creating new order for bank selection");
              const newOrderId = await customer.createOrder();
              customer.contextData.latestOrderId = newOrderId;
              customer.latestOrderId = newOrderId;

              // Now update the new order with the bank details
              const newIdx = customer.orderHistory.findIndex(
                (o) => o.orderId === newOrderId
              );

              if (newIdx >= 0) {
                // Use the previously stored account holder name if available
                if (customer.contextData.accountHolderName) {
                  customer.orderHistory[newIdx].accountHolderName =
                    customer.contextData.accountHolderName;
                }

                customer.orderHistory[newIdx].paidBankName = chosenBankName;

                // Track this bank for future reference
                if (!customer.bankNames.includes(chosenBankName)) {
                  customer.bankNames.push(chosenBankName);
                }

                await customer.save();
                console.log(
                  `Created new order ${newOrderId} and saved bank "${chosenBankName}"`
                );

                await sendWhatsAppMessage(
                  phoneNumber,
                  `✅ Selected Bank: ${chosenBankName}\n🛒 Processing your order...`
                );

                await customer.updateConversationState("order_confirmation");
                return processChatMessage(
                  phoneNumber,
                  "order_confirmation",
                  message
                );
              } else {
                throw new Error(
                  `Failed to find newly created order ${newOrderId}`
                );
              }
            } else {
              await sendWhatsAppMessage(
                phoneNumber,
                "❌ Your cart is empty. Please add items to your cart before checkout."
              );
              await customer.updateConversationState("main_menu");
              await processChatMessage(phoneNumber, "main_menu");
            }
          }
        }
        break;

      // ─── CASE: checkout_enter_bank_manual ──────────────────────────
      case "checkout_enter_bank_manual":
        {
          const manualBankName = text.trim();

          // Verify we have a valid order ID before proceeding
          if (
            !customer.contextData.latestOrderId &&
            customer.orderHistory.length > 0
          ) {
            // Try to find the most recent order
            const recentOrders = [...customer.orderHistory].sort(
              (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
            );

            if (recentOrders.length > 0) {
              customer.contextData.latestOrderId = recentOrders[0].orderId;
              customer.latestOrderId = recentOrders[0].orderId; // Update top-level field too
              console.log(
                `Found most recent order for manual bank entry: ${customer.contextData.latestOrderId}`
              );
            }
          }

          // Save into contextData
          customer.contextData.bankName = manualBankName;

          // Find the order to update
          const idx3 = customer.orderHistory.findIndex(
            (o) => o.orderId === customer.contextData.latestOrderId
          );

          if (idx3 >= 0) {
            customer.orderHistory[idx3].paidBankName = manualBankName;

            // Track this bank for future reference
            if (!customer.bankNames.includes(manualBankName)) {
              customer.bankNames.push(manualBankName);
            }

            await customer.save();
            console.log(
              `Successfully saved manual bank "${manualBankName}" to order: ${customer.contextData.latestOrderId}`
            );

            await sendWhatsAppMessage(
              phoneNumber,
              `✅ Bank: ${manualBankName}\n🛒 Processing your order...`
            );

            await customer.updateConversationState("order_confirmation");
            return processChatMessage(phoneNumber, "order_confirmation");
          } else {
            console.error(
              `Order not found when entering manual bank: ${customer.contextData.latestOrderId}`
            );

            // Create a new order if no order exists
            if (customer.cart.items && customer.cart.items.length > 0) {
              console.log("Creating new order for manual bank entry");
              const newOrderId = await customer.createOrder();
              customer.contextData.latestOrderId = newOrderId;
              customer.latestOrderId = newOrderId;

              // Now update the new order with the bank details
              const newIdx = customer.orderHistory.findIndex(
                (o) => o.orderId === newOrderId
              );

              if (newIdx >= 0) {
                // Use the previously stored account holder name if available
                if (customer.contextData.accountHolderName) {
                  customer.orderHistory[newIdx].accountHolderName =
                    customer.contextData.accountHolderName;
                }

                customer.orderHistory[newIdx].paidBankName = manualBankName;

                // Track this bank for future reference
                if (!customer.bankNames.includes(manualBankName)) {
                  customer.bankNames.push(manualBankName);
                }

                await customer.save();
                console.log(
                  `Created new order ${newOrderId} and saved manual bank "${manualBankName}"`
                );

                await sendWhatsAppMessage(
                  phoneNumber,
                  `✅ Bank: ${manualBankName}\n🛒 Processing your order...`
                );

                await customer.updateConversationState("order_confirmation");
                return processChatMessage(phoneNumber, "order_confirmation");
              } else {
                throw new Error(
                  `Failed to find newly created order ${newOrderId}`
                );
              }
            } else {
              await sendWhatsAppMessage(
                phoneNumber,
                "❌ Your cart is empty. Please add items to your cart before checkout."
              );
              await customer.updateConversationState("main_menu");
              await processChatMessage(phoneNumber, "main_menu");
            }
          }
        }
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

            // after you capture their issue and create a support ticket…
            // **SET** “issue-customer”
            const idxIssue = customer.orderHistory.length - 1;
            customer.orderHistory[idxIssue].status = "issue-customer";
            customer.currentOrderStatus = "issue-customer";
            await customer.save();
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
            `\nDelivery: ${orderToTrack.deliveryType}\n` +
            `Total Price: Rp.${Math.round(
              orderToTrack.totalAmount
            ).toLocaleString()}\n\n` +
            `Order placed on: ${orderDate}\n` +
            `Status: ${orderToTrack.status}\n` +
            `Customer email: ${
              customer.contextData?.email || "Not provided"
            }\n` +
            `Delivery address: ${
              orderToTrack.deliveryLocation || "self_pickup"
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
        if (["1", "2", "3", "4", "5", "6"].includes(text)) {
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
                ` *My Account* \n\n` +
                `Please select an option:\n\n` +
                `1. Funds\n` +
                `2. Forman\n` +
                `3. Switch my number\n` +
                `4. Return to Profile`;
              await sendWhatsAppMessage(phoneNumber, accountMessage);
              break;

            case "5":
              // Manage bank accounts
              await customer.updateConversationState("manage_bank_accounts");
              let bankMsg = "*💳 Your Saved Bank Accounts:*\n\n";

              if (
                !customer.bankAccounts ||
                customer.bankAccounts.length === 0
              ) {
                bankMsg += "_No bank accounts saved yet._\n\n";
              } else {
                customer.bankAccounts.forEach((bank, i) => {
                  bankMsg += `${i + 1}. ${
                    bank.bankName
                  }\n   Account: ${bank.accountNumber.substring(0, 4)}xxxx (${
                    bank.accountHolderName
                  })\n`;
                });
                bankMsg += "\n";
              }

              bankMsg +=
                "What would you like to do?\n\n" +
                "1. Add a new bank account\n" +
                "2. Edit an existing bank account\n" +
                "3. Remove a bank account\n" +
                "4. Return to Profile";

              await sendWhatsAppMessage(phoneNumber, bankMsg);
              break;

            case "6":
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
            `4. My Account \n` +
            `5. Manage Bank Accounts\n` +
            `6. Return to Main Menu`;

          await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);
        }
        break;

      // Bank Account Management Cases
      case "manage_bank_accounts":
        switch (text.trim()) {
          case "1":
            // Add new bank account - first step: ask for account holder name
            customer.updateConversationState("add_bank_holder_name");
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter the account holder name:"
            );
            break;

          case "2":
            // Edit existing bank account
            if (!customer.bankAccounts || customer.bankAccounts.length === 0) {
              await sendWhatsAppMessage(
                phoneNumber,
                "You don't have any saved bank accounts to edit. Would you like to add one?\n\n1. Add a new bank account\n2. Return to Profile"
              );
              break;
            }

            customer.updateConversationState("edit_bank_select");
            let editMsg = "*Select a bank account to edit:*\n\n";

            customer.bankAccounts.forEach((bank, i) => {
              editMsg += `${i + 1}. ${bank.bankName} (${
                bank.accountHolderName
              })\n`;
            });

            await sendWhatsAppMessage(phoneNumber, editMsg);
            break;

          case "3":
            // Remove bank account
            if (!customer.bankAccounts || customer.bankAccounts.length === 0) {
              await sendWhatsAppMessage(
                phoneNumber,
                "You don't have any saved bank accounts to remove.\n\nReturning to bank accounts menu..."
              );

              setTimeout(async () => {
                await customer.updateConversationState("manage_bank_accounts");
                let bankMsg = "*💳 Your Saved Bank Accounts:*\n\n";
                bankMsg += "_No bank accounts saved yet._\n\n";

                bankMsg +=
                  "What would you like to do?\n\n" +
                  "1. Add a new bank account\n" +
                  "2. Edit an existing bank account\n" +
                  "3. Remove a bank account\n" +
                  "4. Return to Profile";

                await sendWhatsAppMessage(phoneNumber, bankMsg);
              }, 1500);
              break;
            }

            customer.updateConversationState("remove_bank_account");
            let removeMsg = "*Select a bank account to remove:*\n\n";

            customer.bankAccounts.forEach((bank, i) => {
              removeMsg += `${i + 1}. ${
                bank.bankName
              } - Account: ${bank.accountNumber.substring(0, 4)}xxxx (${
                bank.accountHolderName
              })\n`;
            });

            await sendWhatsAppMessage(phoneNumber, removeMsg);
            break;

          case "4":
            // Return to profile
            customer.updateConversationState("profile");
            await sendWhatsAppMessage(phoneNumber, "Returning to profile...");

            // Return to profile with delay
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
                `4. My Account \n` +
                `5. Manage Bank Accounts\n` +
                `6. Return to Main Menu`;

              await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);
            }, 1500);
            break;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "Invalid input. Please choose 1, 2, 3 or 4."
            );
        }
        break;

      case "remove_bank_account":
        const removeIndex = parseInt(text.trim()) - 1;

        if (
          isNaN(removeIndex) ||
          removeIndex < 0 ||
          !customer.bankAccounts ||
          removeIndex >= customer.bankAccounts.length
        ) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid selection. Please enter a valid number from the list."
          );
          break;
        }

        const removedBank = customer.bankAccounts.splice(removeIndex, 1)[0];
        customer.markModified("bankAccounts");

        await customer.save();

        await customer.updateConversationState("manage_bank_accounts");

        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Removed bank: *${removedBank.bankName}* (${removedBank.accountHolderName})`
        );

        // Then re-show the updated list (optional but recommended)
        setTimeout(async () => {
          let bankMsg = "*💳 Your Saved Bank Accounts:*\n\n";

          if (!customer.bankAccounts || customer.bankAccounts.length === 0) {
            bankMsg += "_No bank accounts saved yet._\n\n";
          } else {
            customer.bankAccounts.forEach((bank, i) => {
              bankMsg += `${i + 1}. ${
                bank.bankName
              }\n   Account: ${bank.accountNumber.substring(0, 4)}xxxx (${
                bank.accountHolderName
              })\n`;
            });
            bankMsg += "\n";
          }

          bankMsg +=
            "What would you like to do?\n\n" +
            "1. Add a new bank account\n" +
            "2. Edit an existing bank account\n" +
            "3. Remove a bank account\n" +
            "4. Return to Profile";

          await sendWhatsAppMessage(phoneNumber, bankMsg);
        }, 800);
        break;

      // Add bank account flow
      case "add_bank_holder_name":
        // Save the account holder name and proceed to bank selection
        customer.contextData = customer.contextData || {};
        customer.contextData.tempBankAccount =
          customer.contextData.tempBankAccount || {};
        customer.contextData.tempBankAccount.accountHolderName = text.trim();
        customer.markModified("contextData");
        await customer.save();

        // Move to bank selection
        customer.updateConversationState("add_bank_select");

        // Show loading message
        await sendWhatsAppMessage(phoneNumber, "*Loading bank list...*");

        // Send the bank list after a short delay
        setTimeout(async () => {
          const bankListToSave = `
*Select a bank:*

2 - Bank Rakyat Indonesia (BRI)
3 - Bank Ekspor Indonesia
8 - Bank Mandiri
9 - Bank Negara Indonesia (BNI)
11 - Bank Danamon Indonesia
13 - Bank Permata
14 - Bank Central Asia (BCA)
16 - Bank Maybank
19 - Bank Panin
20 - Bank Arta Niaga Kencana
22 - Bank CIMB Niaga
23 - Bank UOB Indonesia
26 - Bank Lippo
28 - Bank OCBC NISP
30 - American Express Bank LTD
31 - Citibank
32 - JP. Morgan Chase Bank, N.A
33 - Bank of America, N.A
36 - Bank Multicor
37 - Bank Artha Graha
47 - Bank Pesona Perdania
52 - Bank ABN Amro
53 - Bank Keppel Tatlee Buana
57 - Bank BNP Paribas Indonesia
68 - Bank Woori Indonesia
76 - Bank Bumi Arta
87 - Bank Ekonomi
89 - Bank Haga
93 - Bank IFI
95 - Bank Century/Bank J Trust Indonesia
97 - Bank Mayapada
110 - Bank BJB
111 - Bank DKI
112 - Bank BPD D.I.Y
113 - Bank Jateng
114 - Bank Jatim
115 - Bank Jambi
116 - Bank Aceh
117 - Bank Sumut
118 - Bank Sumbar
119 - Bank Kepri
120 - Bank Sumsel dan Babel
121 - Bank Lampung
122 - Bank Kalsel
123 - Bank Kalbar
124 - Bank Kaltim
125 - Bank Kalteng
126 - Bank Sulsel
127 - Bank Sulut
128 - Bank NTB
129 - Bank Bali
130 - Bank NTT
131 - Bank Maluku
132 - Bank Papua
133 - Bank Bengkulu
134 - Bank Sulteng
135 - Bank Sultra
137 - Bank Banten
145 - Bank Nusantara Parahyangan
146 - Bank Swadesi
147 - Bank Muamalat
151 - Bank Mestika
152 - Bank Metro Express
157 - Bank Maspion
159 - Bank Hagakita
161 - Bank Ganesha
162 - Bank Windu Kentjana
164 - Bank ICBC Indonesia
166 - Bank Harmoni Internasional
167 - Bank QNB
200 - Bank Tabungan Negara (BTN)
405 - Bank Swaguna
425 - Bank BJB Syariah
426 - Bank Mega
441 - Bank Bukopin
451 - Bank Syariah Indonesia (BSI)
459 - Bank Bisnis Internasional
466 - Bank Sri Partha
484 - Bank KEB Hana Indonesia
485 - Bank MNC Internasional
490 - Bank Neo
494 - Bank BNI Agro
503 - Bank Nobu
506 - Bank Mega Syariah
513 - Bank Ina Perdana
517 - Bank Panin Dubai Syariah
521 - Bank Bukopin Syariah
523 - Bank Sahabat Sampoerna
535 - SeaBank
536 - Bank BCA Syariah
542 - Bank Jago
547 - Bank BTPN Syariah
553 - Bank Mayora
555 - Bank Index Selindo
947 - Bank Aladin Syariah

1 - Other (enter manually)
`;
          await sendWhatsAppMessage(phoneNumber, bankListToSave);
        }, 1000);
        break;

      case "add_bank_select":
        const allBankOptions = {
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

        if (text.trim() === "1") {
          // User wants to enter custom bank name
          customer.updateConversationState("add_bank_manual");
          await sendWhatsAppMessage(
            phoneNumber,
            "Please enter the custom bank name:"
          );
          break;
        }

        const selectedBank = allBankOptions[text.trim()];
        if (selectedBank) {
          // Save the selected bank name and proceed to account number
          customer.contextData = customer.contextData || {};
          customer.contextData.tempBankAccount =
            customer.contextData.tempBankAccount || {};
          customer.contextData.tempBankAccount.bankName = selectedBank;
          customer.markModified("contextData");
          await customer.save();

          // Move to account number input
          customer.updateConversationState("add_bank_account_number");
          await sendWhatsAppMessage(
            phoneNumber,
            "Please enter the account number:"
          );
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid selection. Please enter a valid number from the list."
          );
        }
        break;

      case "add_bank_manual":
        // Save custom bank name and proceed to account number
        customer.contextData = customer.contextData || {};
        customer.contextData.tempBankAccount =
          customer.contextData.tempBankAccount || {};
        customer.contextData.tempBankAccount.bankName = text.trim();
        customer.markModified("contextData");
        await customer.save();

        // Move to account number input
        customer.updateConversationState("add_bank_account_number");
        await sendWhatsAppMessage(
          phoneNumber,
          "Please enter the account number:"
        );
        break;

      case "add_bank_account_number":
        // Save the account number and confirm all details
        const accountNumber = text.trim();

        // Simple validation for account number
        if (!/^\d{5,20}$/.test(accountNumber)) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid account number. Please enter a valid numeric account number (5-20 digits):"
          );
          break;
        }

        customer.contextData = customer.contextData || {};
        customer.contextData.tempBankAccount =
          customer.contextData.tempBankAccount || {};
        customer.contextData.tempBankAccount.accountNumber = accountNumber;
        customer.markModified("contextData");
        await customer.save();

        // Show confirmation of all details
        const tempBank = customer.contextData.tempBankAccount;
        customer.updateConversationState("add_bank_confirmation");

        await sendWhatsAppMessage(
          phoneNumber,
          `*Please confirm your bank details:*\n\n` +
            `Account Holder: ${tempBank.accountHolderName}\n` +
            `Bank: ${tempBank.bankName}\n` +
            `Account Number: ${tempBank.accountNumber}\n\n` +
            `Is this correct?\n` +
            `1. Yes, save these details\n` +
            `2. No, I need to make changes`
        );
        break;

      case "add_bank_confirmation":
        if (text.trim() === "1" || text.toLowerCase().includes("yes")) {
          // Initialize bankAccounts array if it doesn't exist
          if (!customer.bankAccounts) {
            customer.bankAccounts = [];
          }

          // Add the new bank account
          const newBankAccount = {
            accountHolderName:
              customer.contextData.tempBankAccount.accountHolderName,
            bankName: customer.contextData.tempBankAccount.bankName,
            accountNumber: customer.contextData.tempBankAccount.accountNumber,
          };

          customer.bankAccounts.push(newBankAccount);
          customer.markModified("bankAccounts");

          // Clear temporary data
          delete customer.contextData.tempBankAccount;
          customer.markModified("contextData");

          await customer.save();

          // Show success message
          await sendWhatsAppMessage(
            phoneNumber,
            "✅ Bank account added successfully!"
          );

          // Return to bank account management menu
          customer.updateConversationState("manage_bank_accounts");

          setTimeout(async () => {
            let bankMsg = "*💳 Your Saved Bank Accounts:*\n\n";

            customer.bankAccounts.forEach((bank, i) => {
              bankMsg += `${i + 1}. ${
                bank.bankName
              }\n   Account: ${bank.accountNumber.substring(0, 4)}xxxx (${
                bank.accountHolderName
              })\n`;
            });

            bankMsg +=
              "\nWhat would you like to do?\n\n" +
              "1. Add a new bank account\n" +
              "2. Edit an existing bank account\n" +
              "3. Remove a bank account\n" +
              "4. Return to Profile";

            await sendWhatsAppMessage(phoneNumber, bankMsg);
          }, 1000);
        } else if (text.trim() === "2" || text.toLowerCase().includes("no")) {
          // Ask which part they want to edit
          customer.updateConversationState("add_bank_edit_choice");
          await sendWhatsAppMessage(
            phoneNumber,
            "Which information would you like to change?\n\n" +
              "1. Account Holder Name\n" +
              "2. Bank\n" +
              "3. Account Number\n" +
              "4. Cancel and return to bank management"
          );
        } else {
          await sendWhatsAppMessage(
            phoneNumber,
            "Invalid input. Please enter 1 (Yes) or 2 (No)."
          );
        }
        break;

      case "add_bank_edit_choice":
        switch (text.trim()) {
          case "1":
            // Edit account holder name
            customer.updateConversationState("add_bank_holder_name");
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter the account holder name:"
            );
            break;

          case "2":
            // Edit bank name - show bank selection again
            customer.updateConversationState("add_bank_select");
            await sendWhatsAppMessage(phoneNumber, "*Loading bank list...*");

            setTimeout(async () => {
              const bankListToSave = `
*Select a bank:*

2 - Bank Rakyat Indonesia (BRI)
3 - Bank Ekspor Indonesia
8 - Bank Mandiri
9 - Bank Negara Indonesia (BNI)
11 - Bank Danamon Indonesia
13 - Bank Permata
14 - Bank Central Asia (BCA)
16 - Bank Maybank
19 - Bank Panin
20 - Bank Arta Niaga Kencana
22 - Bank CIMB Niaga
23 - Bank UOB Indonesia
26 - Bank Lippo
28 - Bank OCBC NISP
30 - American Express Bank LTD
31 - Citibank
32 - JP. Morgan Chase Bank, N.A
33 - Bank of America, N.A
36 - Bank Multicor
37 - Bank Artha Graha
47 - Bank Pesona Perdania
52 - Bank ABN Amro
53 - Bank Keppel Tatlee Buana
57 - Bank BNP Paribas Indonesia
68 - Bank Woori Indonesia
76 - Bank Bumi Arta
87 - Bank Ekonomi
89 - Bank Haga
93 - Bank IFI
95 - Bank Century/Bank J Trust Indonesia
97 - Bank Mayapada
110 - Bank BJB
111 - Bank DKI
112 - Bank BPD D.I.Y
113 - Bank Jateng
114 - Bank Jatim
115 - Bank Jambi
116 - Bank Aceh
117 - Bank Sumut
118 - Bank Sumbar
119 - Bank Kepri
120 - Bank Sumsel dan Babel
121 - Bank Lampung
122 - Bank Kalsel
123 - Bank Kalbar
124 - Bank Kaltim
125 - Bank Kalteng
126 - Bank Sulsel
127 - Bank Sulut
128 - Bank NTB
129 - Bank Bali
130 - Bank NTT
131 - Bank Maluku
132 - Bank Papua
133 - Bank Bengkulu
134 - Bank Sulteng
135 - Bank Sultra
137 - Bank Banten
145 - Bank Nusantara Parahyangan
146 - Bank Swadesi
147 - Bank Muamalat
151 - Bank Mestika
152 - Bank Metro Express
157 - Bank Maspion
159 - Bank Hagakita
161 - Bank Ganesha
162 - Bank Windu Kentjana
164 - Bank ICBC Indonesia
166 - Bank Harmoni Internasional
167 - Bank QNB
200 - Bank Tabungan Negara (BTN)
405 - Bank Swaguna
425 - Bank BJB Syariah
426 - Bank Mega
441 - Bank Bukopin
451 - Bank Syariah Indonesia (BSI)
459 - Bank Bisnis Internasional
466 - Bank Sri Partha
484 - Bank KEB Hana Indonesia
485 - Bank MNC Internasional
490 - Bank Neo
494 - Bank BNI Agro
503 - Bank Nobu
506 - Bank Mega Syariah
513 - Bank Ina Perdana
517 - Bank Panin Dubai Syariah
521 - Bank Bukopin Syariah
523 - Bank Sahabat Sampoerna
535 - SeaBank
536 - Bank BCA Syariah
542 - Bank Jago
547 - Bank BTPN Syariah
553 - Bank Mayora
555 - Bank Index Selindo
947 - Bank Aladin Syariah

1 - Other (enter manually)
`;
              await sendWhatsAppMessage(phoneNumber, bankListToSave);
            }, 1000);
            break;

          case "3":
            // Edit account number
            customer.updateConversationState("add_bank_account_number");
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter the account number:"
            );
            break;

          case "4":
            // Cancel and return to bank management
            customer.updateConversationState("manage_bank_accounts");

            // Clear temporary data
            delete customer.contextData.tempBankAccount;
            customer.markModified("contextData");
            await customer.save();

            await sendWhatsAppMessage(
              phoneNumber,
              "❌ Bank account creation canceled. Returning to bank management..."
            );

            setTimeout(async () => {
              let bankMsg = "*💳 Your Saved Bank Accounts:*\n\n";

              if (
                !customer.bankAccounts ||
                customer.bankAccounts.length === 0
              ) {
                bankMsg += "_No bank accounts saved yet._\n\n";
              } else {
                customer.bankAccounts.forEach((bank, i) => {
                  bankMsg += `${i + 1}. ${
                    bank.bankName
                  }\n   Account: ${bank.accountNumber.substring(0, 4)}xxxx (${
                    bank.accountHolderName
                  })\n`;
                });
                bankMsg += "\n";
              }

              bankMsg +=
                "What would you like to do?\n\n" +
                "1. Add a new bank account\n" +
                "2. Edit an existing bank account\n" +
                "3. Remove a bank account\n" +
                "4. Return to Profile";

              await sendWhatsAppMessage(phoneNumber, bankMsg);
            }, 1000);
            break;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "Invalid input. Please choose 1, 2, 3, or 4."
            );
        }
        break;

      case "edit_bank_select":
        const editIndex = parseInt(text.trim()) - 1;

        if (
          isNaN(editIndex) ||
          editIndex < 0 ||
          !customer.bankAccounts ||
          editIndex >= customer.bankAccounts.length
        ) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid bank selection. Please enter a valid number from the list."
          );
          break;
        }

        // ✅ Store the selected index for use in next case
        customer.contextData = customer.contextData || {};
        customer.contextData.editBankIndex = editIndex;
        customer.markModified("contextData");
        await customer.save(); // 🔥 THIS is the missing piece

        // ✅ Move to next step
        customer.updateConversationState("edit_bank_field");
        await sendWhatsAppMessage(
          phoneNumber,
          `*Editing Bank Account:*\n` +
            `${customer.bankAccounts[editIndex].bankName} - Account: ${customer.bankAccounts[editIndex].accountNumber} (${customer.bankAccounts[editIndex].accountHolderName})\n\n` +
            `What would you like to edit?\n\n` +
            `1. Account Holder Name\n` +
            `2. Bank Name\n` +
            `3. Account Number\n` +
            `4. Cancel and return to bank management`
        );
        break;

      case "edit_bank_field":
        const editOption = text.trim();
        const bankIndex = customer.contextData?.editBankIndex;

        if (
          bankIndex === null ||
          typeof bankIndex === "undefined" ||
          !customer.bankAccounts ||
          bankIndex >= customer.bankAccounts.length
        ) {
          customer.updateConversationState("manage_bank_accounts");
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Something went wrong. Returning to bank management."
          );
          break;
        }

        switch (editOption) {
          case "1":
            // Edit account holder name
            customer.updateConversationState("edit_bank_account_holder");
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter the new account holder name:"
            );
            break;

          case "2":
            // Edit bank name - resend bank list
            customer.updateConversationState("edit_bank_name");
            await sendWhatsAppMessage(phoneNumber, "*Loading bank list...*");

            setTimeout(async () => {
              const bankListToSave = `
        *Select a bank:*
        
        2 - Bank Rakyat Indonesia (BRI)
        3 - Bank Ekspor Indonesia
        8 - Bank Mandiri
        9 - Bank Negara Indonesia (BNI)
        11 - Bank Danamon Indonesia
        13 - Bank Permata
        14 - Bank Central Asia (BCA)
        16 - Bank Maybank
        19 - Bank Panin
        22 - Bank CIMB Niaga
        23 - Bank UOB Indonesia
        30 - American Express Bank LTD
        31 - Citibank
        32 - JP. Morgan Chase Bank, N.A
        33 - Bank of America, N.A
        441 - Bank Bukopin
        451 - Bank Syariah Indonesia (BSI)
        503 - Bank Nobu
        535 - SeaBank
        536 - Bank BCA Syariah
        542 - Bank Jago
        547 - Bank BTPN Syariah
        
        1 - Other (enter manually)
                `;
              await sendWhatsAppMessage(phoneNumber, bankListToSave);
            }, 1000);
            break;

          case "3":
            // Edit account number
            customer.updateConversationState("edit_bank_account_number");
            await sendWhatsAppMessage(
              phoneNumber,
              "Please enter the new account number:"
            );
            break;

          case "4":
            // Cancel and return to bank management
            delete customer.contextData.editBankIndex;
            customer.markModified("contextData");
            await customer.save();

            customer.updateConversationState("manage_bank_accounts");
            await sendWhatsAppMessage(
              phoneNumber,
              "❌ Edit cancelled. Returning to bank management..."
            );
            break;

          default:
            await sendWhatsAppMessage(
              phoneNumber,
              "❌ Invalid input. Please enter 1, 2, 3 or 4."
            );
        }
        break;

      case "edit_bank_account_holder":
        const index = customer.contextData?.editBankIndex;

        if (
          index === null ||
          typeof index === "undefined" ||
          !customer.bankAccounts ||
          index >= customer.bankAccounts.length
        ) {
          customer.updateConversationState("manage_bank_accounts");
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Something went wrong. Returning to bank management."
          );
          break;
        }

        customer.bankAccounts[index].accountHolderName = text.trim();
        customer.markModified("bankAccounts");

        // Clear the temp index BEFORE saving
        delete customer.contextData.editBankIndex;
        customer.markModified("contextData");

        // ✅ Only one save — await and done
        await customer.save();

        customer.updateConversationState("manage_bank_accounts"); // this saves too, but after prior save is done

        await sendWhatsAppMessage(
          phoneNumber,
          "✅ Account holder name updated successfully."
        );
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
          `4. My Account \n` +
          `5. Manage Bank Accounts\n` +
          `6. Return to Main Menu`;

        await sendWhatsAppMessage(phoneNumber, updatedProfileMessage);
        break;

      case "edit_bank_name":
        const allBanks = {
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
          1: "Other (enter manually)",
        };

        const selectedBankName = allBanks[text.trim()];
        const bankIndexToEdit = customer.contextData?.editBankIndex;

        if (
          bankIndexToEdit === null ||
          typeof bankIndexToEdit === "undefined" ||
          !customer.bankAccounts ||
          bankIndexToEdit >= customer.bankAccounts.length
        ) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid session. Returning to bank management..."
          );
          customer.updateConversationState("manage_bank_accounts");
          break;
        }

        if (text.trim() === "1") {
          customer.updateConversationState("edit_bank_manual_entry");
          await sendWhatsAppMessage(
            phoneNumber,
            "Please enter the new bank name manually:"
          );
          break;
        }

        if (!selectedBankName) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid selection. Please enter a valid number from the list."
          );
          break;
        }

        customer.bankAccounts[bankIndexToEdit].bankName = selectedBankName;
        customer.markModified("bankAccounts");

        delete customer.contextData.editBankIndex;
        customer.markModified("contextData");

        await customer.save();
        customer.updateConversationState("manage_bank_accounts");

        await sendWhatsAppMessage(
          phoneNumber,
          "✅ Bank name updated successfully."
        );
        let ProfileMessage =
          `👤 *Your Profile* 👤\n\n` +
          `Name: ${customer.name}\n` +
          `📱 Master Number: ${cleanPhoneNumber(
            customer.phoneNumber?.[0] || ""
          )}\n`;

        if (customer.phoneNumber.length > 1) {
          ProfileMessage += `🔗 Connected Numbers:\n`;
          customer.phoneNumber.slice(1).forEach((num, index) => {
            ProfileMessage += `   ${index + 1}. ${cleanPhoneNumber(num)}\n`;
          });
        }

        ProfileMessage +=
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
          `4. My Account \n` +
          `5. Manage Bank Accounts\n` +
          `6. Return to Main Menu`;

        await sendWhatsAppMessage(phoneNumber, ProfileMessage);
        break;
      case "edit_bank_manual_entry":
        const manualBankIndex = customer.contextData?.editBankIndex;

        if (
          manualBankIndex === null ||
          typeof manualBankIndex === "undefined" ||
          !customer.bankAccounts ||
          manualBankIndex >= customer.bankAccounts.length
        ) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid session. Returning to bank management..."
          );
          customer.updateConversationState("manage_bank_accounts");
          break;
        }

        const manualBankName = text.trim();

        if (!manualBankName || manualBankName.length < 3) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Please enter a valid bank name (at least 3 characters)."
          );
          break;
        }

        customer.bankAccounts[manualBankIndex].bankName = manualBankName;
        customer.markModified("bankAccounts");

        delete customer.contextData.editBankIndex;
        customer.markModified("contextData");

        await customer.save();
        customer.updateConversationState("manage_bank_accounts");

        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Bank name updated to *${manualBankName}* successfully.`
        );
        break;

      case "edit_bank_account_number":
        const editIdx = customer.contextData?.editBankIndex;

        if (
          editIdx === null ||
          typeof editIdx === "undefined" ||
          !customer.bankAccounts ||
          editIdx >= customer.bankAccounts.length
        ) {
          customer.updateConversationState("manage_bank_accounts");
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Something went wrong. Returning to bank management."
          );
          break;
        }

        const newAccountNumber = text.trim();

        if (!/^\d{5,20}$/.test(newAccountNumber)) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Invalid account number. Please enter a numeric account number (5–20 digits)."
          );
          break;
        }

        customer.bankAccounts[editIdx].accountNumber = newAccountNumber;
        customer.markModified("bankAccounts");

        // Clean up index
        delete customer.contextData.editBankIndex;
        customer.markModified("contextData");

        // ✅ Only call .save() ONCE here, then await it before doing anything else
        await customer.save();

        // ✅ AFTER save, update state
        await customer.updateConversationState("manage_bank_accounts");

        await sendWhatsAppMessage(
          phoneNumber,
          "✅ Account number updated successfully."
        );
        let Message =
          `👤 *Your Profile* 👤\n\n` +
          `Name: ${customer.name}\n` +
          `📱 Master Number: ${cleanPhoneNumber(
            customer.phoneNumber?.[0] || ""
          )}\n`;

        if (customer.phoneNumber.length > 1) {
          Message += `🔗 Connected Numbers:\n`;
          customer.phoneNumber.slice(1).forEach((num, index) => {
            Message += `   ${index + 1}. ${cleanPhoneNumber(num)}\n`;
          });
        }

        Message +=
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
          `4. My Account \n` +
          `5. Manage Bank Accounts\n` +
          `6. Return to Main Menu`;

        await sendWhatsAppMessage(phoneNumber, Message);
        break;

      // New main account menu
      case "account_main":
        switch (text) {
          case "1":
            // Go straight to funds summary
            await customer.updateConversationState("account_funds");
            await sendWhatsAppMessage(
              phoneNumber,
              ` *My Funds* \n\n` +
                ` *My Earnings (Forman)*: Rs. 5,200.00\n` +
                ` *My Refunds*: Rs. 1,000.00\n` +
                ` *Total Funds Available*: Rs. 6,200.00\n\n` +
                `With these funds, you can buy anything you want from our shop — cement, bricks, paint, pipes... even dreams  \n\n` +
                `4. Return to Main Menu`
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

            switchListMsg += `\nReply with the  index of the number  you want to replace.\n\n ----------------------------------------------------\nAll the information related to this number will be switched to the new number and the account and information will no longer be available to you on this number
`;

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
                `4. My Account \n` +
                `5. Manage Bank Accounts\n` +
                `6. Return to Main Menu`;

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
      // Funds submenu handling - simplified to show all details at once
      case "account_funds":
        await sendWhatsAppMessage(
          phoneNumber,
          ` *My Funds* \n\n` +
            ` *My Earnings (Forman)*: Rs. 5,200.00\n` +
            ` *My Refunds*: Rs. 1,000.00\n` +
            ` *Total Funds Available*: Rs. 6,200.00\n\n` +
            `With these funds, you can buy anything you want from our shop — cement, bricks, paint, pipes... even dreams \n\n` +
            `4. Return to Main Menu`
        );
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
              ` *My Account* \n\n` +
                `Please select an option:\n\n` +
                `1. Funds\n` +
                `2. Forman( eligibility)\n` +
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
                `1. Forman (eligibility)\n` +
                `2. Commission ( eligibility)\n` +
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

        // Initialize AND save the index
        customer.set("contextData.numberSwitchIndex", selectedIndex);
        customer.markModified("contextData");
        customer.conversationState = "universal_number_switch_input";
        await customer.save();

        console.log("✅ Saved numberSwitchIndex:", selectedIndex);

        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Got it! Now send the *new number* (starting with country code e.g 62 without any spaces and + symbol) you'd like to use instead.`
        );
        break;
      }

      // In your Customer schema, add this field:
      // tempNumberToSwitch: { type: String, default: null },

      // Then modify these case handlers:

      case "universal_number_switch_input": {
        console.log("📦 Loaded contextData:", customer.contextData);

        const switchIdx = customer.contextData?.numberSwitchIndex;
        console.log("Switch index from contextData:", switchIdx);

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
        console.log("New formatted number:", newFormatted);

        if (!/^\d{10,15}$/.test(newRaw)) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Please enter a valid number (10–15 digits)."
          );
          return;
        }

        // Store the new number in a dedicated field
        customer.tempNumberToSwitch = newFormatted;
        console.log("Saving tempNumberToSwitch:", newFormatted);
        customer.conversationState = "universal_number_switch_confirm";
        await customer.save();

        // Verify the data was saved correctly
        console.log(
          "After save - tempNumberToSwitch:",
          customer.tempNumberToSwitch
        );

        await sendWhatsAppMessage(
          phoneNumber,
          `📱 Is this number correct? *${cleanPhoneNumber(
            newFormatted
          )}*\n\n1. Yes, continue\n2. No, I want to edit it`
        );
        break;
      }

      case "universal_number_switch_confirm": {
        console.log("Processing confirmation with input:", text);
        console.log("Current tempNumberToSwitch:", customer.tempNumberToSwitch);

        const answer = text.trim().toLowerCase();

        if (answer === "2" || answer === "no") {
          // User wants to edit the number
          customer.conversationState = "universal_number_switch_input";
          await customer.save();

          await sendWhatsAppMessage(
            phoneNumber,
            `Please enter the *new number* again (starting with country code e.g 62 without any spaces and + symbol):`
          );
          return;
        }

        if (answer !== "1" && answer !== "yes") {
          await sendWhatsAppMessage(
            phoneNumber,
            `Please reply with *1* (Yes) or *2* (No).`
          );
          return;
        }

        // User confirmed the number, now check if it exists in the database
        const switchIdx = customer.contextData?.numberSwitchIndex;
        const newNumber = customer.tempNumberToSwitch;

        console.log("Retrieved switch index:", switchIdx);
        console.log("Retrieved new number:", newNumber);

        if (switchIdx === undefined || switchIdx === null) {
          console.error("Missing switch index in contextData");
          await sendWhatsAppMessage(
            phoneNumber,
            `❌ Switch failed. Missing index information. Please start again from the switch menu.`
          );
          await customer.updateConversationState("account_main");
          return;
        }

        if (!newNumber) {
          console.error("Missing new number in tempNumberToSwitch");
          await sendWhatsAppMessage(
            phoneNumber,
            `❌ Switch failed. Missing new number information. Please start again from the switch menu.`
          );
          await customer.updateConversationState("account_main");
          return;
        }

        try {
          // Check if the number already exists in another account
          const existingCustomer = await Customer.findOne({
            phoneNumber: newNumber,
            _id: { $ne: customer._id }, // Exclude current customer
          });

          if (existingCustomer) {
            console.log("Number already exists in another account");
            await sendWhatsAppMessage(
              phoneNumber,
              `❌ This number is already associated with another account. Please try a different number.`
            );
            customer.conversationState = "universal_number_switch_input";
            await customer.save();
            return;
          }

          // Final warning about account transfer
          customer.conversationState = "universal_number_switch_final_confirm";
          await customer.save();

          await sendWhatsAppMessage(
            phoneNumber,
            `⚠️ *Warning*: All your account progress will be switched to ${cleanPhoneNumber(
              newNumber
            )}. Are you sure?\n\n1. Yes, switch my number\n2. No, cancel\n ------------------------------------------------------------------\nAll the information related to this number will be switched to the new number and the account and information will no longer be available to you on this number
`
          );
        } catch (error) {
          console.error("Error during number existence check:", error);
          await sendWhatsAppMessage(
            phoneNumber,
            `❌ An error occurred during the switch process. Please try again later.`
          );
          await customer.updateConversationState("account_main");
        }
        break;
      }

      case "universal_number_switch_final_confirm": {
        const answer = text.trim().toLowerCase();

        if (answer === "2" || answer === "no") {
          // User canceled the operation
          await sendWhatsAppMessage(
            phoneNumber,
            `✅ Number switch canceled. Returning to Account menu.`
          );
          await customer.updateConversationState("account_main");
          return;
        }

        if (answer !== "1" && answer !== "yes") {
          await sendWhatsAppMessage(
            phoneNumber,
            `Please reply with *1* (Yes) or *2* (No).`
          );
          return;
        }

        // User gave final confirmation, proceed with the switch
        const switchIdx = customer.contextData?.numberSwitchIndex;
        const newNumber = customer.tempNumberToSwitch;

        if (
          switchIdx === undefined ||
          switchIdx < 0 ||
          switchIdx >= customer.phoneNumber.length ||
          !newNumber
        ) {
          console.error("❌ Invalid data for switch:", {
            switchIdx,
            newNumber,
          });
          await sendWhatsAppMessage(
            phoneNumber,
            `❌ Switch failed. Please start again from the switch menu.`
          );
          await customer.updateConversationState("account_main");
          return;
        }

        const oldNumber = customer.phoneNumber[switchIdx];
        customer.phoneNumber[switchIdx] = newNumber;

        // Add to history
        customer.numberLinkedHistory = customer.numberLinkedHistory || [];
        customer.numberLinkedHistory.push({
          number: oldNumber,
          replacedWith: newNumber,
          replacedAt: new Date(),
        });

        // Clear the temporary data
        customer.tempNumberToSwitch = null;
        await customer.updateConversationState("account_main");
        await customer.save();

        // Send notifications as in original code
        await sendWhatsAppMessage(
          phoneNumber,
          `✅ Replaced *${cleanPhoneNumber(
            oldNumber
          )}* with *${cleanPhoneNumber(newNumber)}* successfully.`
        );
        await sendWhatsAppMessage(
          phoneNumber,
          ` All your progress has been shifted to the new number.`
        );
        await sendWhatsAppMessage(
          phoneNumber,
          ` You can start shopping as a new customer with a 'hi' massage with this number !!! .`
        );

        await sendWhatsAppMessage(
          newNumber,
          `🎉  hi ${customer.name} , Your account of  Construction Materials Hub! 🏗️ has been swicthed to this number `
        );
        await sendWhatsAppMessage(
          newNumber,
          `You can continue ordering here with your new  number with the same saved  progress  `
        );
        // Store the old number for verification purpose
        customer.pendingVerificationOldNumber = oldNumber;
        customer.tempVerificationTries = 0;
        await customer.save();

        await sendWhatsAppMessage(
          newNumber,
          `📩 To verify your account, please enter the number (with country code, no + or spaces) from which you switched to this number.`
        );

        await Customer.updateOne(
          { _id: customer._id },
          { conversationState: "verify_switched_number" }
        );

        break;
      }

      case "verify_switched_number": {
        const input = text.trim().replace(/[^0-9]/g, "") + "@c.us";

        if (!customer.pendingVerificationOldNumber) {
          await sendWhatsAppMessage(
            phoneNumber,
            "❌ Something went wrong. Please try again later."
          );
          await customer.updateConversationState("account_main");
          return;
        }

        if (input === customer.pendingVerificationOldNumber) {
          // SUCCESS ✅
          customer.conversationState = "account_main";
          customer.tempVerificationTries = 0;
          customer.pendingVerificationOldNumber = null;
          await customer.save();

          await sendWhatsAppMessage(
            phoneNumber,
            `✅ Verified successfully! You can now continue shopping with this number.`
          );
          await sendMainMenu(phoneNumber, customer);
          return;
        }

        customer.tempVerificationTries += 1;

        if (customer.tempVerificationTries >= 3) {
          // FAILURE ❌ — Revert the switch
          const currentIndex = customer.phoneNumber.findIndex(
            (num) => num === phoneNumber
          );

          if (currentIndex === -1 || !customer.pendingVerificationOldNumber) {
            await sendWhatsAppMessage(
              phoneNumber,
              `❌ Verification failed and we couldn't revert the switch. Please contact support.`
            );
            await customer.updateConversationState("account_main");
            return;
          }

          const failedNumber = customer.phoneNumber[currentIndex];
          const revertNumber = customer.pendingVerificationOldNumber;

          // Replace new number back with old
          customer.phoneNumber[currentIndex] = revertNumber;

          customer.numberLinkedHistory.push({
            number: failedNumber,
            revertedBackTo: revertNumber,
            revertedAt: new Date(),
          });

          customer.tempVerificationTries = 0;
          customer.pendingVerificationOldNumber = null;
          await customer.save();

          // Notify NEW number (failed one)
          await sendWhatsAppMessage(
            phoneNumber,
            `❌ Verification failed. You have been switched back to your original number.`
          );

          // Notify OLD number (restored one)
          await sendWhatsAppMessage(
            revertNumber,
            `⚠️ Verification to switch your number to *${cleanPhoneNumber(
              failedNumber
            )}* failed. You can continue shopping here as usual.`
          );

          await sendMainMenu(revertNumber, customer);
        } else {
          // Try again
          const triesLeft = 3 - customer.tempVerificationTries;
          await customer.save();

          await sendWhatsAppMessage(
            phoneNumber,
            `❌ Incorrect number. You have ${triesLeft} attempt(s) remaining.\n\nPlease enter the number you switched *from*.`
          );
        }
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
            `4. My Account \n` +
            `5. Manage Bank Accounts\n` +
            `6. Return to Main Menu`;

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
              `4. My Account \n` +
              `5. Manage Bank Accounts\n` +
              `6. Return to Main Menu`;

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
                `4. My Account \n` +
                `5. Manage Bank Accounts\n` +
                `6. Return to Main Menu`;

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
            orderDetails += `Delivery: ${order.deliveryType}\n`;
            if (order.deliveryLocation)
              orderDetails += `Location: ${order.deliveryLocation}\n`;

            // Payment info with emoji indicators
            const paymentEmojis = {
              pending: "⏳",
              paid: "",
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
      case "order_confirmation": {
        // 1) figure out which order we're updating
        let idx = -1;
        const latestId = customer.contextData.latestOrderId;
        if (latestId) {
          idx = customer.orderHistory.findIndex((o) => o.orderId === latestId);
        }
        // fallback to the last order if that lookup failed
        if (idx < 0 && customer.orderHistory.length > 0) {
          idx = customer.orderHistory.length - 1;
        }

        // if we've found an order, update its status
        if (idx >= 0) {
          customer.orderHistory[idx].status = "pay-not-confirmed";
          customer.currentOrderStatus = "pay-not-confirmed";
          await customer.save();
        } else {
          // defensive: nothing to update
          console.error("No order to confirm for", customer.phoneNumber);
        }

        // 2) advance the conversation
        await customer.updateConversationState("order_confirmation");

        // 3) notify the user
        const latestOrder = customer.orderHistory[idx];
        if (latestOrder) {
          await sendWhatsAppMessage(
            phoneNumber,
            `Your order is in progress and will be confirmed once payment is verified\n` +
              `🧾 Order ID: *#${latestOrder.orderId}*\n` +
              `Keep it safe please, ${customer.name}.`
          );
        }

        // 4) self-pickup branch
        if (latestOrder?.deliveryType === "self_pickup") {
          if (latestOrder.totalAmount >= 25_000_000) {
            await sendWhatsAppMessage(
              phoneNumber,
              "🕐 Your order will be ready in 1 hour for pickup!"
            );
          } else if (latestOrder.totalAmount < 2_000_000) {
            await sendWhatsAppMessage(
              phoneNumber,
              "🛍️ Your order is ready for pickup immediately!"
            );
          } else {
            await sendWhatsAppMessage(
              phoneNumber,
              "📦 Your order will be prepared for pickup shortly!"
            );
          }

          await customer.updateConversationState("pickup_date_main");
          await sendWhatsAppMessage(
            phoneNumber,
            "📅 *When are you planning to pick up?*\n" +
              "1. Today\n" +
              "2. Tomorrow\n" +
              "3. Later (choose a custom date within the next 13 days)"
          );
          return; // wait for their reply
        }

        // 5) non-pickup: wrap up & return to main menu
        setTimeout(async () => {
          await sendWhatsAppMessage(
            phoneNumber,
            "Thank you for shopping with us! 😊\n" +
              "Don't forget to share your referral link and check out our discounts for more savings."
          );
          await customer.updateConversationState("main_menu");
          await sendMainMenu(phoneNumber, customer);
        }, 3000);

        break;
      }

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

// ─── Products List ─────────────────────────────────────────────────────────────
async function sendProductsList(phoneNumber, customer, subCategoryName) {
  const products = await Product.find({
    subCategories: subCategoryName,
    productType: { $in: ["Child", "Normal"] },
    visibility: "Public",
  });

  let msg = `You selected: ${subCategoryName}\n\n`;
  msg += `Available products:\n\n`;

  customer.contextData.productList = products.map((p) => p._id.toString());

  products.forEach((prod, idx) => {
    const price = prod.priceAfterDiscount ?? prod.suggestedRetailPrice ?? 0;
    msg += `${idx + 1}. ${prod.productName} - Rp ${price}\n`;
  });

  msg +=
    `\nPlease enter the product number to view its details.` +
    `\nType 0 to return to main menu or type "View cart" to view your cart`;

  await sendWhatsAppMessage(phoneNumber, msg);
  await customer.save();
}

async function sendProductDetails(to, customer, product) {
  // Determine price
  const price =
    product.finalPrice != null
      ? product.finalPrice
      : product.priceAfterDiscount || product.suggestedRetailPrice;

  // Build the prompt exactly as before
  const caption =
    `*${product.productName}*\n` +
    `${product.description || ""}\n\n` +
    `💰 Price: Rp ${price}\n\n` +
    `1- Yes I want to buy this add it to my cart\n` +
    `2- No return to previous menu\n` +
    `3- Return to main menu`;

  // If we have an image buffer, send it with the caption
  if (product.masterImage && product.masterImage.data) {
    const buf = Buffer.isBuffer(product.masterImage.data)
      ? product.masterImage.data
      : product.masterImage.data.buffer;
    const base64 = buf.toString("base64");
    const media = new MessageMedia(
      product.masterImage.contentType || "image/png",
      base64
    );
    return client.sendMessage(to, media, { caption });
  }

  // Otherwise fallback to text only
  await sendWhatsAppMessage(to, caption);
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
    `Please choose your delivery option
  
  🚚 -- Truck Delivery ------------------------
  1. Normal Delivery - Arrives in 3-5 days
  2. Speed Delivery - Arrives within 24-48 hours (+$50 extra)
  3. Early Morning Delivery - 4:00 AM–9:00 AM (+$50 extra)
  4. ⏰🔖 Eco Delivery - 8-10 days from now (5% discount on your total bill!)
  5. I will pickup on my own
  
  🛵 -- Scooter Delivery (Right Now) ---------------
  6. Normal Scooter Delivery - 20k delivery within 2.5 hours
  7. Direct Speed Scooter Delivery - 40k delivery within 30min–1 hour`
  );

  await customer.addToChatHistory(
    "Please choose your delivery option:\n1. Normal Delivery\n2. Speed delivery\n3. Early Morning delivery\n4. Eco Delivery (5% discount)\n5. I will pickup on my own\n6. Normal Scooter Delivery\n7. Direct Speed Scooter Delivery",
    "bot"
  );
}

// Updated sendOrderSummary to match the current Customer schema
async function sendOrderSummary(phoneNumber, customer) {
  // 1) Update order status to "order-made-not-paid"
  const idx = customer.orderHistory.findIndex(
    (o) => o.orderId === customer.latestOrderId
  );
  if (idx >= 0) {
    customer.orderHistory[idx].status = "order-made-not-paid";
    customer.currentOrderStatus = "order-made-not-paid";
    await customer.save();
  }

  // 2) Build the summary message
  let message = "Your total bill will be:\n\n";

  // Line items
  customer.cart.items.forEach((item, i) => {
    const name = (item.productName || "").replace(" (DISCOUNTED)", "");
    const weight = item.weight ? item.weight.replace(/1kg/i, "1 kg") : "";
    const lineTotal = formatRupiah(item.totalPrice);
    message += `${i + 1}. ${name}: ${lineTotal}`;
    if (item.quantity || weight) {
      message += ` (${item.quantity || 1}${weight ? " " + weight : ""})`;
    }
    message += `\n`;
  });

  // Subtotal
  message += `\nSubtotal for items: ${formatRupiah(customer.cart.totalAmount)}`;

  // Delivery charges
  if (customer.cart.deliveryCharge > 0) {
    message += `\nDelivery charges: ${formatRupiah(
      customer.cart.deliveryCharge
    )}`;
  } else {
    message += `\nDelivery: Free`;
  }

  // Eco delivery discount
  if (customer.cart.ecoDeliveryDiscount > 0) {
    message += `\nEco Delivery Discount (5%): -${formatRupiah(
      customer.cart.ecoDeliveryDiscount
    )}`;
  }

  // Delivery summary
  message += `\n\nDelivery option: ${customer.cart.deliveryOption}`;
  // Show delivery type and area unless it's self_pickup
  if (
    customer.cart.deliveryType &&
    customer.cart.deliveryType !== "self_pickup"
  ) {
    message += `\nDelivery type: ${customer.cart.deliveryType}`;
    if (customer.cart.deliveryLocation) {
      message += `\nDelivery area: ${customer.cart.deliveryLocation}`;
    }
  }

  // Checkout menu
  message +=
    `\n\nWould you like to proceed with payment?\n` +
    `1. Yes, proceed to payment\n` +
    `2. Modify cart\n` +
    `3. I'll pay later\n` +
    `4. Cancel and empty cart`;

  // Final total
  const finalTotal =
    customer.cart.totalAmount +
    customer.cart.deliveryCharge -
    (customer.cart.ecoDeliveryDiscount || 0);
  message += `\n\nTotal bill: ${formatRupiah(finalTotal)}`;

  // Send message and log to chat history
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
