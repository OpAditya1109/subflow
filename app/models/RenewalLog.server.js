// app/models/RenewalLog.server.js
// Immutable audit trail — one doc per renewal attempt.
// Tracks all subscription renewal attempts (success/failed/skipped) for analytics and debugging.

import mongoose from "mongoose";
import { connectDB } from "./db.server.js";

const RenewalLogSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },
    // customerId is optional — subscriptions without a customerId can still be logged
    // (e.g., subscriptions created through the storefront widget with no Shopify order linked yet)
    customerId: {
      type: String,
      required: false,
      default: null,
    },
    customerEmail: {
      type: String,
      required: true,
    },
    productId: {
      type: String,
      required: true,
    },
    variantId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["success", "failed", "skipped"],
      required: true,
      index: true,
    },
    // Shopify Draft Order / Order ID if successful
    shopifyOrderId: {
      type: String,
      default: null,
    },
    // Amount charged
    amount: {
      type: Number,
      default: null,
    },
    // Currency defaults to INR for Indian merchants
    currency: {
      type: String,
      default: "INR",
    },
    // Error message if failed
    errorMessage: {
      type: String,
      default: null,
    },
    errorCode: {
      type: String,
      default: null,
    },
    // Retry count for this attempt
    attemptNumber: {
      type: Number,
      default: 1,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "renewal_logs",
  }
);

// Index for analytics queries
RenewalLogSchema.index({ shopDomain: 1, status: 1 });
RenewalLogSchema.index({ processedAt: -1 });

const RenewalLog =
  mongoose.models.RenewalLog ||
  mongoose.model("RenewalLog", RenewalLogSchema);

// ─── Service Functions ─────────────────────────────────────────────────────────

export async function logRenewal(data) {
  await connectDB();
  const log = new RenewalLog(data);
  return log.save();
}

export async function getRenewalLogs(shopDomain, subscriptionId = null) {
  await connectDB();
  const query = { shopDomain };
  if (subscriptionId) query.subscriptionId = subscriptionId;
  return RenewalLog.find(query).sort({ processedAt: -1 }).limit(100).lean();
}

export async function getRenewalStats(shopDomain) {
  await connectDB();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return RenewalLog.aggregate([
    {
      $match: {
        shopDomain,
        processedAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);
}

export default RenewalLog;