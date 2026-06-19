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
    settings: {
      enableSubscriptions: { type: Boolean, default: true },
      defaultFrequency: { type: Number, default: 30 },
      emailNotifications: { type: Boolean, default: true },
      widgetPosition: {
        type: String,
        enum: ["before-atc", "after-atc"],
        default: "before-atc",
      },
    },
    plan: {
      type: String,
      enum: ["free", "basic", "pro"],
      default: "free",
    },
    billingChargeId: {
      type: String,
      default: null,
    },
    // Per-merchant WhatsApp connection (Meta Embedded Signup)
    // accessTokenEncrypted / pinEncrypted are AES-256-GCM strings — never store plaintext.
    whatsapp: {
      connected: { type: Boolean, default: false },
      wabaId: { type: String, default: null },
      phoneNumberId: { type: String, default: null },
      displayPhoneNumber: { type: String, default: null },
      businessName: { type: String, default: null },
      accessTokenEncrypted: { type: String, default: null },
      pinEncrypted: { type: String, default: null },
      templateStatus: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED", null],
        default: null,
      },
      connectedAt: { type: Date, default: null },
      disconnectedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
    collection: "shops",
  }
);

const Shop = mongoose.models.Shop || mongoose.model("Shop", ShopSchema);

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

// ─── WhatsApp (Meta Embedded Signup) ───────────────────────────────────────

export async function saveWhatsAppConnection(shopDomain, data) {
  await connectDB();
  const { encrypt } = await import("../utils/crypto.server.js");

  return Shop.findOneAndUpdate(
    { shopDomain },
    {
      $set: {
        whatsapp: {
          connected: true,
          wabaId: data.wabaId,
          phoneNumberId: data.phoneNumberId,
          displayPhoneNumber: data.displayPhoneNumber || null,
          businessName: data.businessName || null,
          accessTokenEncrypted: encrypt(data.accessToken),
          pinEncrypted: data.pin ? encrypt(String(data.pin)) : null,
          templateStatus: data.templateStatus || "PENDING",
          connectedAt: new Date(),
          disconnectedAt: null,
        },
      },
    },
    { returnDocument: "after" }
  );
}

export async function getWhatsAppCredentials(shopDomain) {
  await connectDB();
  const shop = await Shop.findOne({ shopDomain, isActive: true }).lean();

  if (!shop?.whatsapp?.connected || !shop.whatsapp.accessTokenEncrypted) {
    return null;
  }

  const { decrypt } = await import("../utils/crypto.server.js");

  return {
    accessToken: decrypt(shop.whatsapp.accessTokenEncrypted),
    phoneNumberId: shop.whatsapp.phoneNumberId,
    wabaId: shop.whatsapp.wabaId,
  };
}

export async function disconnectWhatsApp(shopDomain) {
  await connectDB();
  return Shop.findOneAndUpdate(
    { shopDomain },
    {
      $set: {
        "whatsapp.connected": false,
        "whatsapp.disconnectedAt": new Date(),
      },
    },
    { returnDocument: "after" }
  );
}

export async function updateTemplateStatus(shopDomain, status) {
  await connectDB();
  return Shop.findOneAndUpdate(
    { shopDomain },
    { $set: { "whatsapp.templateStatus": status } },
    { returnDocument: "after" }
  );
}

export default Shop;