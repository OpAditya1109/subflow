// app/routes/webhooks.app.scopes_update.jsx
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  // No DB action needed for scope updates
  return new Response(null, { status: 200 });
};