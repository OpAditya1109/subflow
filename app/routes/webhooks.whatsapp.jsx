import crypto from "crypto";
import { connectDB } from "../models/db.server.js";
import Shop, { updateTemplateStatus } from "../models/Shop.server.js";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
};

export const action = async ({ request }) => {
  const rawBody = await request.text();

  const signature = request.headers.get("x-hub-signature-256") || "";
  const expectedSig =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.META_APP_SECRET || "")
      .update(rawBody)
      .digest("hex");

  if (signature !== expectedSig) {
    console.warn("⚠️ WhatsApp webhook signature mismatch — ignoring event");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Ensure DB connection before any queries
  try {
    await connectDB();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    return new Response("Database connection error", { status: 500 });
  }

  for (const entry of payload.entry || []) {
    const wabaId = entry.id;

    for (const change of entry.changes || []) {
      const { field, value } = change;

      if (field === "message_template_status_update") {
        const shop = await Shop.findOne({ "whatsapp.wabaId": wabaId }).lean();
        if (shop) {
          await updateTemplateStatus(shop.shopDomain, value.event);
          console.log(
            `📋 Template "${value.message_template_name}" for ${shop.shopDomain}: ${value.event}`
          );
        }
      }

      if (field === "messages" && value.statuses) {
        for (const status of value.statuses) {
          console.log(`📬 Message ${status.id} for WABA ${wabaId}: ${status.status}`);
        }
      }
    }
  }

  return new Response(null, { status: 200 });
};