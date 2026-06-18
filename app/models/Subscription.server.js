// app/models/Subscription.server.js

import mongoose from "mongoose";
import { connectDB } from "./db.server.js";

const SubscriptionSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    // No longer tied to Shopify SubscriptionContract — we track manually
    shopifyContractId: {
      type: String,
      default: null,
      index: true,
    },
    customerId: {
      type: String,
      default: null, // null for storefront-captured subscribers (no Shopify customer GID needed)
    },
    customerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    customerName: {
      type: String,
      default: "",
    },
    // Phone number for WhatsApp reminders — e.g. "919876543210" (no + prefix)
    customerPhone: {
      type: String,
      default: null,
      trim: true,
    },
    productId: {
      type: String,
      required: true,
    },
    productTitle: {
      type: String,
      default: "",
    },
    variantId: {
      type: String,
      required: true,
    },
    variantTitle: {
      type: String,
      default: "",
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: false,
      index: true,
    },
    frequencyDays: {
      type: Number,
      required: true,
      enum: [7,15, 30, 60, 90],
    },
    discountPercentage: {
      type: Number,
      default: 0,
    },
    originalPrice: {
      type: Number,
      default: 0,
    },
    discountedPrice: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["active", "paused", "cancelled", "expired", "failed"],
      default: "active",
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    nextRenewalAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastRenewedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    renewalCount: {
      type: Number,
      default: 0,
    },
    orderIds: {
      type: [String],
      default: [],
    },
    // Track when the last WhatsApp reminder was sent
    lastReminderSentAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "subscriptions",
  }
);

// Compound indexes
SubscriptionSchema.index({ shopDomain: 1, status: 1 });
SubscriptionSchema.index({ shopDomain: 1, customerId: 1 });
SubscriptionSchema.index({ nextRenewalAt: 1, status: 1 });
SubscriptionSchema.index({ shopifyContractId: 1, shopDomain: 1 });

const Subscription =
  mongoose.models.Subscription ||
  mongoose.model("Subscription", SubscriptionSchema);

// ─── Service Functions ────────────────────────────────────────────────────────

export async function createSubscription(data) {
  await connectDB();
  const sub = new Subscription(data);
  return sub.save();
}

export async function getSubscriptions(shopDomain, filters = {}) {
  await connectDB();
  const query = { shopDomain, ...filters };
  return Subscription.find(query)
    .populate("planId", "name discountPercentage frequencies")
    .sort({ createdAt: -1 })
    .lean();
}

export async function getSubscriptionById(id, shopDomain) {
  await connectDB();
  return Subscription.findOne({ _id: id, shopDomain }).lean();
}

export async function getCustomerSubscriptions(shopDomain, customerId) {
  await connectDB();
  return Subscription.find({ shopDomain, customerId, status: "active" }).lean();
}

export async function getSubscriptionByContractId(shopDomain, shopifyContractId) {
  await connectDB();
  return Subscription.findOne({ shopDomain, shopifyContractId });
}

export async function cancelSubscription(id, shopDomain, reason = null) {
  await connectDB();
  return Subscription.findOneAndUpdate(
    { _id: id, shopDomain },
    {
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason,
    },
    { returnDocument: "after" }
  );
}

export async function pauseSubscription(id, shopDomain) {
  await connectDB();
  return Subscription.findOneAndUpdate(
    { _id: id, shopDomain },
    { status: "paused" },
    { returnDocument: "after" }
  );
}

export async function resumeSubscription(id, shopDomain) {
  await connectDB();
  return Subscription.findOneAndUpdate(
    { _id: id, shopDomain },
    { status: "active" },
    { returnDocument: "after" }
  );
}

export async function recordRenewal(id, shopDomain, orderId, nextRenewalAt) {
  await connectDB();
  return Subscription.findOneAndUpdate(
    { _id: id, shopDomain },
    {
      $inc: { renewalCount: 1 },
      $push: { orderIds: orderId },
      lastRenewedAt: new Date(),
      nextRenewalAt,
    },
    { returnDocument: "after" }
  );
}

export async function markReminderSent(id) {
  await connectDB();
  return Subscription.findByIdAndUpdate(id, {
    lastReminderSentAt: new Date(),
  });
}

export async function getSubscriptionsDueForRenewal() {
  await connectDB();
  return Subscription.find({
    status: "active",
    nextRenewalAt: { $lte: new Date() },
  }).lean();
}

// Subscriptions due for reminder — renewal within next N days, no reminder sent recently
export async function getSubscriptionsDueForReminder(daysAhead = 3) {
  await connectDB();
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return Subscription.find({
    status: "active",
    customerPhone: { $ne: null },
    nextRenewalAt: { $gte: now, $lte: futureDate },
    $or: [
      { lastReminderSentAt: null },
      { lastReminderSentAt: { $lte: oneDayAgo } },
    ],
  }).lean();
}

export async function getSubscriptionStats(shopDomain) {
  await connectDB();
  const [total, active, paused, cancelled, revenue] = await Promise.all([
    Subscription.countDocuments({ shopDomain }),
    Subscription.countDocuments({ shopDomain, status: "active" }),
    Subscription.countDocuments({ shopDomain, status: "paused" }),
    Subscription.countDocuments({ shopDomain, status: "cancelled" }),
    Subscription.aggregate([
      { $match: { shopDomain, status: "active" } },
      { $group: { _id: null, totalMRR: { $sum: "$discountedPrice" } } },
    ]),
  ]);

  return {
    total,
    active,
    paused,
    cancelled,
    estimatedMRR: revenue[0]?.totalMRR ?? 0,
  };
}

export default Subscription;