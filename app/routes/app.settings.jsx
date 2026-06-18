// app/routes/app.settings.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Select,
  Checkbox,
  Button,
  Banner,
  Divider,
  InlineStack,
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
  return json({ settings: shop?.settings || {} });
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
  const { settings } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

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
        {actionData?.success && (
          <Banner tone="success">{actionData.success}</Banner>
        )}

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