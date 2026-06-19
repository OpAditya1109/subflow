// app/services/meta-graph.server.js
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

async function graphFetch(path, options = {}) {
  const res = await fetch(`${GRAPH_BASE}${path}`, options);
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || `Graph API error (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data;
}

export async function exchangeCodeForToken(code) {
  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  });

  const data = await graphFetch(`/oauth/access_token?${params.toString()}`);
  if (!data.access_token) {
    throw new Error("Meta did not return an access_token for this code");
  }
  return data.access_token;
}

export async function registerPhoneNumber(phoneNumberId, accessToken, pin) {
  return graphFetch(`/${phoneNumberId}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}

export async function subscribeAppToWebhooks(wabaId, accessToken) {
  return graphFetch(`/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function createRenewalTemplate(wabaId, accessToken) {
  const body = {
    name: "subflow_renewal_reminder",
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text:
          "Hi {{1}}! This is a reminder that your subscription for {{2}} is due for renewal on {{3}}. " +
          "Frequency: every {{4}} days. Price: {{5}}.",
        example: {
          body_text: [["Aditya", "Premium Coffee Pack", "25 June 2026", "30", "₹499"]],
        },
      },
    ],
  };

  try {
    return await graphFetch(`/${wabaId}/message_templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn("⚠️ Template creation skipped/failed:", err.message);
    return { status: "PENDING" };
  }
}

export async function getPhoneNumberDetails(phoneNumberId, accessToken) {
  return graphFetch(
    `/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}