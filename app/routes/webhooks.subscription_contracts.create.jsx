// app/routes/webhooks.subscription_contracts.create.jsx
// V1: Subscriptions are captured via storefront widget → /api/subscribe.
// This webhook is kept to satisfy Shopify registration but does nothing.

import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  await authenticate.webhook(request);
  // No-op for V1 — subscribers come from the storefront widget directly.
  return new Response(null, { status: 200 });
};