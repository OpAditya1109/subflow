import { authenticate } from "../shopify.server";
import { redactCustomerData } from "../models/Subscription.server.js";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customerEmail = payload?.customer?.email;
  const customerPhone = payload?.customer?.phone;

  if (customerEmail || customerPhone) {
    const { matched } = await redactCustomerData(shop, {
      email: customerEmail,
      phone: customerPhone,
    });
    console.log(`🗑️ Redacted ${matched} subscription record(s) for ${shop}`);
  }

  return new Response(null, { status: 200 });
};