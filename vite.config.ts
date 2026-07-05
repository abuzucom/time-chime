import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Redirect `node:async_hooks` imports in browser bundles to a tiny shim.
 * Time Chime's Westminster scheduler pulls a helper that expects the module
 * to exist at import time even though the browser code path never touches
 * it; the shim keeps the import resolvable without shipping a Node polyfill.
 */
function browserOnlyAsyncHooksShim() {
  return {
    name: "westminster-browser-async-hooks-shim",
    enforce: "pre" as const,
    resolveId(source: string, _importer: string | undefined, options: { ssr?: boolean }) {
      if (source === "node:async_hooks" && !options.ssr) {
        return "/src/lib/browser/async-hooks-shim.ts";
      }
      return null;
    },
  };
}

// This is a plain Vite config — no Lovable-specific wrapper. It composes
// the four plugins TanStack Start needs (tanstackStart, viteReact,
// tailwindcss, tsConfigPaths), adds nitro at build time so the server
// entry ships as a portable Cloudflare Worker (change `preset` for other
// deploy targets), plus the app-shell PWA and the async_hooks shim.
export default defineConfig(({ command }) => ({
  css: {
    // Match dev to build: Vite defaults to PostCSS in serve mode and only
    // runs Lightning CSS at build, which lets subtle prefix / vendor rules
    // pass in dev and break in prod. Running Lightning CSS in both keeps
    // the preview honest.
    transformer: "lightningcss",
  },
  resolve: {
    alias: {
      "@": `${process.cwd()}/src`,
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    // Pre-bundle the always-present client deps. React core only —
    // including @tanstack/react-start would pull its node:async_hooks server
    // entry into the client bundle and crash hydration.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },
  plugins: [
    browserOnlyAsyncHooksShim(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    // Nitro produces the Worker bundle at build time. Swap `preset` for
    // "node-server", "vercel", "netlify", etc. to target a different host.
    ...(command === "build"
      ? [
          nitro({
            preset: "cloudflare-module",
            output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
            cloudflare: { nodeCompat: true, deployConfig: true },
          }),
        ]
      : []),
    viteReact(),
    // App-shell offline caching. Registration is done ONLY by
    // src/lib/pwa/register-sw.ts, which refuses to run in dev and iframes.
    // The SW is generated at /sw.js and uses NetworkFirst for HTML
    // navigations (with /offline as the fallback) and CacheFirst for
    // same-origin hashed build assets.
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      devOptions: { enabled: false },
      // TanStack Start SSR emits HTML per request from the Worker — there
      // is no static index.html to precache. Precache only the built
      // client assets; HTML is handled by the runtime navigation route.
      workbox: {
        globPatterns: ["**/*.{js,css,woff,woff2,ico,png,svg}"],
        navigateFallback: "/offline",
        navigateFallbackDenylist: [/^\/api\//, /^\/~oauth/, /^\/_server/, /^\/_build/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "westminster-html",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/assets\/.+\.(?:js|css|woff2?|png|svg|ico)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "westminster-assets",
              expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "westminster-google-fonts-css" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "westminster-google-fonts",
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: false,
    }),
  ],
  server: { port: 8080, host: true },
}));
