import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

installGlobals({ nativeFetch: true });

if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = { protocol: "ws", host: "localhost", port: 64999, clientPort: 64999 };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  // Force ALL imports of @shopify/shopify-api to resolve to the v13 version
  // that shopify-app-remix uses internally. Without this, the top-level v12
  // gets used and Session class instances don't match — causing isActive errors.
  resolve: {
    alias: {
      "@shopify/shopify-api": path.resolve(
        __dirname,
        "node_modules/@shopify/shopify-app-remix/node_modules/@shopify/shopify-api"
      ),
    },
  },
  server: {
    allowedHosts: [host],
    cors: { preflightContinue: true },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: { allow: ["app", "node_modules"] },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: { assetsInlineLimit: 0 },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
});