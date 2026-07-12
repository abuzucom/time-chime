/**
 * Security headers applied to every server response.
 *
 * `public/_headers` covers static assets served directly by Cloudflare Pages
 * / Netlify, but SSR responses and `createServerFn` results come out of the
 * Worker runtime and never pass through that static-asset layer. Emitting
 * the headers from a `requestMiddleware` guarantees the OWASP baseline
 * (ASVS §14.4, Secure Headers Project) is present on *every* response
 * shape — HTML shell, server-function JSON, error page, 404 — regardless
 * of hosting provider.
 *
 * These headers are complementary to the CSP <meta http-equiv> emitted from
 * `src/routes/__root.tsx`. CSP is intentionally kept in the meta tag so it
 * ships with the document even on infra that strips response headers; the
 * transport-layer / policy headers below cannot be expressed via meta and
 * must live on the response.
 *
 * The values are duplicated verbatim in `public/_headers`; the two are
 * asserted in lock-step by `scripts/check-route-headers.mjs` in CI.
 */

import { PRE_HYDRATION_SCRIPT_CSP_SOURCE } from "./pre-hydration";
import { readCspNonce } from "./nonce-store";

// max-age = 2 years, includeSubDomains, preload — meets the hstspreload.org
// submission requirements (Chrome preload list) and OWASP L1 baseline.
export const HSTS_VALUE = "max-age=63072000; includeSubDomains; preload";

// Leaks the origin (scheme + host) but never the path or query, and only on
// same-origin or HTTPS→HTTPS navigations. Matches Mozilla Observatory's
// recommended default and the `<meta name="referrer">` tag in __root.
export const REFERRER_POLICY_VALUE = "strict-origin-when-cross-origin";

// Strict deny-by-default Permissions-Policy. Every powerful feature is set to
// the empty allowlist `()`, which forbids the top document *and* every nested
// browsing context from using it — even after a user gesture.
//
// The list is deliberately minimal: it enumerates only capabilities this app
// could plausibly be tempted to use (or that third-party scanners specifically
// look for) rather than mirroring the entire W3C feature registry. Everything
// omitted is already denied cross-origin by browser defaults; there is no
// benefit to naming features the app has no code path for and no code path
// could ever introduce without also touching this list.
//
// Allowlist audit (grep before widening any of these to `(self)`):
//   * `autoplay`  — WebAudio (`AudioContext`) is NOT gated by this directive,
//                   so chime playback works with `autoplay=()`. HTMLMediaElement
//                   `.play()` is not used anywhere in src/.
//   * `fullscreen`— `requestFullscreen()` is not called anywhere in src/. The
//                   OBS browser-source route renders inline; the kiosk face
//                   relies on the OS/browser window chrome, not the JS API.
// If either of those assumptions changes, widen the specific directive to
// `(self)` in the same commit that introduces the caller — never speculatively.
//
// Notes on the notifications entry:
//   The W3C Permissions-Policy registry does NOT yet include `notifications`
//   or `push` — those permissions are gated by the Notifications API's own
//   `Notification.requestPermission()` prompt, not by Permissions-Policy.
//   Several security scanners (Mozilla Observatory, csp-evaluator, some
//   enterprise gateways) still expect to see the token. Emitting it costs
//   nothing — browsers ignore unknown directives per spec §5.1 — and it
//   documents the intent that this app never requests web-push. The
//   *effective* runtime block for notifications is enforced by:
//     1. never calling `Notification.requestPermission()` from the web bundle
//        (the mobile flow routes through Capacitor LocalNotifications), and
//     2. the CSP `default-src 'self'` + no service-worker registration,
//        which prevents a third-party push service from taking hold.
//
// Directives are alphabetised so diffs stay reviewable.
export const PERMISSIONS_POLICY_VALUE = [
  // ---- User-facing capability surface (all denied) ----
  "camera=()",
  "geolocation=()",
  "microphone=()",
  "notifications=()", // non-standard token; see comment above
  "push=()", // non-standard token; see comment above
  // ---- Media / display features the app does not use ----
  "autoplay=()", // WebAudio not gated by this; HTMLMediaElement.play() unused
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=()", // requestFullscreen() unused; widen to (self) only if added
  "picture-in-picture=()",
  "screen-wake-lock=()",
  "speaker-selection=()",
  // ---- Sensor & hardware access (all denied) ----
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "midi=()",
  "usb=()",
  // ---- Payment / credential surfaces (all denied) ----
  "payment=()",
  "publickey-credentials-get=()",
  // ---- Legacy / tracking opt-outs ----
  "sync-xhr=()",
  "interest-cohort=()", // Google FLoC / Topics opt-out per EFF guidance
].join(", ");

