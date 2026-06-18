// app/routes/webhooks.subscription_billing_attempts.success.jsx
// V1: No Shopify billing. Kept as a no-op stub.

import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  await authenticate.webhook(request);
  return new Response(null, { status: 200 });
};