// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  DataTable,
  EmptyState,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getSubscriptionStats } from "../models/Subscription.server.js";
import { getPlans } from "../models/SubscriptionPlan.server.js";

export const loader = async ({ request }) => {
  let session;
  try {
    ({ session } = await authenticate.admin(request));
  } catch (err) {
    if (err instanceof Response) throw err; // re-throw auth redirects
    throw err;
  }
  const shopDomain = session.shop;

  const [stats, plans] = await Promise.all([
    getSubscriptionStats(shopDomain),
    getPlans(shopDomain),
  ]);

  return json({ stats, plans, shopDomain });
};

export default function Dashboard() {
  const { stats, plans } = useLoaderData();

  const statCards = [
    { label: "Active Subscribers", value: stats.active, color: "success" },
    { label: "Total Subscribers", value: stats.total, color: undefined },
    { label: "Paused", value: stats.paused, color: "warning" },
    { label: "Cancelled", value: stats.cancelled, color: "critical" },
  ];

  const planRows = plans.map((plan) => [
    plan.name,
    `${plan.discountPercentage}% off`,
    plan.frequencies.map((f) => `${f} days`).join(", "),
    plan.subscriberCount,
    <Badge tone={plan.isActive ? "success" : "critical"}>
      {plan.isActive ? "Active" : "Inactive"}
    </Badge>,
  ]);

  return (
    <Page title="SubFlow Dashboard">
      <BlockStack gap="500">

        {/* Stats Row */}
        <InlineGrid columns={4} gap="400">
          {statCards.map((card) => (
            <Card key={card.label}>
              <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">{card.label}</Text>
                <Text variant="heading2xl" as="p" tone={card.color}>
                  {card.value}
                </Text>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>

        {/* Estimated MRR */}
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd">Estimated Monthly Revenue</Text>
            <Text variant="heading2xl" as="p" tone="success">
              ₹{stats.estimatedMRR.toFixed(2)}
            </Text>
            <Text variant="bodySm" tone="subdued">
              Based on active subscribers × discounted price
            </Text>
          </BlockStack>
        </Card>

        {/* Plans Summary */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd">Subscription Plans</Text>
            {plans.length === 0 ? (
              <EmptyState
                heading="No plans yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create your first subscription plan to get started.</p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "numeric", "text"]}
                headings={["Plan Name", "Discount", "Frequencies", "Subscribers", "Status"]}
                rows={planRows}
              />
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}