// app/routes/app.plans.jsx
// V1: Plans are stored in MongoDB only — no Shopify SellingPlan sync.
// The storefront widget reads plans from /api/plans and lets customers subscribe directly.

import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Select,
  Checkbox,
  Badge,
  DataTable,
  Modal,
  ResourceList,
  ResourceItem,
  Thumbnail,
  EmptyState,
  Banner,
  Divider,
  InlineGrid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getPlans,
  createPlan,
  deletePlan,
} from "../models/SubscriptionPlan.server.js";

// ─── GraphQL: Fetch Products ──────────────────────────────────────────────────
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          status
          featuredImage { url altText }
          variants(first: 1) {
            edges {
              node { id price }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// ─── Loader ───────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const plans = await getPlans(shopDomain);

    try {
      const response = await admin.graphql(PRODUCTS_QUERY, {
        variables: { first: 20 },
      });
      const { data, errors } = await response.json();

      if (errors) {
        console.error("❌ GraphQL errors:", errors);
        return json({
          error: `GraphQL Error: ${errors[0]?.message || "Failed to fetch products."}`,
          plans,
          products: [],
          shopDomain,
        });
      }

      const products = data.products.edges.map(({ node }) => ({
        id: node.id,
        title: node.title,
        handle: node.handle,
        status: node.status,
        image: node.featuredImage?.url || null,
        imageAlt: node.featuredImage?.altText || node.title,
        price: node.variants.edges[0]?.node.price || "0.00",
        variantId: node.variants.edges[0]?.node.id || null,
      }));

      return json({ plans, products, shopDomain });
    } catch (graphqlError) {
      if (graphqlError instanceof Response) throw graphqlError; // re-throw auth redirects
      const errMsg = graphqlError?.message ?? String(graphqlError) ?? "Unknown error";
      console.error("❌ Failed to fetch products:", errMsg);
      return json({
        error: "Failed to fetch products. Ensure the app has 'read_products' scope.",
        plans,
        products: [],
        shopDomain,
      });
    }
  } catch (err) {
    // authenticate.admin() throws a redirect when shop is null/session expired —
    // always re-throw so Shopify's auth middleware can handle the redirect.
    if (err instanceof Response) throw err;
    console.error("❌ Loader error:", err?.message ?? String(err));
    throw err;
  }
};

