// app/models/db.server.js
// MongoDB singleton connection for Remix + HMR safety

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "❌ MONGODB_URI not found in environment.\n" +
    "Add it to your .env file:\n" +
    "MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/subflow"
  );
}

// Cache connection across hot reloads in development
let cached = global.__mongoose;
if (!cached) {
  cached = global.__mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: "subflow",
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
      .then((m) => {
        console.log("✅ MongoDB connected");
        return m;
      })
      .catch((err) => {
        cached.promise = null;
        console.error("❌ MongoDB connection error:", err.message);
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;