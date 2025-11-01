require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Import models
const { Role } = require("./models/Role");
const { User } = require("./models/User");

const MONGO_URI =
  process.env.MONGO_URL ||
  "mongodb+srv://chatbiz50_db_user:hv2Lr5GNFG3vo0Mt@cluster0.m8czptr.mongodb.net/?appName=Cluster0";

async function seedSuperAdmin() {
  console.log("🚀 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ MongoDB connected");

  try {
    // Step 1: Check or Create Super Admin Role
    let role = await Role.findOne({ name: "super_admin" });
    if (!role) {
      console.log("⚙️ Creating Super Admin role...");
      role = await Role.create({
        name: "super_admin",
        displayName: "Super Administrator",
        description: "Full system access",
        components: [
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "28",
          "33",
          "35",
          "36",
          "37",
          "61",
          "54",
          "55",
          "56",
          "71",
          "72",
          "73",
          "74",
          "81",
          "82",
          "83",
          "90",
          "101",
          "105",
          "admin-lower",
          "admin-drivers",
          "admin-employee-add",
          "admin-employee-edit",
          "admin-supplier-add",
          "admin-supplier-edit",
          "admin-customer-edit",
          "admin-products",
          "150",
          "151",
          "155",
          "160",
          "calendar",
          "support",
        ],
        categories: [
          "operations",
          "inventory",
          "stock2",
          "discount",
          "suppliers",
          "history",
          "finance",
          "admin",
          "referrals",
          "foreman",
          "settings",
        ],
        isSystemRole: true,
        isActive: true,
        priority: 100,
        createdBy: null,
        lastModifiedBy: null,
      });
    } else {
      console.log("🔎 Super Admin role already exists");
    }

    // Step 2: Check or Create Super Admin User
    let user = await User.findOne({ username: "super_admin" });
    if (!user) {
      console.log("⚙️ Creating Super Admin user...");
      const hashedPassword = await bcrypt.hash("admin12", 12);
      user = await User.create({
        username: "super_admin",
        email: "superadmin@example.com",
        password: hashedPassword,
        name: "Super Administrator",
        role: role._id,
        status: "active",
        permissions: [],
        createdBy: null,
      });
      console.log("✅ Super Admin user created successfully!");
      console.log(`🪪 Username: super_admin`);
      console.log(`🔑 Password: admin12`);
    } else {
      console.log("🔎 User 'super_admin' already exists");
      console.log("👤 Super Admin User Found:");
      console.log(user);
    }
  } catch (error) {
    console.error("❌ Seeding error:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB connection closed");
  }
}

seedSuperAdmin();