// ─── Action ───────────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  // ── CREATE ──────────────────────────────────────────────────────────────────
  if (intent === "create") {
    const name = formData.get("name");
    const description = formData.get("description");
    const productIds = JSON.parse(formData.get("productIds") || "[]");
    const productTitles = JSON.parse(formData.get("productTitles") || "[]");
    const discountPercentage = Number(formData.get("discountPercentage"));
    const frequencies = JSON.parse(formData.get("frequencies") || "[]");

    if (!name || productIds.length === 0 || frequencies.length === 0) {
      return json({
        error: "Plan name, at least one product, and one frequency are required.",
      });
    }

    await createPlan({
      shopDomain,
      name,
      description,
      productIds,
      productTitles,
      discountPercentage,
      frequencies,
    });

    return json({
      success: `Plan "${name}" created! The storefront widget will now offer this plan on the selected products.`,
    });
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (intent === "delete") {
    const planId = formData.get("planId");
    await deletePlan(planId, shopDomain);
    return json({ success: "Plan deleted." });
  }

  return json({ error: "Unknown action." });
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlansPage() {
  const { plans = [], products = [], error: loaderError } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const [modalOpen, setModalOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [discount, setDiscount] = useState("10");
// AFTER
const FREQUENCY_OPTIONS = [7, 15, 30, 60, 90];
const [frequencies, setFrequencies] = useState({ 7: false, 15: false, 30: true, 60: false, 90: false });

  const resetForm = () => {
    setPlanName("");
    setPlanDescription("");
    setSelectedProducts([]);
    setDiscount("10");
setFrequencies({ 7: false, 15: false, 30: true, 60: false, 90: false });
  };

  const handleToggleProduct = useCallback((product) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p.id === product.id);
      if (exists) return prev.filter((p) => p.id !== product.id);
      return [...prev, product];
    });
  }, []);

  const handleCreatePlan = () => {
    const selectedFreqs = FREQUENCY_OPTIONS.filter((f) => frequencies[f]);
    if (selectedFreqs.length === 0) return;

    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("name", planName);
    formData.append("description", planDescription);
    formData.append("productIds", JSON.stringify(selectedProducts.map((p) => p.id)));
    formData.append("productTitles", JSON.stringify(selectedProducts.map((p) => p.title)));
    formData.append("discountPercentage", discount);
    formData.append("frequencies", JSON.stringify(selectedFreqs));
    submit(formData, { method: "POST" });
    setModalOpen(false);
    resetForm();
  };

  const handleDeletePlan = (planId) => {
    if (!confirm("Delete this plan? Customers will no longer be able to subscribe using it.")) return;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("planId", planId);
    submit(formData, { method: "POST" });
  };

  const planRows = plans.map((plan) => [
    <BlockStack gap="100">
      <Text variant="bodyMd" fontWeight="semibold">{plan.name}</Text>
      {plan.description && (
        <Text variant="bodySm" tone="subdued">{plan.description}</Text>
      )}
    </BlockStack>,
    `${plan.discountPercentage}% off`,
    plan.frequencies.map((f) => `${f}d`).join(", "),
    plan.productTitles?.join(", ") || "—",
    plan.subscriberCount,
    <Badge tone={plan.isActive ? "success" : "critical"}>
      {plan.isActive ? "Active" : "Inactive"}
    </Badge>,
    <button
      style={{
        color: "var(--p-color-text-critical)",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: "13px",
        padding: "0",
        fontFamily: "inherit",
      }}
      onClick={() => handleDeletePlan(plan._id)}
    >
      Delete
    </button>,
  ]);

  return (
    <Page
      title="Subscription Plans"
      primaryAction={{
        content: "Create Plan",
        onAction: () => setModalOpen(true),
      }}
    >
      <BlockStack gap="500">

        {/* How it works banner */}
        <Banner tone="info" title="How subscription plans work">
          Create a plan here, then add the <strong>Subflow Subscribe Widget</strong> to your theme
          (Online Store → Customize → Add Block). Customers pick a frequency and enter their
          details — no Shopify payments required for V1.
        </Banner>

        {/* Loader error */}
        {loaderError && (
          <Banner tone="critical" title="Failed to load products">{loaderError}</Banner>
        )}

        {/* Action feedback */}
        {actionData?.error && (
          <Banner tone="critical" title="Error">{actionData.error}</Banner>
        )}
        {actionData?.success && (
          <Banner tone="success" title="Success">{actionData.success}</Banner>
        )}

        {/* Plans Table */}
        <Card>
          {plans.length === 0 ? (
            <EmptyState
              heading="No subscription plans yet"
              action={{ content: "Create Your First Plan", onAction: () => setModalOpen(true) }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Create a plan to enable the "Subscribe & Save" widget on your products.</p>
            </EmptyState>
          ) : (
            <DataTable
              columnContentTypes={["text","text","text","text","numeric","text","text"]}
              headings={["Plan","Discount","Frequencies","Products","Subscribers","Status","Actions"]}
              rows={planRows}
            />
          )}
        </Card>

      </BlockStack>

      {/* ── Create Plan Modal ─────────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); resetForm(); }}
        title="Create Subscription Plan"
        primaryAction={{
          content: isLoading ? "Creating..." : "Create Plan",
          onAction: handleCreatePlan,
          loading: isLoading,
          disabled: !planName || selectedProducts.length === 0 || !FREQUENCY_OPTIONS.some((f) => frequencies[f]),
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: () => { setModalOpen(false); resetForm(); },
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">

            <TextField
              label="Plan Name"
              value={planName}
              onChange={setPlanName}
              placeholder="e.g. Monthly Essentials"
              autoComplete="off"
              helpText="Customers will see this name in the subscribe widget."
            />

            <TextField
              label="Description (optional)"
              value={planDescription}
              onChange={setPlanDescription}
              multiline={2}
              placeholder="What's special about this plan?"
              autoComplete="off"
            />

            <Divider />

            {/* Product Selection */}
            <BlockStack gap="200">
              <Text variant="headingMd">Products</Text>
              <Text variant="bodySm" tone="subdued">
                The subscribe widget will appear on these product pages.
              </Text>
              {selectedProducts.length > 0 && (
                <BlockStack gap="100">
                  {selectedProducts.map((p) => (
                    <InlineStack key={p.id} gap="200" align="space-between">
                      <InlineStack gap="200">
                        {p.image && (
                          <Thumbnail size="small" source={p.image} alt={p.title} />
                        )}
                        <Text>{p.title}</Text>
                      </InlineStack>
                      <button
                        style={{
                          color: "var(--p-color-text-critical)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "13px",
                          padding: "0",
                          fontFamily: "inherit",
                        }}
                        onClick={() => handleToggleProduct(p)}
                      >
                        Remove
                      </button>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
              <Button onClick={() => setProductPickerOpen(true)}>
                {selectedProducts.length === 0 ? "Select Products" : "Add More Products"}
              </Button>
            </BlockStack>

            <Divider />

            {/* Discount */}
            <Select
              label="Subscription Discount"
              options={[
                { label: "5% off", value: "5" },
                { label: "10% off", value: "10" },
                { label: "15% off", value: "15" },
                { label: "20% off", value: "20" },
                { label: "25% off", value: "25" },
              ]}
              value={discount}
              onChange={setDiscount}
              helpText="Discount shown in the widget. Orders are placed manually/via WhatsApp reminder for V1."
            />

            <Divider />

            {/* Frequencies */}
            <BlockStack gap="200">
              <Text variant="headingMd">Delivery Frequencies</Text>
              <Text variant="bodySm" tone="subdued">
                Customers choose from these options in the subscribe widget.
              </Text>
              <InlineGrid columns={5} gap="300">
                {FREQUENCY_OPTIONS.map((f) => (
                  <Checkbox
                    key={f}
                    label={`Every ${f} days`}
                    checked={frequencies[f]}
                    onChange={(val) => setFrequencies((prev) => ({ ...prev, [f]: val }))}
                  />
                ))}
              </InlineGrid>
            </BlockStack>

          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Product Picker Modal ───────────────────────────────────────────── */}
      <Modal
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        title="Select Products"
        primaryAction={{
          content: "Done",
          onAction: () => setProductPickerOpen(false),
        }}
      >
        <Modal.Section>
          {products.length === 0 ? (
            <EmptyState
              heading="No products found"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Add products to your Shopify store first.</p>
            </EmptyState>
          ) : (
            <ResourceList
              resourceName={{ singular: "product", plural: "products" }}
              items={products}
              renderItem={(product) => {
                const isSelected = selectedProducts.some((p) => p.id === product.id);
                return (
                  <ResourceItem
                    id={product.id}
                    media={
                      <Thumbnail
                        source={product.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"}
                        alt={product.imageAlt}
                        size="small"
                      />
                    }
                    onClick={() => handleToggleProduct(product)}
                  >
                    <InlineStack align="space-between">
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="bold">{product.title}</Text>
                        <Text variant="bodySm" tone="subdued">₹{product.price}</Text>
                      </BlockStack>
                      <Badge tone={isSelected ? "success" : undefined}>
                        {isSelected ? "Selected" : "Select"}
                      </Badge>
                    </InlineStack>
                  </ResourceItem>
                );
              }}
            />
          )}
        </Modal.Section>
      </Modal>

    </Page>
  );
}