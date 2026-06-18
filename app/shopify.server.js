// app/shopify.server.js
// V1: Removed SUBSCRIPTION_CONTRACTS and BILLING_ATTEMPTS webhook registrations.

import 'dotenv/config.js';
import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { connectDB } from "./models/db.server.js";
import mongoose from "mongoose";
import { Session } from "@shopify/shopify-api";

const SessionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    shop: { type: String, required: true, index: true },
    state: { type: String },
    isOnline: { type: Boolean, default: false },
    scope: { type: String },
    expires: { type: Date },
    accessToken: { type: String },
    userId: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    accountOwner: { type: Boolean, default: false },
    locale: { type: String },
    collaborator: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
  },
  { collection: "shopify_sessions", timestamps: true }
);

const SessionModel =
  mongoose.models.ShopifySession ||
  mongoose.model("ShopifySession", SessionSchema);

const mongoSessionStorage = {
  async storeSession(session) {
    await connectDB();
    const sessionData = {
      id: session.id,
      shop: session.shop,
      state: session.state || "",
      isOnline: session.isOnline,
      scope: session.scope || "",
      expires: session.expires || null,
      accessToken: session.accessToken || "",
      userId: session.onlineAccessInfo?.associated_user?.id?.toString(),
      firstName: session.onlineAccessInfo?.associated_user?.first_name,
      lastName: session.onlineAccessInfo?.associated_user?.last_name,
      email: session.onlineAccessInfo?.associated_user?.email,
      accountOwner: session.onlineAccessInfo?.associated_user?.account_owner,
      locale: session.onlineAccessInfo?.associated_user?.locale,
      collaborator: session.onlineAccessInfo?.associated_user?.collaborator,
      emailVerified: session.onlineAccessInfo?.associated_user?.email_verified,
    };

    console.log("💾 Storing session:", {
      id: sessionData.id,
      shop: sessionData.shop,
      scope: sessionData.scope || "(EMPTY)",
      hasToken: !!sessionData.accessToken,
    });

    await SessionModel.findOneAndUpdate(
      { id: session.id },
      { $set: sessionData },
      { upsert: true, returnDocument: "after" }
    );
    return true;
  },

  async loadSession(id) {
    await connectDB();
    const doc = await SessionModel.findOne({ id }).lean();

    if (!doc) {
      console.warn(`⚠️ Session not found: ${id}`);
      return undefined;
    }

    const session = new Session({
      id: doc.id,
      shop: doc.shop,
      state: doc.state || "",
      isOnline: doc.isOnline,
    });

    if (doc.scope) {
      session.scope = doc.scope;
    } else {
      console.warn(`⚠️ Session loaded but scope is MISSING from MongoDB: ${id}`);
    }

    if (doc.accessToken) session.accessToken = doc.accessToken;
    if (doc.expires) session.expires = new Date(doc.expires);

    if (doc.userId) {
      session.onlineAccessInfo = {
        associated_user: {
          id: Number(doc.userId),
          first_name: doc.firstName || "",
          last_name: doc.lastName || "",
          email: doc.email || "",
          account_owner: doc.accountOwner || false,
          locale: doc.locale || "",
          collaborator: doc.collaborator || false,
          email_verified: doc.emailVerified || false,
        },
      };
    }

    return session;
  },

  async deleteSession(id) {
    await connectDB();
    await SessionModel.deleteOne({ id });
    return true;
  },

  async deleteSessions(ids) {
    await connectDB();
    await SessionModel.deleteMany({ id: { $in: ids } });
    return true;
  },

  async findSessionsByShop(shop) {
    await connectDB();
    const docs = await SessionModel.find({ shop }).lean();
    return docs.map((doc) => {
      const session = new Session({
        id: doc.id,
        shop: doc.shop,
        state: doc.state || "",
        isOnline: doc.isOnline,
      });
      if (doc.scope) session.scope = doc.scope;
      if (doc.accessToken) session.accessToken = doc.accessToken;
      if (doc.expires) session.expires = new Date(doc.expires);
      return session;
    });
  },
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: mongoSessionStorage,
  distribution: AppDistribution.AppStore,

  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/uninstalled",
    },
    // V1: Billing/contract webhooks removed — subscriptions tracked via widget only.
    // Add these back in V2 when Shopify Payments are integrated.
  },

  hooks: {
    afterAuth: async ({ session }) => {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🔐 AFTERAUTH for ${session.shop}`);

      if (!session.scope) {
        session.scope = process.env.SCOPES || "";
        console.log(`⚠️ Session scope was MISSING — set from .env`);
      }

      shopify.registerWebhooks({ session });

      try {
        const { saveShop } = await import("./models/Shop.server.js");
        await saveShop({
          shopDomain: session.shop,
          accessToken: session.accessToken,
          scope: session.scope,
          isActive: true,
          installedAt: new Date(),
        });
        console.log(`✅ Shop saved: ${session.shop}`);
      } catch (err) {
        console.error("❌ Failed to save shop:", err.message);
      }
    },
  },

  future: {
    unstable_newEmbeddedAuthStrategy: false,
    expiringOfflineAccessTokens: false,
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;