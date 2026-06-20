import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  DataTable,
  Badge,
  Text,
  BlockStack,
  EmptyState,
  Button,
  Banner,
  InlineStack,
  Tooltip,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getSubscriptions,
  getSubscriptionById,
  cancelSubscription,
} from "../models/Subscription.server.js";
import { sendWhatsAppMessage } from "../services/whatsapp.server.js";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const subscriptions = await getSubscriptions(session.shop);
  return json({ subscriptions, shopDomain: session.shop });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cancel") {
    const subId = formData.get("subscriptionId");
    await cancelSubscription(subId, session.shop, "Cancelled by merchant");
    return json({ success: "Subscription cancelled." });
  }

  if (intent === "send_reminder") {
    const subId = formData.get("subscriptionId");

    try {
      // Get subscription from DB directly (server-to-server, no HTTP needed)
      const sub = await getSubscriptionById(subId, session.shop);

      if (!sub) {
        return json({ error: "Subscription not found." });
      }

      if (!sub.customerPhone) {
        return json({
          error: "This subscriber has no phone number on record.",
        });
      }

      // Call sendWhatsAppMessage directly — no need to fetch our own endpoint
      // This avoids authentication header issues and reduces network hops
      const result = await sendWhatsAppMessage(
        sub.shopDomain,
        sub.customerPhone,
        sub
      );

      if (result.success) {
        return json({ success: `✅ WhatsApp reminder sent!` });
      } else {
        return json({ error: result.error || "Failed to send reminder." });
      }
    } catch (err) {
      console.error("❌ Send reminder error:", err.message);
      return json({ error: `Error: ${err.message}` });
    }
  }

  return json({ error: "Unknown action." });
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubscribersPage() {
  const { subscriptions, shopDomain } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  const statusTone = {
    active: "success",
    paused: "warning",
    cancelled: "critical",
    expired: "subdued",
    failed: "critical",
  };

  const handleCancel = (id) => {
    if (!confirm("Cancel this subscription?")) return;
    const fd = new FormData();
    fd.append("intent", "cancel");
    fd.append("subscriptionId", id);
    submit(fd, { method: "POST" });
  };

  const handleSendReminder = (id) => {
    const fd = new FormData();
    fd.append("intent", "send_reminder");
    fd.append("subscriptionId", id);
    submit(fd, { method: "POST" });
  };

  // ─── CSV Export ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = [
      "Name",
      "Email",
      "Phone",
      "Product",
      "Frequency (days)",
      "Next Renewal",
      "Status",
    ];

    const csvRows = subscriptions.map((sub) => [
      sub.customerName || "",
      sub.customerEmail,
      sub.customerPhone ? `+${sub.customerPhone}` : "",
      sub.productTitle || sub.productId,
      sub.frequencyDays,
      new Date(sub.nextRenewalAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      sub.status,
    ]);

    const csv = [headers, ...csvRows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Table Rows ─────────────────────────────────────────────────────────────
  const rows = subscriptions.map((sub) => {
    const hasPhone = !!sub.customerPhone;
    const phone = sub.customerPhone ? `+${sub.customerPhone}` : "—";

    return [
      // Customer
      <BlockStack gap="050">
        <Text variant="bodyMd" fontWeight="semibold">
          {sub.customerName || "—"}
        </Text>
        <Text variant="bodySm" tone="subdued">
          {sub.customerEmail}
        </Text>
      </BlockStack>,

      // Phone
      <Text variant="bodySm">{phone}</Text>,

      // Product
      <Text variant="bodySm">{sub.productTitle || sub.productId}</Text>,

      // Plan
      <Text variant="bodySm">{sub.planId?.name || "—"}</Text>,

      // Frequency
      `Every ${sub.frequencyDays} days`,

      // Next Renewal
      new Date(sub.nextRenewalAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),

      // Status
      <Badge tone={statusTone[sub.status]}>{sub.status}</Badge>,

      // Actions
      <InlineStack gap="200">
        {sub.status === "active" && (
          <Tooltip
            content={
              hasPhone
                ? "Send WhatsApp renewal reminder"
                : "No phone number on record"
            }
          >
            <Button
              size="slim"
              disabled={!hasPhone || isSubmitting}
              onClick={() => handleSendReminder(sub._id)}
            >
              📲 Remind
            </Button>
          </Tooltip>
        )}
        {sub.status === "active" && (
          <Button
            size="slim"
            tone="critical"
            disabled={isSubmitting}
            onClick={() => handleCancel(sub._id)}
          >
            Cancel
          </Button>
        )}
        {sub.status !== "active" && "—"}
      </InlineStack>,
    ];
  });

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <Page
      title="Subscribers"
      subtitle={`${subscriptions.length} total`}
      secondaryActions={[
        {
          content: "Export CSV",
          onAction: handleExportCSV,
          disabled: subscriptions.length === 0,
        },
      ]}
    >
      <BlockStack gap="400">
        {actionData?.success && (
          <Banner tone="success" onDismiss={() => {}}>
            {actionData.success}
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical" onDismiss={() => {}}>
            {actionData.error}
          </Banner>
        )}

        <Card>
          {subscriptions.length === 0 ? (
            <EmptyState
              heading="No subscribers yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Subscribers will appear here once customers use the "Subscribe &
                Save" widget on your storefront.
              </p>
            </EmptyState>
          ) : (
            <DataTable
              columnContentTypes={[
                "text",
                "text",
                "text",
                "text",
                "text",
                "text",
                "text",
                "text",
              ]}
              headings={[
                "Customer",
                "Phone",
                "Product",
                "Plan",
                "Frequency",
                "Next Renewal",
                "Status",
                "Actions",
              ]}
              rows={rows}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}