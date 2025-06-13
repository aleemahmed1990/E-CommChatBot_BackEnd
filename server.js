// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// ========== MIDDLEWARE SETUP (MUST BE BEFORE ROUTES) ==========

// CORS Configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://192.168.18.12:3000",
      "http://127.0.0.1:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight requests
app.options("*", cors());

// ⭐ CRITICAL: Body parsing middleware MUST come before routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/videos", express.static(path.join(__dirname, "videos")));

// ========== ROUTE IMPORTS ==========
const { router: adminAuthRouter } = require("./routes/adminAuth");
const Admin = require("./models/admin");
const ordersRouter = require("./routes/orders");
const employeeRoutes = require("./routes/employeeRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const customersRouter = require("./routes/customers");
const referralVideosRoutes = require("./routes/referralVideos");
const chatbotRouter = require("./routes/chatbot-router");
const referralDataRoutes = require("./routes/referralData");
const foremanCustomersRoutes = require("./routes/foremanCustomers");

// ========== DATABASE CONNECTION ==========
mongoose
  .connect(
    process.env.MONGODB_URI ||
      "mongodb+srv://realahmedali4:HcPqEvYvWK4Yvrgs@cluster0.cjdum.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => {
    console.log("MongoDB connected successfully");
    // Seed admin user on successful connection
    Admin.seedAdmin();
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// ========== API ROUTES (AFTER MIDDLEWARE) ==========
app.use("/api/admin", adminAuthRouter);
app.use("/api/employees", employeeRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/products", productRoutes);
app.use("/api", chatbotRouter);

app.use("/api/categories", categoryRoutes);
app.use("/api", ordersRouter);
app.use("/api", customersRouter);
app.use("/api/referral-videos", referralVideosRoutes);
app.use("/api/referral-data", referralDataRoutes);
app.use("/api/foreman-customers", foremanCustomersRoutes);

// ========== CUSTOM ENDPOINTS ==========

// Video streaming endpoint
app.get("/api/video/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;

    // Find the video in database
    const Customer = require("./models/customer");
    const customer = await Customer.findOne({
      "referralvideos.imageId": videoId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = customer.referralvideos.find((v) => v.imageId === videoId);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Extract filename from the stored path and look in the videos folder
    const filename = video.imagePath.split("/").pop();
    const videoPath = path.join(__dirname, "videos", filename);

    console.log("Looking for video at:", videoPath);

    // Check if file exists
    if (!fs.existsSync(videoPath)) {
      console.error("Video file not found at:", videoPath);
      return res.status(404).json({
        error: "Video file not found on server",
        expectedPath: videoPath,
        filename: filename,
      });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Support video streaming with range requests
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": video.mimetype || "video/mp4",
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Send entire file
      const head = {
        "Content-Length": fileSize,
        "Content-Type": video.mimetype || "video/mp4",
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error("Error serving video:", error);
    res.status(500).json({ error: "Error serving video" });
  }
});

// Debug routes
app.get("/api/debug/video-files", (req, res) => {
  try {
    const videosDir = path.join(__dirname, "videos");

    if (!fs.existsSync(videosDir)) {
      return res.json({
        error: "Videos directory does not exist",
        expectedPath: videosDir,
        currentDir: __dirname,
      });
    }

    const files = fs.readdirSync(videosDir);
    const fileDetails = files.map((file) => {
      const filePath = path.join(videosDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        path: filePath,
        url: `http://localhost:5000/videos/${file}`,
        exists: fs.existsSync(filePath),
      };
    });

    res.json({
      success: true,
      videosDirectory: videosDir,
      totalFiles: files.length,
      files: fileDetails,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

app.get("/api/debug/video/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;

    const Customer = require("./models/customer");
    const customer = await Customer.findOne({
      "referralvideos.imageId": videoId,
    });

    if (!customer) {
      return res.json({
        error: "Video not found in database",
        videoId,
      });
    }

    const video = customer.referralvideos.find((v) => v.imageId === videoId);
    const filename = video.imagePath.split("/").pop();
    const fullPath = path.join(__dirname, "videos", filename);

    const fileExists = fs.existsSync(fullPath);
    let fileStats = null;

    if (fileExists) {
      fileStats = fs.statSync(fullPath);
    }

    res.json({
      success: true,
      videoId,
      database: {
        found: true,
        storedPath: video.imagePath,
        extractedFilename: filename,
        expectedPath: fullPath,
        customer: customer.name,
      },
      file: {
        exists: fileExists,
        stats: fileStats,
        directUrl: `http://localhost:5000/videos/${filename}`,
        apiUrl: `http://localhost:5000/api/video/${videoId}`,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// Analytics endpoints
app.get("/api/analytics/summary", async (req, res) => {
  try {
    const Customer = require("./models/customer");

    const totalCustomers = await Customer.countDocuments();
    const customersWithVideos = await Customer.countDocuments({
      "referralvideos.0": { $exists: true },
    });
    const customersWithReferrals = await Customer.countDocuments({
      referredBy: { $exists: true },
    });

    const videoStats = await Customer.aggregate([
      { $match: { "referralvideos.0": { $exists: true } } },
      { $unwind: "$referralvideos" },
      {
        $group: {
          _id: null,
          totalVideos: { $sum: 1 },
          totalShares: {
            $sum: { $size: { $ifNull: ["$referralvideos.sharedWith", []] } },
          },
        },
      },
    ]);

    const stats = videoStats[0] || { totalVideos: 0, totalShares: 0 };

    res.json({
      success: true,
      summary: {
        totalCustomers,
        customersWithVideos,
        customersWithReferrals,
        totalVideos: stats.totalVideos,
        totalShares: stats.totalShares,
        averageVideosPerCustomer:
          customersWithVideos > 0
            ? (stats.totalVideos / customersWithVideos).toFixed(2)
            : 0,
        averageSharesPerVideo:
          stats.totalVideos > 0
            ? (stats.totalShares / stats.totalVideos).toFixed(2)
            : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching analytics summary:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching analytics summary",
      error: error.message,
    });
  }
});

app.get("/api/analytics/trends", async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysBack = parseInt(days);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const Customer = require("./models/customer");

    const videoTrends = await Customer.aggregate([
      { $match: { "referralvideos.0": { $exists: true } } },
      { $unwind: "$referralvideos" },
      { $match: { "referralvideos.approvalDate": { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$referralvideos.approvalDate",
            },
          },
          videoCount: { $sum: 1 },
          shareCount: {
            $sum: { $size: { $ifNull: ["$referralvideos.sharedWith", []] } },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const referralTrends = await Customer.aggregate([
      { $match: { "referredBy.dateReferred": { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$referredBy.dateReferred",
            },
          },
          referralCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      trends: {
        videos: videoTrends,
        referrals: referralTrends,
      },
      period: `${daysBack} days`,
    });
  } catch (error) {
    console.error("Error fetching trends:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching trends",
      error: error.message,
    });
  }
});

// Migration and bulk update endpoints
app.post("/api/migrate-foreman-fields", async (req, res) => {
  try {
    const Customer = require("./models/customer");

    const result = await Customer.updateMany(
      { foremanStatus: { $exists: false } },
      {
        $set: {
          foremanStatus: "regular",
          foremanAppliedAt: null,
          foremanApprovedAt: null,
          foremanNotes: "",
          foremanStatusHistory: [],
          foremanSettings: {
            canApproveReferrals: false,
            canManageTeam: false,
            commissionRate: 0,
            maxTeamSize: 0,
            territory: "",
          },
          performanceMetrics: {
            customerLoyaltyScore: 0,
            referralSuccessRate: 0,
            averageOrderValue: 0,
            monthlyTarget: 0,
            lastEvaluationDate: null,
          },
        },
      }
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} customers with foreman fields`,
      result,
    });
  } catch (error) {
    console.error("Migration error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/foreman-customers/bulk-update", async (req, res) => {
  try {
    const { customerIds, status, reason } = req.body;

    if (
      !customerIds ||
      !Array.isArray(customerIds) ||
      customerIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "customerIds array is required",
      });
    }

    if (!status || !["regular", "pending", "approved"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid status is required",
      });
    }

    const Customer = require("./models/customer");

    const updateData = {
      foremanStatus: status,
      $push: {
        foremanStatusHistory: {
          status: status,
          updatedAt: new Date(),
          updatedBy: "bulk-admin",
          reason: reason || `Bulk update to ${status}`,
        },
      },
    };

    if (status === "pending") {
      updateData.foremanAppliedAt = new Date();
    } else if (status === "approved") {
      updateData.foremanApprovedAt = new Date();
    }

    const result = await Customer.updateMany(
      { _id: { $in: customerIds } },
      updateData
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} customers to ${status} status`,
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({
      success: false,
      message: "Error in bulk update",
      error: error.message,
    });
  }
});

// Foreman analytics endpoint
app.get("/api/foreman-analytics", async (req, res) => {
  try {
    const Customer = require("./models/customer");

    const analytics = await Customer.aggregate([
      {
        $facet: {
          // Overall stats
          overallStats: [
            {
              $group: {
                _id: null,
                totalCustomers: { $sum: 1 },
                avgOrderValue: {
                  $avg: {
                    $cond: [
                      {
                        $gt: [{ $size: { $ifNull: ["$orderHistory", []] } }, 0],
                      },
                      {
                        $divide: [
                          {
                            $reduce: {
                              input: { $ifNull: ["$orderHistory", []] },
                              initialValue: 0,
                              in: {
                                $add: [
                                  "$$value",
                                  { $ifNull: ["$$this.totalAmount", 0] },
                                ],
                              },
                            },
                          },
                          { $size: { $ifNull: ["$orderHistory", []] } },
                        ],
                      },
                      0,
                    ],
                  },
                },
                totalRevenue: {
                  $sum: {
                    $reduce: {
                      input: { $ifNull: ["$orderHistory", []] },
                      initialValue: 0,
                      in: {
                        $add: [
                          "$$value",
                          { $ifNull: ["$$this.totalAmount", 0] },
                        ],
                      },
                    },
                  },
                },
              },
            },
          ],

          // Foreman status breakdown
          statusBreakdown: [
            {
              $group: {
                _id: { $ifNull: ["$foremanStatus", "regular"] },
                count: { $sum: 1 },
                avgSpent: {
                  $avg: {
                    $reduce: {
                      input: { $ifNull: ["$orderHistory", []] },
                      initialValue: 0,
                      in: {
                        $add: [
                          "$$value",
                          { $ifNull: ["$$this.totalAmount", 0] },
                        ],
                      },
                    },
                  },
                },
              },
            },
          ],

          // Top performers
          topPerformers: [
            {
              $addFields: {
                totalSpent: {
                  $reduce: {
                    input: { $ifNull: ["$orderHistory", []] },
                    initialValue: 0,
                    in: {
                      $add: ["$$value", { $ifNull: ["$$this.totalAmount", 0] }],
                    },
                  },
                },
                videosCount: { $size: { $ifNull: ["$referralvideos", []] } },
              },
            },
            {
              $sort: { totalSpent: -1 },
            },
            {
              $limit: 10,
            },
            {
              $project: {
                name: 1,
                referralCode: 1,
                foremanStatus: { $ifNull: ["$foremanStatus", "regular"] },
                totalSpent: 1,
                videosCount: 1,
                phoneNumber: { $arrayElemAt: ["$phoneNumber", 0] },
              },
            },
          ],
        },
      },
    ]);

    res.json({
      success: true,
      analytics: analytics[0],
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching foreman analytics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching analytics",
      error: error.message,
    });
  }
});

// ========== PRODUCTION SETUP ==========
if (process.env.NODE_ENV === "production") {
  app.use(express.static("client/build"));

  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
  });
}

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
  console.error("Error details:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Server error",
    error: process.env.NODE_ENV === "development" ? err.stack : {},
  });
});

// ========== START SERVER ==========
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
