import { authenticate } from "../shopify.server";
import { redactShopData } from "../models/Subscription.server.js";
import Shop from "../models/Shop.server.js";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const { deleted } = await redactShopData(shop);
  await Shop.deleteOne({ shopDomain: shop });

  console.log(`🗑️ Shop redact complete for ${shop}: ${deleted} subscription record(s) deleted`);

  return new Response(null, { status: 200 });
};