// scripts/backfillNumberSwitchIndex.js

const mongoose = require("mongoose");
const Customer = require("./models/customer"); // adjust path if needed

async function backfillNumberSwitchIndex() {
  await mongoose.connect(
    "mongodb+srv://realahmedali4:HcPqEvYvWK4Yvrgs@cluster0.cjdum.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  );

  console.log("MongoDB connected.");

  const result = await Customer.updateMany(
    { "contextData.numberSwitchIndex": { $exists: false } },
    { $set: { "contextData.numberSwitchIndex": null } }
  );

  console.log(
    `✅ Backfilled ${result.modifiedCount} customer(s) with numberSwitchIndex = null`
  );

  await mongoose.disconnect();
}

backfillNumberSwitchIndex().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
