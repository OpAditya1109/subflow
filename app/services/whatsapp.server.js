// app/services/whatsapp.server.js
import { getWhatsAppCredentials } from "../models/Shop.server.js";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";

export function buildTemplateVariables(sub) {
  const renewalDate = new Date(sub.nextRenewalAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const name = sub.customerName ? sub.customerName.split(" ")[0] : "there";
  const product = sub.productTitle || "your subscribed product";
  const price = sub.discountedPrice > 0 ? `₹${sub.discountedPrice}` : "—";

  return [name, product, renewalDate, String(sub.frequencyDays), price];
}

export async function sendWhatsAppMessage(shopDomain, toPhone, sub) {
  const credentials = await getWhatsAppCredentials(shopDomain);

  if (!credentials) {
    console.error(`❌ No WhatsApp connection for shop ${shopDomain}`);
    return {
      success: false,
      error: "This store hasn't connected a WhatsApp Business number yet.",
    };
  }

  const { accessToken, phoneNumberId } = credentials;
  const waApiUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  const phone = toPhone.replace(/[\s\-\+]/g, "");
  const variables = buildTemplateVariables(sub);

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: "subflow_renewal_reminder",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: variables.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  try {
    const res = await fetch(waApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      console.error("❌ WhatsApp API error:", JSON.stringify(data));
      return { success: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log(`✅ WhatsApp sent to ${phone} for ${shopDomain}, id: ${messageId}`);
    return { success: true, messageId };
  } catch (err) {
    console.error("❌ WhatsApp fetch error:", err.message);
    return { success: false, error: err.message };
  }
}

export function buildRenewalReminderMessage(sub) {
  const renewalDate = new Date(sub.nextRenewalAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const name = sub.customerName ? sub.customerName.split(" ")[0] : "there";
  const product = sub.productTitle || "your subscribed product";

  return (
    `Hi ${name}! 👋\n\n` +
    `This is a reminder that your subscription for *${product}* is due for renewal on *${renewalDate}*.\n\n` +
    `📦 Frequency: Every ${sub.frequencyDays} days\n` +
    (sub.discountedPrice > 0 ? `💰 Price: ₹${sub.discountedPrice}\n\n` : "\n") +
    `If you have any questions, feel free to reply to this message.\n\n` +
    `Thank you for subscribing! 🙏`
  );
}