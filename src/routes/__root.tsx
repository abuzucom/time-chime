import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { SettingsProvider } from "@/lib/settings";
import { TimeSyncProvider } from "@/lib/time/TimeSyncContext";
import { useChimeScheduler } from "@/lib/chimes/scheduler";
import { registerAppShellServiceWorker } from "@/lib/pwa/register-sw";
import {
  PRE_HYDRATION_SCRIPT,
  PRE_HYDRATION_SCRIPT_CSP_SOURCE,
} from "@/lib/http/pre-hydration";


function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );
}

function NotFoundComponent() {
  const quickLinks = [
    { to: "/", label: "Clock", description: "Back to the tower" },
    { to: "/terms", label: "Terms of Service", description: "How the app may be used" },
    { to: "/privacy", label: "Privacy Policy", description: "What we do (and don't) collect" },
    {
      to: "/third-party-notices",
      label: "Third-Party Notices",
      description: "Bundled components & licences",
    },
    { to: "/support", label: "Support the developers", description: "Optional donations" },
  ] as const;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Quarter missed
          </p>
          <h1 className="mt-3 font-serif text-6xl font-semibold text-foreground sm:text-7xl">
            404
          </h1>
          <h2 className="mt-4 text-xl font-semibold text-foreground">This chime never rang</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you're looking for doesn't exist, has been moved, or was never here. Try one
            of the links below.
          </p>
        </div>

        <nav aria-label="Quick links" className="mt-8 space-y-2">
          {quickLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-[color:var(--face-brass)]/50 hover:bg-accent/40"
            >
              <span>
                <span className="block text-sm font-medium text-foreground">{link.label}</span>
                <span className="block text-xs text-muted-foreground">{link.description}</span>
              </span>
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <CenteredPage>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        This page didn't load
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The clockwork slipped a tooth. Try again, or head back to the tower.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Return to the clock
        </a>
      </div>
    </CenteredPage>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ ssr }) => {
    const cspNonce = ssr?.nonce ?? "";
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Time Chime · A clock synchronised with the stars" },
      {
        name: "description",
        content:
          "A configurable clock that plays the Westminster chimes on the quarter and strikes the hour, synchronised to stratum-1 time sources.",
      },
      { name: "author", content: "Time Chime" },
      { name: "theme-color", content: "#1a1410", media: "(prefers-color-scheme: dark)" },
      { name: "theme-color", content: "#f7f1e3", media: "(prefers-color-scheme: light)" },
      { property: "og:title", content: "Time Chime" },
      { property: "og:description", content: "Chimes on the quarter. Strikes on the hour." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // ---- Security headers (defence in depth) --------------------------------
      // The app has no backend user data, no auth, no third-party trackers, and
      // stores everything in localStorage. These headers harden the browser
      // context against XSS, clickjacking, and referrer leakage per OWASP ASVS
      // L1 (§14.4) / OWASP Secure Headers Project. Transport-layer headers
      // (HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy) are
      // set by the origin at `public/_headers`; those below are the subset that
      // browsers accept via <meta http-equiv>.
      {
        httpEquiv: "Content-Security-Policy",
        content: [
          "default-src 'self'",
          // Strict CSP: no `'unsafe-inline'`. The single inline script (the
          // pre-hydration theme setter) is allow-listed by its SHA-256 hash;
          // everything else must be a same-origin bundled script served
          // through `<Scripts />` (which is `'self'`). See
          // src/lib/http/pre-hydration.ts for the source + hash contract.
          cspNonce
            ? `script-src 'self' 'nonce-${cspNonce}' ${PRE_HYDRATION_SCRIPT_CSP_SOURCE}`
            : `script-src 'self' ${PRE_HYDRATION_SCRIPT_CSP_SOURCE}`,
          // Split style directives — see security-headers.ts for full
          // rationale. Element styles are nonce-only (no 'unsafe-inline'),
          // attribute styles keep 'unsafe-inline' because they can't
          // fetch remote resources and are unavoidable with React/Radix.
          cspNonce
            ? `style-src-elem 'self' 'nonce-${cspNonce}' https://fonts.googleapis.com`
            : "style-src-elem 'self' https://fonts.googleapis.com",
          "style-src-attr 'unsafe-inline'",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob:",
          "media-src 'self' blob:",
          // Server functions are same-origin; time providers are HTTPS-only.
          "connect-src 'self' https:",
          "frame-ancestors 'none'",
          // Hardened: forbid ANY <base> tag from redirecting relative URLs.
          // 'none' is stricter than 'self' — even a same-origin injected
          // <base href="/attacker/"> is refused, closing a classic XSS
          // pivot where an attacker who lands one HTML injection can then
          // repoint every relative script/link on the page.
          "base-uri 'none'",
          "form-action 'self'",
          // Fully block <object>, <embed>, and <applet>. Combined with the
          // absence of any legacy Flash/PDF plugin surface, this removes an
          // entire class of type-confusion and plugin-based XSS vectors.
          "object-src 'none'",
          // Service worker (/sw.js) is same-origin, generated by
          // vite-plugin-pwa. Explicit allow-list avoids relying on the
          // child-src / default-src fallback chain.
          "worker-src 'self'",
          "upgrade-insecure-requests",
        ].join("; "),
      },
      { name: "referrer", content: "strict-origin-when-cross-origin" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Instrument+Serif:ital@0;1&family=Work+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap",
      },
    ],
    scripts: [{ children: PRE_HYDRATION_SCRIPT }],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Register the app-shell service worker on the client. The registrar is
  // guarded against dev/preview/iframe hosts (see register-sw.ts) so this
  // is a no-op inside an embedded editor preview iframe.
  useEffect(() => {
    registerAppShellServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <TimeSyncProvider>
            <SchedulerHost />
            <Outlet />
            <Toaster richColors closeButton position="bottom-right" theme="system" />
          </TimeSyncProvider>
        </SettingsProvider>
      </QueryClientProvider>
    );
  }

function SchedulerHost() {
  useChimeScheduler();
  return null;
}
