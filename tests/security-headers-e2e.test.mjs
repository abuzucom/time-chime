/**
 * End-to-end verification that HSTS, Referrer-Policy, and Permissions-Policy
 * are stamped on every response shape the Worker emits — SSR HTML routes,
 * static asset routes, and the server-function RPC boundary — not just on
 * the routes we happen to have hard-coded checks for.
 *
 * These headers are the OWASP ASVS §14.4 baseline; a regression here is a
 * silent posture downgrade because nothing in the app breaks visibly.
 *
 * Run:   node --test tests/security-headers-e2e.test.mjs
 * Base URL defaults to http://localhost:8080 (the sandbox dev server) and
 * can be overridden with BASE_URL — CI sets it to the preview build.
 *
 * The suite skips (rather than fails) when the target is unreachable, so
 * developers running `npm test` without a server up don't get spurious
 * failures. CI must run with a live server for the assertions to actually
 * execute.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

// One-time reachability probe so every downstream test gets a consistent
// skip decision instead of racing against connect timeouts.
let serverReachable = false;
before(async () => {
  try {
    const res = await fetch(BASE_URL + "/", { redirect: "manual" });
    // Anything that came back with headers proves the Worker is up — even
    // a 404 or 500 is fine, we're checking the middleware, not the route.
    serverReachable = res.status > 0;
  } catch {
    serverReachable = false;
  }
});

function skipUnlessReachable(t) {
  if (!serverReachable) {
    t.skip(`server at ${BASE_URL} unreachable — start the dev server or set BASE_URL`);
    return true;
  }
  return false;
}

/**
 * Assert that a given Response carries the three headers this suite exists
 * to guard, with values that match the exact policy declared in
 * src/lib/http/security-headers.ts. We match on structure (not full string
 * equality) so a tightening of the policy — e.g. adding another permission
 * denial — does not fail the test unless it actually weakens something.
 */
function assertBaselineSecurityHeaders(response, context) {
  const hsts = response.headers.get("strict-transport-security");
  assert.ok(hsts, `[${context}] Strict-Transport-Security missing`);
  assert.match(
    hsts,
    /max-age=\d{7,}/i,
    `[${context}] HSTS max-age must be at least 7 digits (≥ ~4 months); got "${hsts}"`,
  );
  assert.match(
    hsts,
    /includeSubDomains/i,
    `[${context}] HSTS must include includeSubDomains; got "${hsts}"`,
  );

  const referrer = response.headers.get("referrer-policy");
  assert.equal(
    referrer?.trim().toLowerCase(),
    "strict-origin-when-cross-origin",
    `[${context}] Referrer-Policy must be strict-origin-when-cross-origin; got "${referrer}"`,
  );

  const permissions = response.headers.get("permissions-policy");
  assert.ok(permissions, `[${context}] Permissions-Policy missing`);
  // Membership check on the four capabilities the compliance docs call out
  // by name (GDPR/CCPA-relevant sensor & tracking surfaces). Order-insensitive
  // because the header is a comma-separated directive set.
  const directives = new Set(
    permissions
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const required of ["camera=()", "microphone=()", "geolocation=()", "interest-cohort=()"]) {
    assert.ok(
      directives.has(required),
      `[${context}] Permissions-Policy missing directive "${required}"; full header: "${permissions}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// SSR HTML routes — the primary user-facing surface.
// ---------------------------------------------------------------------------

test("SSR home route stamps HSTS, Referrer-Policy, Permissions-Policy", async (t) => {
  if (skipUnlessReachable(t)) return;
  const res = await fetch(BASE_URL + "/", { redirect: "manual" });
  assertBaselineSecurityHeaders(res, "GET /");
});

test("SSR support route stamps the three baseline headers", async (t) => {
  if (skipUnlessReachable(t)) return;
  const res = await fetch(BASE_URL + "/support", { redirect: "manual" });
  assertBaselineSecurityHeaders(res, "GET /support");
});

test("Unmatched route (404 fallthrough) still stamps the baseline headers", async (t) => {
  if (skipUnlessReachable(t)) return;
  // A regression where the 404 path bypasses middleware would leave the
  // most-scanned surface (broken links, crawler probes) unhardened.
  const res = await fetch(
    BASE_URL + "/__e2e_nonexistent_" + Math.random().toString(36).slice(2),
    { redirect: "manual" },
  );
  assertBaselineSecurityHeaders(res, "GET /__e2e_nonexistent_*");
});

// ---------------------------------------------------------------------------
// Server function boundary.
// ---------------------------------------------------------------------------
//
// TanStack Start server functions live under `/_serverFn/<hash>` and use an
// internal RPC protocol — we don't invoke one with a fabricated body (the
// framework would reject the payload before middleware runs on the happy
// path). What we *can* prove is that the Worker's requestMiddleware chain
// (which owns the security headers) runs on responses coming out of that
// URL space, including error responses. A GET to a non-existent server-fn
// URL exercises the same middleware pipeline as a real RPC call.

test("Server-function URL space stamps the three baseline headers", async (t) => {
  if (skipUnlessReachable(t)) return;
  const res = await fetch(BASE_URL + "/_serverFn/nonexistent_for_header_e2e", {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assertBaselineSecurityHeaders(res, "POST /_serverFn/nonexistent_for_header_e2e");
});

// Static asset headers are enforced by the hosting-config /_headers file
// (see scripts/check-headers.mjs) rather than the Worker middleware, so
// they're covered by test:headers and intentionally not re-asserted here —
// running Vite dev serves static files off disk and would produce noisy
// false negatives.