/**
 * Build the enforced Content-Security-Policy for a single response, using a
 * freshly generated nonce for that response's inline scripts.
 *
 * We ship CSP in two places:
 *
 *   1. **`<meta http-equiv>`** in `src/routes/__root.tsx` — survives on hosts
 *      that strip response headers, and is what static-only crawlers see. It
 *      uses a **SHA-256 hash** for the single known-static inline script
 *      (see `pre-hydration.ts`) so it can be a plain string constant.
 *   2. **This response header** — emitted from the Worker on every response.
 *      Response headers take precedence over the meta tag for browsers that
 *      honour both, and let us include a **per-request nonce** for any
 *      future inline script that the framework or a runtime helper might
 *      inject. Nonces are unpredictable per response, so they cannot be
 *      pre-guessed and pasted by an XSS payload — the strict-CSP pattern
 *      recommended by web.dev / Google security.
 *
 * `'strict-dynamic'` means: "trust any script that a nonce'd/hashed script
 * loads transitively". This lets bundler-emitted chunks execute without
 * having to list every hashed asset path, while still refusing arbitrary
 * inline `<script>` blocks.
 */
function buildEnforcedCsp(nonce: string, hashSource: string, reportUri: string): string {
  return [
    "default-src 'self'",
    // Nonce + hash + strict-dynamic. NO `'unsafe-inline'`, NO wildcards.
    `script-src 'self' 'nonce-${nonce}' ${hashSource} 'strict-dynamic'`,
    // Styles are split into two directives so we can drop `'unsafe-inline'`
    // where it matters most (authored `<style>` blocks and remote
    // stylesheets — the CSS-injection / data-exfiltration vector) while
    // keeping it for inline `style=""` attributes which React, Tailwind's
    // arbitrary values, and every Radix primitive emit continuously.
    //  - `style-src-elem`: nonced. The pre-hydration shim stamps this
    //    nonce onto every dynamically-created `<style>` / `<link>` so
    //    Radix/cmdk/vaul/sonner/embla/recharts work without shipping a
    //    nonce prop. Google Fonts stylesheets are URL-allowlisted.
    //  - `style-src-attr`: retains `'unsafe-inline'`. Inline attrs can't
    //    fetch remote resources, so the residual risk (CSS-based
    //    fingerprinting via `background: url(...)` in a `style=""`) is
    //    already blocked by `img-src`, `font-src`, and `connect-src`.
    `style-src-elem 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
    // CSP2 `report-uri` (legacy, still honoured by every current browser)
    // AND CSP3 `report-to` (modern Reporting API, honoured by Chrome/Edge).
    // The `report-to` target name matches the `Reporting-Endpoints` header
    // emitted alongside this CSP.
    `report-uri ${reportUri}`,
    `report-to ${REPORTING_ENDPOINT_NAME}`,
  ].join("; ");
}

/**
 * Named group used in both the `Reporting-Endpoints` header and the CSP
 * `report-to` directive. Any string works as long as the two match — using a
 * constant here prevents drift.
 */
const REPORTING_ENDPOINT_NAME = "csp-endpoint";

/**
 * Built-in CSP report sink handled by `src/routes/api/public/csp-report.tsx`.
 * Same-origin so the browser will POST reports without a preflight and
 * without exposing them to cross-origin observers. Override with the
 * `CSP_REPORT_URI` env var to forward to an external aggregator (Sentry,
 * report-uri.com, etc.) — the built-in sink still functions as a fallback.
 */
const DEFAULT_CSP_REPORT_URI = "/api/public/csp-report";

// Nonce generation lives in `./nonce-store.ts` so the SSR head and the
// response headers can share the SAME nonce for one request via
// AsyncLocalStorage. Do not re-inline it here — see that module for why.

/**
 * Apply the security headers to a Response in-place. Never overwrites an
 * existing value — a downstream handler is allowed to tighten (but not
 * loosen) a header if it has route-specific requirements. If the target
 * Response has immutable headers (e.g. a cached fetch result), we clone it.
 */
export function withSecurityHeaders(response: Response, cspNonce?: string): Response {
  let target = response;
  try {
    target.headers.set("__probe__", "1");
    target.headers.delete("__probe__");
  } catch {
    // Headers are immutable — reconstruct so we can attach ours.
    target = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
  }

  setIfAbsent(target.headers, "Strict-Transport-Security", HSTS_VALUE);
  setIfAbsent(target.headers, "Referrer-Policy", REFERRER_POLICY_VALUE);
  setIfAbsent(target.headers, "Permissions-Policy", PERMISSIONS_POLICY_VALUE);
  setIfAbsent(target.headers, "X-Content-Type-Options", "nosniff");
  setIfAbsent(target.headers, "X-Frame-Options", "DENY");
  setIfAbsent(target.headers, "Cross-Origin-Opener-Policy", "same-origin");
  setIfAbsent(target.headers, "Cross-Origin-Resource-Policy", "same-origin");
  setIfAbsent(target.headers, "X-DNS-Prefetch-Control", "off");

  // Cloudflare's `_headers` file only applies to requests the Assets
  // binding serves directly; a Worker-generated response (SSR HTML,
  // server-function JSON, this file's own error page) never passes through
  // it, so the cache-poisoning defense documented in `public/_headers` for
  // `/` and `/*.html` has to be repeated here or it silently never applies.
  // A downstream handler can still opt into caching by setting its own
  // Cache-Control before this runs (setIfAbsent defers to it).
  setIfAbsent(target.headers, "Cache-Control", "no-store, must-revalidate");
  setIfAbsent(target.headers, "Vary", "Accept-Encoding");

  // Resolve the CSP report sink: env override wins so operators can point
  // reports at an external aggregator (Sentry, report-uri.com) without a
  // deploy; otherwise we fall back to the built-in same-origin endpoint.
  const reportUri = readEnv("CSP_REPORT_URI") ?? DEFAULT_CSP_REPORT_URI;

  // Modern Reporting API header: names the endpoint referenced by CSP's
  // `report-to` directive. Emitting this alongside `report-uri` gives
  // coverage across every current browser (Chrome/Edge use `report-to`,
  // Firefox/Safari still use `report-uri`).
  setIfAbsent(target.headers, "Reporting-Endpoints", `${REPORTING_ENDPOINT_NAME}="${reportUri}"`);

  // Enforced strict CSP with a fresh nonce for this response. Emitted on
  // every response shape (HTML, server-fn JSON, error pages, 404s) so a
  // scanner sees the same policy everywhere.
  if (!target.headers.has("Content-Security-Policy")) {
    const nonce = cspNonce ?? readCspNonce();
    target.headers.set(
      "Content-Security-Policy",
      buildEnforcedCsp(nonce, PRE_HYDRATION_SCRIPT_CSP_SOURCE, reportUri),
    );
    // The nonce is intentionally NOT exposed on an outbound header. It
    // has no consumer today, and leaking any `x-internal-*` value to the
    // client is dead weight at best and a fingerprinting hint at worst.
    // Downstream handlers that need the nonce should read it from the
    // request-scoped context, not from response headers.
  }

  // Optional CSP report-only mirror on top of the enforced policy — useful
  // for previewing a tightened style-src before flipping it into the
  // enforced policy. Only emitted when CSP_REPORT_ONLY_URI is set so
  // production doesn't double-report every violation.
  const reportOnlyUri = readEnv("CSP_REPORT_ONLY_URI");
  if (reportOnlyUri && !target.headers.has("Content-Security-Policy-Report-Only")) {
    const nonce = cspNonce ?? readCspNonce();
    target.headers.set(
      "Content-Security-Policy-Report-Only",
      buildEnforcedCsp(nonce, PRE_HYDRATION_SCRIPT_CSP_SOURCE, reportOnlyUri),
    );
  }

  return target;
}

/**
 * Set a response header only when it is not already present.
 *
 * A downstream route handler may have set a stricter value that we don't
 * want to overwrite (e.g. `Cache-Control: no-store` on an auth endpoint).
 * Absent header → we install our default; present header → we defer.
 */
function setIfAbsent(headers: Headers, name: string, value: string) {
  if (!headers.has(name)) headers.set(name, value);
}

/**
 * Safely read a `process.env` variable, returning `undefined` for missing,
 * blank, or whitespace-only values.
 *
 * Wrapped in a `try/catch` because on some Worker configurations without
 * `nodejs_compat` (and in a few test harnesses) `process` itself is not a
 * declared global and the property access throws a `ReferenceError`.
 *
 * @param name Environment variable name.
 * @returns The trimmed value, or `undefined` if unset / blank / unavailable.
 */
function readEnv(name: string): string | undefined {
  try {
    const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
    return value && value.trim().length > 0 ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}
