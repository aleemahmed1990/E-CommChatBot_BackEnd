const mongoose = require("mongoose");
const Customer = require("./models/customer"); // Adjust the path as needed

// MongoDB connection URL
const mongoURI =
  "mongodb+srv://realahmedali4:HcPqEvYvWK4Yvrgs@cluster0.cjdum.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Connect to MongoDB
mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("MongoDB connected successfully");

    try {
      // Add the new field with a default empty object
      await Customer.updateMany(
        { discountProductContext: { $exists: false } },
        {
          $set: {
            discountProductContext: {
              productId: null,
              productName: null,
              discountPrice: null,
              originalPrice: null,
              category: null,
            },
          },
        }
      );

      console.log(
        "Successfully added discountProductContext to all customer documents"
      );
    } catch (error) {
      console.error("Error updating documents:", error);
    } finally {
      // Close the connection
      await mongoose.connection.close();
    }
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
