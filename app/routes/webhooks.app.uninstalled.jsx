// app/routes/webhooks.app.uninstalled.jsx
import { authenticate } from "../shopify.server";
import { deactivateShop } from "../models/Shop.server.js";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    await deactivateShop(shop);
    console.log(`✅ Shop deactivated: ${shop}`);
  }

  return new Response(null, { status: 200 });
};