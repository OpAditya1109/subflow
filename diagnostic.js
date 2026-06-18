// diagnostic.js - Check what's in MongoDB and why scope is missing

import mongoose from "mongoose";
import 'dotenv/config.js';
const mongoUri = "mongodb+srv://matrimonybhavana:bhavana@cluster0.ceqvmzx.mongodb.net/subflow?retryWrites=true&w=majority";

try {
  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB\n");

  const sessions = await mongoose.connection.collection("shopify_sessions")
    .find({ shop: "aditya-test-hub.myshopify.com" })
    .toArray();

  if (sessions.length === 0) {
    console.log("❌ No sessions found for aditya-test-hub.myshopify.com");
  } else {
    console.log(`📊 Found ${sessions.length} session(s):\n`);
    sessions.forEach((session, idx) => {
      console.log(`Session ${idx + 1}:`);
      console.log(`  ID: ${session.id}`);
      console.log(`  Shop: ${session.shop}`);
      console.log(`  Scope: ${session.scope || "(EMPTY)"}`);
      console.log(`  AccessToken: ${session.accessToken ? "YES" : "NO"}`);
      console.log(`  IsOnline: ${session.isOnline}`);
      console.log(`  CreatedAt: ${session.createdAt}`);
      console.log(`  UpdatedAt: ${session.updatedAt}`);
      console.log(`  All Fields: ${JSON.stringify(Object.keys(session), null, 2)}`);
      console.log("");
    });
  }

  // Check environment
  console.log("\n📋 Environment Check:");
  console.log(`  SCOPES env var: ${process.env.SCOPES || "(NOT SET)"}`);

  process.exit(0);
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}