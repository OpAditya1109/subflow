// app/routes/app.settings.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Select,
  Checkbox,
  Button,
  Banner,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShop, updateShopSettings } from "../models/Shop.server.js";

export const loader = async ({ request }) => {
  let session;
  try {
    ({ session } = await authenticate.admin(request));
  } catch (err) {
    if (err instanceof Response) throw err;
    throw err;
  }
  const shop = await getShop(session.shop);
  return json({
    settings: shop?.settings || {},
    whatsapp: shop?.whatsapp || { connected: false },
    metaAppId: process.env.META_APP_ID || "",
    metaConfigId: process.env.META_CONFIG_ID || "",
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const settings = {
    enableSubscriptions: formData.get("enableSubscriptions") === "true",
    defaultFrequency: Number(formData.get("defaultFrequency")),
    emailNotifications: formData.get("emailNotifications") === "true",
    widgetPosition: formData.get("widgetPosition"),
  };

  await updateShopSettings(session.shop, settings);
  return json({ success: "Settings saved successfully." });
};

export default function SettingsPage() {
  const { settings, whatsapp, metaAppId, metaConfigId } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [waConnected, setWaConnected] = useState(whatsapp?.connected || false);
  const [waPhone, setWaPhone] = useState(whatsapp?.displayPhoneNumber || null);
  const [waBusinessName, setWaBusinessName] = useState(whatsapp?.businessName || null);
  const [waTemplateStatus, setWaTemplateStatus] = useState(whatsapp?.templateStatus || null);
  const [waLoading, setWaLoading] = useState(false);
  const [waError, setWaError] = useState(null);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: metaAppId,
        autoLogAppEvents: true,
        xfbml: true,
        version: "v22.0",
      });
      setSdkReady(true);
    };
    if (!document.getElementById("facebook-jssdk")) {
      const js = document.createElement("script");
      js.id = "facebook-jssdk";
      js.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(js);
    }
  }, [metaAppId]);

  useEffect(() => {
    const handler = (event) => {
      if (!event.origin?.endsWith("facebook.com")) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          sessionStorage.setItem("wa_phone_number_id", data.data.phone_number_id);
          sessionStorage.setItem("wa_waba_id", data.data.waba_id);
        }
      } catch {
        // not a message we care about
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleConnectWhatsApp = () => {
    setWaError(null);
    if (!window.FB) {
      setWaError("Facebook SDK is still loading — try again in a moment.");
      return;
    }

    window.FB.login(
      (response) => {
        if (!response?.authResponse?.code) {
          setWaError("WhatsApp connection was cancelled or didn't complete.");
          return;
        }

        const code = response.authResponse.code;
        const phoneNumberId = sessionStorage.getItem("wa_phone_number_id");
        const wabaId = sessionStorage.getItem("wa_waba_id");

        if (!phoneNumberId || !wabaId) {
          setWaError("Didn't receive WhatsApp account details — please try again.");
          return;
        }

        setWaLoading(true);
        fetch("/api/whatsapp-connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, phoneNumberId, wabaId }),
        })
          .then((res) => res.json())
          .then((data) => {
            setWaLoading(false);
            if (data.error) {
              setWaError(data.error);
              return;
            }
            setWaConnected(true);
            setWaPhone(data.displayPhoneNumber);
            setWaBusinessName(data.businessName);
            setWaTemplateStatus(data.templateStatus);
          })
          .catch((err) => {
            setWaLoading(false);
            setWaError(err.message);
          });
      },
      {
        config_id: metaConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: { sessionInfoVersion: "3" },
      }
    );
  };

  const handleDisconnectWhatsApp = () => {
    setWaLoading(true);
    fetch("/api/whatsapp-disconnect", { method: "POST" })
      .then(() => {
        setWaLoading(false);
        setWaConnected(false);
        setWaPhone(null);
        setWaBusinessName(null);
        setWaTemplateStatus(null);
      })
      .catch((err) => {
        setWaLoading(false);
        setWaError(err.message);
      });
  };

  const [enableSubscriptions, setEnableSubscriptions] = useState(
    settings.enableSubscriptions !== false
  );
  const [defaultFrequency, setDefaultFrequency] = useState(
    String(settings.defaultFrequency || 30)
  );
  const [emailNotifications, setEmailNotifications] = useState(
    settings.emailNotifications !== false
  );
  const [widgetPosition, setWidgetPosition] = useState(
    settings.widgetPosition || "before-atc"
  );

  const handleSave = () => {
    const fd = new FormData();
    fd.append("enableSubscriptions", String(enableSubscriptions));
    fd.append("defaultFrequency", defaultFrequency);
    fd.append("emailNotifications", String(emailNotifications));
    fd.append("widgetPosition", widgetPosition);
    submit(fd, { method: "POST" });
  };

  return (
    <Page title="Settings">
      <BlockStack gap="500">
        {actionData?.success && <Banner tone="success">{actionData.success}</Banner>}

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd">General</Text>
            <Checkbox
              label="Enable subscriptions"
              helpText="Turn off to hide the subscription widget from all products"
              checked={enableSubscriptions}
              onChange={setEnableSubscriptions}
            />
            <Select
              label="Default delivery frequency"
              options={[
                { label: "Every 7 days", value: "7" },
                { label: "Every 15 days", value: "15" },
                { label: "Every 30 days", value: "30" },
                { label: "Every 60 days", value: "60" },
                { label: "Every 90 days", value: "90" },
              ]}
              value={defaultFrequency}
              onChange={setDefaultFrequency}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd">Storefront Widget</Text>
            <Select
              label="Widget position on product page"
              options={[
                { label: "Before Add to Cart button", value: "before-atc" },
                { label: "After Add to Cart button", value: "after-atc" },
              ]}
              value={widgetPosition}
              onChange={setWidgetPosition}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd">WhatsApp Reminders</Text>

            {waError && <Banner tone="critical">{waError}</Banner>}

            {waConnected ? (
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="success">Connected</Badge>
                  <Text>
                    {waBusinessName ? `${waBusinessName} — ` : ""}
                    {waPhone || "WhatsApp number connected"}
                  </Text>
                </InlineStack>
                {waTemplateStatus && (
                  <Text tone="subdued" variant="bodySm">
                    Reminder template status: {waTemplateStatus}
                    {waTemplateStatus === "PENDING" &&
                      " — usually approved within a few minutes to a few hours."}
                  </Text>
                )}
                <InlineStack>
                  <Button onClick={handleDisconnectWhatsApp} loading={waLoading} tone="critical">
                    Disconnect WhatsApp
                  </Button>
                </InlineStack>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text tone="subdued">
                  Connect your own WhatsApp Business number so renewal reminders go
                  out under your store's name, not Subflow's.
                </Text>
                <InlineStack>
                  <Button
                    variant="primary"
                    onClick={handleConnectWhatsApp}
                    loading={waLoading}
                    disabled={!sdkReady}
                  >
                    Connect WhatsApp
                  </Button>
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd">Notifications</Text>
            <Checkbox
              label="Email notifications"
              helpText="Send email to customers before each renewal"
              checked={emailNotifications}
              onChange={setEmailNotifications}
            />
          </BlockStack>
        </Card>

        <InlineStack align="end">
          <Button variant="primary" onClick={handleSave} loading={isSaving}>
            Save Settings
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}