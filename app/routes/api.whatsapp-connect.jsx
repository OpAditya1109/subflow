import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { saveWhatsAppConnection } from "../models/Shop.server.js";
import {
  exchangeCodeForToken,
  registerPhoneNumber,
  subscribeAppToWebhooks,
  createRenewalTemplate,
  getPhoneNumberDetails,
} from "../services/meta-graph.server.js";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { code, wabaId, phoneNumberId } = body;
  if (!code || !wabaId || !phoneNumberId) {
    return json(
      { error: "code, wabaId and phoneNumberId are required" },
      { status: 400 }
    );
  }

  try {
    const accessToken = await exchangeCodeForToken(code);

    const pin = String(Math.floor(100000 + Math.random() * 900000));
    await registerPhoneNumber(phoneNumberId, accessToken, pin);

    await subscribeAppToWebhooks(wabaId, accessToken);

    const templateResult = await createRenewalTemplate(wabaId, accessToken);

    const phoneDetails = await getPhoneNumberDetails(phoneNumberId, accessToken);

    await saveWhatsAppConnection(shopDomain, {
      wabaId,
      phoneNumberId,
      accessToken,
      pin,
      displayPhoneNumber: phoneDetails.display_phone_number,
      businessName: phoneDetails.verified_name,
      templateStatus: templateResult.status || "PENDING",
    });

    return json({
      success: true,
      displayPhoneNumber: phoneDetails.display_phone_number,
      businessName: phoneDetails.verified_name,
      templateStatus: templateResult.status || "PENDING",
    });
  } catch (err) {
    console.error(`❌ WhatsApp connect failed for ${shopDomain}:`, err.message);
    return json({ error: err.message }, { status: 500 });
  }
};