// app/models/SubscriptionPlan.server.js

import mongoose from "mongoose";
import { connectDB } from "./db.server.js";

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    // Shopify product GIDs — e.g. ["gid://shopify/Product/123456"]
    productIds: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => arr.length > 0,
        message: "At least one product is required",
      },
    },
    // Human-readable product titles (cached to avoid extra API calls)
    productTitles: {
      type: [String],
      default: [],
    },
    // Discount percentage off original price (e.g. 10 = 10% off)
    discountPercentage: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      default: 10,
    },
    // Delivery frequency options for this plan
    frequencies: {
      type: [Number], // array of day values, e.g. [15, 30, 45, 60]
      required: true,
      validate: [
        {
          validator: (arr) => arr.length > 0,
          message: "At least one frequency is required",
        },
        {
          validator: (arr) =>
            arr.every((freq) => [7, 15, 30, 60, 90].includes(freq)),
          message: "All frequencies must be one of: 7, 15, 30, 60, 90 days",
        },
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Track how many subscribers are on this plan
    subscriberCount: {
      type: Number,
      default: 0,
    },
    shopifySellingPlanGroupId: {
  type: String,
  default: null, 
},
shopifySynced: {
  type: Boolean,
  default: false,
},
  },
  {
    timestamps: true,
    collection: "subscription_plans",
  }
);

// Compound index for shop + active plans (most common query)
SubscriptionPlanSchema.index({ shopDomain: 1, isActive: 1 });

const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ||
  mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);

// ─── Service Functions ─────────────────────────────────────────────────────────

export async function createPlan(data) {
  await connectDB();
  const plan = new SubscriptionPlan(data);
  return plan.save();
}

export async function getPlans(shopDomain) {
  await connectDB();
  return SubscriptionPlan.find({ shopDomain, isActive: true })
    .sort({ createdAt: -1 })
    .lean();
}

export async function getPlanById(id, shopDomain) {
  await connectDB();
  return SubscriptionPlan.findOne({ _id: id, shopDomain }).lean();
}

export async function updatePlan(id, shopDomain, updates) {
  await connectDB();
  return SubscriptionPlan.findOneAndUpdate(
    { _id: id, shopDomain },
    { $set: updates },
    { returnDocument: "after", runValidators: true }
  );
}

export async function deletePlan(id, shopDomain) {
  await connectDB();
  // Soft delete — keep data for history
  return SubscriptionPlan.findOneAndUpdate(
    { _id: id, shopDomain },
    { isActive: false },
    { returnDocument: "after" }
  );
}

export async function incrementSubscriberCount(planId) {
  await connectDB();
  return SubscriptionPlan.findByIdAndUpdate(planId, {
    $inc: { subscriberCount: 1 },
  });
}

export async function decrementSubscriberCount(planId) {
  await connectDB();
  return SubscriptionPlan.findByIdAndUpdate(planId, {
    $inc: { subscriberCount: -1 },
  });
}

export default SubscriptionPlan;