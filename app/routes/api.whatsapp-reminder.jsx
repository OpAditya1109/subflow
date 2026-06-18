// app/routes/api.whatsapp-reminder.jsx
// Two uses:
//   POST /api/whatsapp-reminder  { subscriptionId, shopDomain }  → send to one subscriber (merchant button)
//   POST /api/whatsapp-reminder  { cron: true, secret: "..." }    → bulk send to all due subscribers (cron job)

import { json } from "@remix-run/node";
import {
  getSubscriptionById,
  getSubscriptionsDueForReminder,
  markReminderSent,
} from "../models/Subscription.server.js";
import { sendWhatsAppMessage } from "../services/whatsapp.server.js";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Bulk cron mode ────────────────────────────────────────────────────────
  if (body.cron === true) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && body.secret !== cronSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const daysAhead = Number(body.daysAhead) || 3;
    const subs = await getSubscriptionsDueForReminder(daysAhead);

    const results = [];
    for (const sub of subs) {
      if (!sub.customerPhone) continue;

      const result = await sendWhatsAppMessage(sub.customerPhone, sub);

      if (result.success) {
        await markReminderSent(sub._id);
      }

      results.push({
        subscriptionId: sub._id,
        phone: sub.customerPhone,
        ...result,
      });
    }

    return json({
      processed: results.length,
      results,
    });
  }

  // ── Single reminder mode (merchant button) ─────────────────────────────────
  const { subscriptionId, shopDomain } = body;

  if (!subscriptionId || !shopDomain) {
    return json(
      { error: "subscriptionId and shopDomain are required" },
      { status: 400 }
    );
  }

  const sub = await getSubscriptionById(subscriptionId, shopDomain);
  if (!sub) {
    return json({ error: "Subscription not found" }, { status: 404 });
  }

  if (!sub.customerPhone) {
    return json(
      { error: "This subscriber has no phone number on record." },
      { status: 422 }
    );
  }

  const result = await sendWhatsAppMessage(sub.customerPhone, sub);

  if (result.success) {
    await markReminderSent(sub._id);
  }

  return json(result);
};