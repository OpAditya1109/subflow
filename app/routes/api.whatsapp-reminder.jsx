// app/routes/api.whatsapp-reminder.jsx
// Three uses:
//   GET  /api/whatsapp-reminder                          → automatic Vercel Cron trigger (runs on a schedule, see vercel.json)
//   POST /api/whatsapp-reminder  { subscriptionId }        → send to one subscriber (merchant button, requires admin auth)
//   POST /api/whatsapp-reminder  { cron: true, secret }    → bulk send to all due subscribers (manual/external trigger)

import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  getSubscriptionById,
  getSubscriptionsDueForReminder,
  markReminderSent,
} from "../models/Subscription.server.js";
import { sendWhatsAppMessage } from "../services/whatsapp.server.js";

async function runBulkReminders(daysAhead = 3) {
  const subs = await getSubscriptionsDueForReminder(daysAhead);

  const results = [];
  for (const sub of subs) {
    if (!sub.customerPhone) continue;

    const result = await sendWhatsAppMessage(sub.shopDomain, sub.customerPhone, sub);

    if (result.success) {
      await markReminderSent(sub._id);
    }

    results.push({
      subscriptionId: sub._id,
      shopDomain: sub.shopDomain,
      phone: sub.customerPhone,
      ...result,
    });
  }

  return { processed: results.length, results };
}

// ── Automatic trigger (Vercel Cron) ─────────────────────────────────────────
// Vercel calls this on the schedule defined in vercel.json and automatically
// attaches `Authorization: Bearer ${CRON_SECRET}` when a CRON_SECRET env var
// is set on the project — no manual button needed any more.
export const loader = async ({ request }) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysAhead = Number(url.searchParams.get("daysAhead")) || 3;

  const summary = await runBulkReminders(daysAhead);
  return json(summary);
};

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

  // ── Bulk cron mode (manual/external trigger, e.g. curl or another scheduler) ──
  if (body.cron === true) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && body.secret !== cronSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const daysAhead = Number(body.daysAhead) || 3;
    const summary = await runBulkReminders(daysAhead);
    return json(summary);
  }

  // ── Single reminder mode (merchant button) ─────────────────────────────────
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const { subscriptionId } = body;

  if (!subscriptionId) {
    return json({ error: "subscriptionId is required" }, { status: 400 });
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

  const result = await sendWhatsAppMessage(sub.shopDomain, sub.customerPhone, sub);

  if (result.success) {
    await markReminderSent(sub._id);
  }

  return json(result);
};