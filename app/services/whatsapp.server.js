// app/services/whatsapp.server.js
// Meta WhatsApp Cloud API — sends renewal reminder messages

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

/**
 * Build the ordered body-variable list for the "subflow_renewal_reminder" template.
 * Order must match {{1}}..{{5}} exactly as set up in Meta WhatsApp Manager:
 *   {{1}} name   {{2}} product   {{3}} renewal date   {{4}} frequency days   {{5}} price
 *
 * @param {object} sub - Subscription document
 * @returns {string[]}
 */
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

/**
 * Send the approved "subflow_renewal_reminder" WhatsApp template to a customer.
 *
 * @param {string} toPhone  - Recipient phone number with country code, no "+" e.g. "919876543210"
 * @param {object} sub      - Subscription document (used to fill the template variables)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendWhatsAppMessage(toPhone, sub) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!accessToken) {
    console.error("❌ WHATSAPP_ACCESS_TOKEN not set in .env");
    return { success: false, error: "WHATSAPP_ACCESS_TOKEN not configured" };
  }

  if (!PHONE_NUMBER_ID) {
    console.error("❌ WHATSAPP_PHONE_NUMBER_ID not set in .env");
    return { success: false, error: "WHATSAPP_PHONE_NUMBER_ID not configured" };
  }

  // Normalise phone: strip spaces, dashes, leading "+"
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
    const res = await fetch(WA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg =
        data?.error?.message || `HTTP ${res.status}`;
      console.error("❌ WhatsApp API error:", JSON.stringify(data));
      return { success: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log(`✅ WhatsApp sent to ${phone}, id: ${messageId}`);
    return { success: true, messageId };
  } catch (err) {
    console.error("❌ WhatsApp fetch error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Build the renewal reminder message for a subscriber (plain-text preview only,
 * not sent directly — the actual send uses the approved template above).
 *
 * @param {object} sub - Subscription document
 * @returns {string}
 */
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
    (sub.discountedPrice > 0
      ? `💰 Price: ₹${sub.discountedPrice}\n\n`
      : "\n") +
    `If you have any questions, feel free to reply to this message.\n\n` +
    `Thank you for subscribing! 🙏`
  );
}