import { authenticate } from "../shopify.server";
import { getSubscriptionsByCustomer } from "../models/Subscription.server.js";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customerEmail = payload?.customer?.email;
  const customerPhone = payload?.customer?.phone;

  if (customerEmail || customerPhone) {
    const records = await getSubscriptionsByCustomer(shop, {
      email: customerEmail,
      phone: customerPhone,
    });
    console.log(
      `📋 Data request for ${customerEmail || customerPhone} on ${shop}: ${records.length} subscription record(s) found.`
    );
  }

  return new Response(null, { status: 200 });
};