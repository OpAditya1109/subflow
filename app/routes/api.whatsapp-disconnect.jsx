import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { disconnectWhatsApp } from "../models/Shop.server.js";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  await disconnectWhatsApp(session.shop);

  return json({ success: true });
};