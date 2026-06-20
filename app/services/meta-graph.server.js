// app/services/meta-graph.server.js

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

// Central fetch with timeout + error normalisation
async function graphFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s

  try {
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });

    const data = await res.json();

    if (!res.ok) {
      const message =
        data?.error?.message || `Graph API error (HTTP ${res.status})`;
      const err = new Error(message);
      err.code = data?.error?.code;
      err.subcode = data?.error?.error_subcode;
      throw err;
    }

    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Meta API timed out after 10s");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

export async function exchangeCodeForToken(code) {
  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");
  const redirectUri = requireEnv("META_REDIRECT_URI");

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const data = await graphFetch(`/oauth/access_token?${params.toString()}`);

  if (!data.access_token) {
    throw new Error("Meta did not return an access_token for this code");
  }

  return data.access_token;
}

// ─── Phone Number ─────────────────────────────────────────────────────────────

export async function registerPhoneNumber(phoneNumberId, accessToken, pin) {
  try {
    return await graphFetch(`/${phoneNumberId}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
  } catch (err) {
    // Already registered — safe to continue
    if (
      err.message?.toLowerCase().includes("already registered") ||
      err.code === 100
    ) {
      console.log("ℹ️ Phone already registered, skipping registration step");
      return { success: true, alreadyRegistered: true };
    }
    throw err;
  }
}

export async function getPhoneNumberDetails(phoneNumberId, accessToken) {
  return graphFetch(
    `/${phoneNumberId}?fields=display_phone_number,verified_name`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function subscribeAppToWebhooks(wabaId, accessToken) {
  return graphFetch(`/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ─── Template ─────────────────────────────────────────────────────────────────

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
          "Frequency: every {{4}} days. Amount: {{5}}.",
        example: {
          body_text: [
            ["Aditya", "Premium Coffee Pack", "25 June 2026", "30", "₹499"],
          ],
        },
      },
      {
        type: "FOOTER",
        text: "Reply STOP to cancel your subscription.",
      },
    ],
  };

  try {
    const result = await graphFetch(`/${wabaId}/message_templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    console.log(`✅ Template submitted for WABA ${wabaId}, status: ${result.status}`);
    return result; // { id, status: "PENDING" }
  } catch (err) {
    // Template with this name already exists — not an error, just skip
    if (
      err.message?.toLowerCase().includes("already exists") ||
      err.subcode === 2388085
    ) {
      console.log("ℹ️ Template already exists for this WABA, skipping creation");
      return { status: "PENDING", alreadyExists: true };
    }

    // Everything else is a real error — surface it so connect flow fails loudly
    console.error(`❌ Template creation failed for WABA ${wabaId}:`, err.message);
    throw err;
  }
}