// app/routes/api.subscribe.jsx
// PUBLIC endpoint — called from the storefront theme extension widget.
// No Shopify admin auth required; CORS-friendly.

import { json } from "@remix-run/node";
import { createSubscription } from "../models/Subscription.server.js";
import {
  getPlanById,
  incrementSubscriberCount,
} from "../models/SubscriptionPlan.server.js";
// ─── CORS helper ─────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Handle preflight OPTIONS requests from browser
export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("Origin")),
    });
  }
  return json({ error: "Method not allowed" }, { status: 405 });
};

// ─── POST /api/subscribe ──────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  const {
    shopDomain,
    customerName,
    customerEmail,
    planId,
    customerPhone,
    productId,
    productTitle,
    variantId,
    variantTitle,
    frequencyDays,
    originalPrice,
    discountedPrice,
    currency = "INR",
  } = body;



  
  // ── Validation ────────────────────────────────────────────────────────────
  const missing = [];
  if (!shopDomain) missing.push("shopDomain");
  if (!customerEmail) missing.push("customerEmail");
  if (!customerPhone) missing.push("customerPhone");
  if (!productId) missing.push("productId");
  if (!variantId) missing.push("variantId");
  if (!frequencyDays) missing.push("frequencyDays");

  if (missing.length > 0) {
    return json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  // Validate frequency
  const validFrequencies = [7, 15, 30, 60, 90];
  if (!validFrequencies.includes(Number(frequencyDays))) {
    return json(
      { error: "frequencyDays must be one of: 7, 15, 30, 60, 90" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  // Simple email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return json(
      { error: "Invalid email address" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  // ── Save to MongoDB ───────────────────────────────────────────────────────
  const freqDays = Number(frequencyDays);
  const nextRenewalAt = new Date(Date.now() + freqDays * 24 * 60 * 60 * 1000);
  let discountPct = 0;
if (planId) {
  const plan = await getPlanById(planId, shopDomain);
  if (plan) {
    discountPct = plan.discountPercentage;
    await incrementSubscriberCount(planId);
  }
}

  try {
    const subscription = await createSubscription({
      shopDomain: shopDomain.toLowerCase().trim(),
      customerName: customerName || "",
      customerEmail: customerEmail.toLowerCase().trim(),
      customerPhone: customerPhone.replace(/[\s\-]/g, ""), // normalise
      productId,
      productTitle: productTitle || "",
      variantId,
      variantTitle: variantTitle || "",
      frequencyDays: freqDays,
    
      originalPrice: Number(originalPrice) || 0,
      discountedPrice: Number(discountedPrice) || Number(originalPrice) || 0,
      currency,
      status: "active",
       planId: planId || null,
  discountPercentage: discountPct,
      nextRenewalAt,
    });

    return json(
      {
        success: true,
        subscriptionId: subscription._id,
        nextRenewalAt: subscription.nextRenewalAt,
      },
      { status: 201, headers: corsHeaders(origin) }
    );
  } catch (err) {
    console.error("❌ createSubscription error:", err.message);
    return json(
      { error: "Failed to save subscription. Please try again." },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
};