// app/models/Shop.server.js

import mongoose from "mongoose";
import { connectDB } from "./db.server.js";

const ShopSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    accessToken: {
      type: String,
      required: true,
    },
    scope: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    installedAt: {
      type: Date,
      default: Date.now,
    },
    uninstalledAt: {
      type: Date,
      default: null,
    },
    // App settings per shop
    settings: {
      enableSubscriptions: { type: Boolean, default: true },
      defaultFrequency: { type: Number, default: 30 }, // days
      emailNotifications: { type: Boolean, default: true },
      widgetPosition: {
        type: String,
        enum: ["before-atc", "after-atc"],
        default: "before-atc",
      },
    },
    // Billing
    plan: {
      type: String,
      enum: ["free", "basic", "pro"],
      default: "free",
    },
    billingChargeId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
    collection: "shops",
  }
);

// Prevent model recompilation in development (HMR issue)
const Shop =
  mongoose.models.Shop || mongoose.model("Shop", ShopSchema);

// ─── Service Functions ─────────────────────────────────────────────────────────

export async function saveShop(data) {
  await connectDB();
  return Shop.findOneAndUpdate(
    { shopDomain: data.shopDomain },
    { ...data, isActive: true, uninstalledAt: null },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

export async function getShop(shopDomain) {
  await connectDB();
  return Shop.findOne({ shopDomain, isActive: true }).lean();
}

export async function deactivateShop(shopDomain) {
  await connectDB();
  return Shop.findOneAndUpdate(
    { shopDomain },
    { isActive: false, uninstalledAt: new Date() },
    { returnDocument: "after" }
  );
}

export async function updateShopSettings(shopDomain, settings) {
  await connectDB();
  return Shop.findOneAndUpdate(
    { shopDomain },
    { $set: { settings } },
    { returnDocument: "after" }
  );
}

export default Shop;