// app/routes/api.plans.jsx
// PUBLIC endpoint — called by the storefront theme extension widget.
// Returns active subscription plans for a given product GID.
// No auth required.

import { json } from "@remix-run/node";
import { getPlans } from "../models/SubscriptionPlan.server.js";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const loader = async ({ request }) => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId"); // Shopify GID or numeric ID

  if (!shopDomain) {
    return json(
      { error: "shop parameter is required" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  try {
    const allPlans = await getPlans(shopDomain);

    // Filter plans that include this product (or return all if no productId given)
    const plans = productId
      ? allPlans.filter(
          (p) =>
            p.productIds.includes(productId) ||
            // Also match numeric ID extracted from GID
            p.productIds.some((pid) => pid.endsWith(`/${productId}`))
        )
      : allPlans;

    // Return only the fields the widget needs
    const payload = plans.map((p) => ({
      id: p._id,
      name: p.name,
      description: p.description,
      discountPercentage: p.discountPercentage,
      frequencies: p.frequencies, // e.g. [30, 60, 90]
    }));

    return json(
      { plans: payload },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (err) {
    console.error("❌ api.plans error:", err.message);
    return json(
      { error: "Failed to load plans" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
};